from __future__ import annotations

import json
import time
import os
import base64
from pathlib import Path
from typing import Any
from email.mime.text import MIMEText

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from agent import create_session, register_email_sender, send_message

load_dotenv()

#  In-process session store (swap for Redis in production) 
_sessions: dict[str, dict] = {}

# In-memory OAuth token store (sessionId -> credentials)
_oauth_tokens: dict[str, Credentials] = {}
_default_oauth_credentials: Credentials | None = None

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app = FastAPI(
    title="Drafter API",
    description="AI-powered document drafting assistant",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


#  Schemas 

class CreateSessionResponse(BaseModel):
    session_id: str


class SendMessageRequest(BaseModel):
    message: str
    document_title: str | None = "Untitled"


class SendMessageWithSelectionRequest(BaseModel):
    message: str
    document_title: str | None = "Untitled"
    selection_start: int
    selection_end: int
    selected_text: str


class SendMessageResponse(BaseModel):
    ai_response: str
    document_content: str
    undo_count: int
    redo_count: int
    last_saved_path: str
    last_saved_b64: str
    last_saved_format: str
    tool_calls_made: list[str]
    pending_email: dict[str, str] | None = None


class DocumentStateResponse(BaseModel):
    document_content: str
    document_title: str
    undo_count: int
    redo_count: int
    last_saved_path: str
    pending_email: dict[str, str] | None = None


class SaveDocumentRequest(BaseModel):
    format: str  # 'md', 'txt', 'docx', or 'pdf'


class SaveDocumentResponse(BaseModel):
    b64: str
    format: str
    message: str


class GmailStatusResponse(BaseModel):
    connected: bool


class PendingEmailActionResponse(BaseModel):
    success: bool
    message: str


class PendingEmailConfirmRequest(BaseModel):
    to: str | None = None
    subject: str | None = None
    body: str | None = None


def _send_email_with_session(session_id: str, to: str, subject: str, body: str) -> str:
    """Send email via Gmail API using OAuth token for session or shared login."""
    credentials = _oauth_tokens.get(session_id) or _default_oauth_credentials
    if not credentials:
        raise HTTPException(status_code=401, detail="Gmail not connected. Please authenticate first.")

    # Bind shared credentials to this session for faster future lookups.
    _oauth_tokens[session_id] = credentials

    try:
        service = build("gmail", "v1", credentials=credentials)

        message = MIMEText(body)
        message["to"] = to
        message["subject"] = subject

        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        send_result = service.users().messages().send(
            userId="me",
            body={"raw": raw_message}
        ).execute()

        return f"Email sent successfully! Message ID: {send_result.get('id')}"
    except HttpError as error:
        raise HTTPException(status_code=500, detail=f"Gmail API error: {str(error)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


# Let the AI tool in agent.py send emails through this callback.
register_email_sender(_send_email_with_session)


#  Routes 

@app.post("/sessions", response_model=CreateSessionResponse)
def create_new_session():
    sid = create_session()
    _sessions[sid] = {}
    return CreateSessionResponse(session_id=sid)


@app.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
def send_session_message(session_id: str, body: SendMessageRequest):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]

    # Inject title if provided
    if body.document_title and state:
        state["document_title"] = body.document_title
    elif body.document_title and not state:
        state = {"document_title": body.document_title}

    result = send_message(
        session_id=session_id,
        user_message=body.message,
        state=state,
    )

    _sessions[session_id] = result["state"]
    
    response = SendMessageResponse(
        ai_response=result["ai_response"],
        document_content=result["document_content"],
        undo_count=len(result.get("document_history", [])),
        redo_count=len(result.get("redo_stack", [])),
        last_saved_path=result["last_saved_path"],
        last_saved_b64=result.get("last_saved_b64", ""),
        last_saved_format=result.get("last_saved_format", ""),
        tool_calls_made=result["tool_calls_made"],
        pending_email=result.get("pending_email"),
    )
    
    return response


@app.get("/sessions/{session_id}/document", response_model=DocumentStateResponse)
def get_document(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    state = _sessions[session_id]
    return DocumentStateResponse(
        document_content=state.get("document_content", ""),
        document_title=state.get("document_title", "Untitled"),
        undo_count=len(state.get("document_history", [])),
        redo_count=len(state.get("redo_stack", [])),
        last_saved_path=state.get("last_saved_path", ""),
        pending_email=state.get("pending_email"),
    )


@app.post("/sessions/{session_id}/save", response_model=SaveDocumentResponse)
def save_document_endpoint(session_id: str, body: SaveDocumentRequest):
    """Save document and return base64 encoded file for download."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    state = _sessions[session_id]
    content = state.get("document_content", "")
    title = state.get("document_title", "Untitled")
    
    if not content.strip():
        raise HTTPException(status_code=400, detail="Document is empty")
    
    # Sanitize filename
    import re
    safe_title = re.sub(r"[^\w\-.]", "_", title).strip() or "document"
    
    # Validate format
    fmt = body.format.lower().lstrip(".")
    if fmt not in ("txt", "md", "docx", "pdf"):
        fmt = "md"
    
    # Save file to Documents folder
    OUTPUT_DIR = Path.home() / "Documents" / "Drafter_Documents"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / f"{safe_title}.{fmt}"
    
    try:
        if fmt == "docx":
            try:
                from docx import Document as DocxDoc
                doc = DocxDoc()
                doc.add_heading(title, 0)
                for para in content.split("\n\n"):
                    if para.strip():
                        doc.add_paragraph(para.strip())
                doc.save(str(filepath))
            except ImportError:
                # Fallback to markdown if docx not available
                fmt = "md"
                filepath = OUTPUT_DIR / f"{safe_title}.{fmt}"
                filepath.write_text(content, encoding="utf-8")
        elif fmt == "pdf":
            try:
                from reportlab.lib.pagesizes import A4
                from reportlab.lib.styles import getSampleStyleSheet
                from reportlab.lib.units import cm
                from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

                pdf = SimpleDocTemplate(
                    str(filepath),
                    pagesize=A4,
                    leftMargin=2.2 * cm,
                    rightMargin=2.2 * cm,
                    topMargin=2.2 * cm,
                    bottomMargin=2.2 * cm,
                )
                styles = getSampleStyleSheet()
                story = [Paragraph(title, styles["Title"]), Spacer(1, 10)]

                for line in content.split("\n"):
                    if line.strip():
                        story.append(Paragraph(line, styles["BodyText"]))
                    else:
                        story.append(Spacer(1, 6))

                pdf.build(story)
            except ImportError:
                # Fallback to markdown if reportlab not available
                fmt = "md"
                filepath = OUTPUT_DIR / f"{safe_title}.{fmt}"
                filepath.write_text(content, encoding="utf-8")
        else:
            # Save as text/markdown
            filepath.write_text(content, encoding="utf-8")
        
        # Base64 encode for browser download
        with open(filepath, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        
        if not b64:
            raise ValueError("Failed to encode file")
        
        # Update session state
        state["last_saved_b64"] = b64
        state["last_saved_format"] = fmt
        state["last_saved_path"] = str(filepath)
        
        message = f"Saved as {filepath.name}"
        
        return SaveDocumentResponse(
            b64=b64,
            format=fmt,
            message=message,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save document: {str(e)}")


@app.post("/sessions/{session_id}/messages-stream")
def send_session_message_stream(session_id: str, body: SendMessageRequest):
    """Streaming endpoint that yields text character by character."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]

    # Inject title if provided
    if body.document_title and state:
        state["document_title"] = body.document_title
    elif body.document_title and not state:
        state = {"document_title": body.document_title}

    # Get full response from agent
    result = send_message(
        session_id=session_id,
        user_message=body.message,
        state=state,
    )

    _sessions[session_id] = result["state"]
    
    def event_generator():
        # Yield tool calls first
        if result["tool_calls_made"]:
            yield f"data: {json.dumps({'type': 'tools', 'tools': result['tool_calls_made']})}\n\n"
        
        # Stream response character by character
        response_text = result["ai_response"]
        for char in response_text:
            chunk = {"type": "chunk", "text": char}
            yield f"data: {json.dumps(chunk)}\n\n"
            time.sleep(0.01)  # Small delay for natural streaming effect
        
        # Send completion with metadata
        completion = {
            "type": "complete",
            "document_content": result["document_content"],
            "undo_count": len(result.get("document_history", [])),
            "redo_count": len(result.get("redo_stack", [])),
            "last_saved_path": result["last_saved_path"],
            "pending_email": result.get("pending_email"),
        }
        yield f"data: {json.dumps(completion)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/sessions/{session_id}/messages-selection-stream")
def send_session_message_selection_stream(session_id: str, body: SendMessageWithSelectionRequest):
    """Streaming endpoint for editing only a selected portion of the document."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]

    # Inject title if provided
    if body.document_title and state:
        state["document_title"] = body.document_title
    elif body.document_title and not state:
        state = {"document_title": body.document_title}

    # Import the selection-aware function
    from agent import send_message_with_selection
    
    # Get full response from agent with selection context
    result = send_message_with_selection(
        session_id=session_id,
        user_message=body.message,
        state=state,
        selection_start=body.selection_start,
        selection_end=body.selection_end,
        selected_text=body.selected_text,
    )

    _sessions[session_id] = result["state"]
    
    def event_generator():
        # Yield tool calls first
        if result["tool_calls_made"]:
            yield f"data: {json.dumps({'type': 'tools', 'tools': result['tool_calls_made']})}\n\n"
        
        # Stream response character by character
        response_text = result["ai_response"]
        for char in response_text:
            chunk = {"type": "chunk", "text": char}
            yield f"data: {json.dumps(chunk)}\n\n"
            time.sleep(0.01)  # Small delay for natural streaming effect
        
        # Send completion with metadata
        completion = {
            "type": "complete",
            "document_content": result["document_content"],
            "undo_count": len(result.get("document_history", [])),
            "redo_count": len(result.get("redo_stack", [])),
            "last_saved_path": result["last_saved_path"],
            "pending_email": result.get("pending_email"),
        }
        yield f"data: {json.dumps(completion)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    _sessions.pop(session_id, None)
    return {"deleted": session_id}


@app.get("/health")
def health():
    return {"status": "ok", "sessions": len(_sessions)}



#  Gmail OAuth Routes 

@app.get("/auth/google/login")
def google_login(session_id: str):
    """Redirect to Google OAuth consent screen."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent select_account",
    )
    
    # Store session_id and PKCE verifier in state for callback
    _sessions[f"oauth_state_{state}"] = {
        "session_id": session_id,
        "code_verifier": getattr(flow, "code_verifier", None),
    }
    
    return RedirectResponse(url=authorization_url)


@app.get("/auth/google/callback")
def google_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Handle OAuth callback and store tokens."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}?gmail_error={error}")
    if not code or not state:
        return RedirectResponse(url=f"{FRONTEND_URL}?gmail_error=missing_code_or_state")
    
    # Retrieve session_id from state
    state_data = _sessions.get(f"oauth_state_{state}")
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    
    session_id = state_data["session_id"]
    code_verifier = state_data.get("code_verifier")
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )

    # Restore PKCE verifier generated during login step.
    if code_verifier:
        flow.code_verifier = code_verifier
    
    try:
        flow.fetch_token(code=code)
        credentials = flow.credentials
    except Exception as exc:
        # Avoid exposing internal traceback to user; return a clear marker to frontend.
        err = str(exc).replace(" ", "_")[:120]
        return RedirectResponse(url=f"{FRONTEND_URL}?gmail_error=token_exchange_failed:{err}")
    
    # Store credentials for this session and as default across sessions.
    global _default_oauth_credentials
    _oauth_tokens[session_id] = credentials
    _default_oauth_credentials = credentials
    
    # Clean up state
    _sessions.pop(f"oauth_state_{state}", None)
    
    # Redirect to frontend with success and bound session id.
    return RedirectResponse(url=f"{FRONTEND_URL}?gmail_connected=true&oauth_session_id={session_id}")


@app.get("/auth/google/status")
def google_status(session_id: str):
    """Check if Gmail is connected for this session."""
    connected = (session_id in _oauth_tokens) or (_default_oauth_credentials is not None)
    return GmailStatusResponse(connected=connected)


@app.post("/auth/google/disconnect")
def google_disconnect(session_id: str):
    """Disconnect Gmail and clear all in-memory OAuth credentials."""
    global _default_oauth_credentials

    _oauth_tokens.pop(session_id, None)
    _oauth_tokens.clear()
    _default_oauth_credentials = None

    return {"success": True, "message": "Gmail disconnected"}


@app.post("/sessions/{session_id}/email/confirm", response_model=PendingEmailActionResponse)
def confirm_pending_email(session_id: str, body: PendingEmailConfirmRequest | None = None):
    """Confirm and send pending email draft created by AI."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    pending = state.get("pending_email")
    if not pending:
        raise HTTPException(status_code=400, detail="No pending email to confirm")

    to = (body.to if body and body.to is not None else pending.get("to", "")).strip()
    subject = (body.subject if body and body.subject is not None else pending.get("subject", "")).strip()
    email_body = (body.body if body and body.body is not None else pending.get("body", "")).strip()

    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="Invalid recipient email")
    if not email_body:
        raise HTTPException(status_code=400, detail="Email body cannot be empty")

    message = _send_email_with_session(
        session_id=session_id,
        to=to,
        subject=subject,
        body=email_body,
    )

    state["pending_email"] = None
    return PendingEmailActionResponse(success=True, message=message)


@app.post("/sessions/{session_id}/email/cancel", response_model=PendingEmailActionResponse)
def cancel_pending_email(session_id: str):
    """Cancel pending email draft created by AI."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    if not state.get("pending_email"):
        return PendingEmailActionResponse(success=True, message="No pending email to cancel")

    state["pending_email"] = None
    return PendingEmailActionResponse(success=True, message="Pending email canceled")
