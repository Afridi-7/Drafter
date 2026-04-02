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
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/google/callback")
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _parse_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [o.strip() for o in configured.split(",") if o.strip()]
    if not origins:
        origins = ["http://localhost:5173", "http://localhost:3000"]
    if FRONTEND_URL and FRONTEND_URL not in origins:
        origins.append(FRONTEND_URL)
    return origins

app = FastAPI(
    title="Drafter API",
    description="AI-powered document drafting assistant",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
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
    document_id: str | None = None
    document_content: str
    document_title: str
    undo_count: int
    redo_count: int
    last_saved_path: str
    pending_email: dict[str, str] | None = None


class DocumentInfo(BaseModel):
    id: str
    title: str
    updated_at: float


class DocumentsResponse(BaseModel):
    documents: list[DocumentInfo]
    active_document_id: str


class CreateDocumentRequest(BaseModel):
    title: str | None = None


class SwitchDocumentRequest(BaseModel):
    document_id: str


class SyncDocumentRequest(BaseModel):
    title: str | None = None
    content: str | None = None


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


def _ensure_multi_document_state(state: dict) -> dict:
    """Ensure session state has multi-document structure and return active document dict."""
    if "documents" not in state or "active_document_id" not in state:
        default_id = "doc-1"
        state["documents"] = {
            default_id: {
                "id": default_id,
                "document_content": state.get("document_content", ""),
                "document_title": state.get("document_title", "Untitled"),
                "document_history": list(state.get("document_history", [])),
                "redo_stack": list(state.get("redo_stack", [])),
                "last_saved_path": state.get("last_saved_path", ""),
                "last_saved_b64": state.get("last_saved_b64", ""),
                "last_saved_format": state.get("last_saved_format", ""),
                "pending_email": state.get("pending_email", None),
                "updated_at": time.time(),
            }
        }
        state["document_order"] = [default_id]
        state["active_document_id"] = default_id

    active_id = state.get("active_document_id")
    documents = state.get("documents", {})
    if not active_id or active_id not in documents:
        order = state.get("document_order", [])
        if order:
            active_id = order[0]
        elif documents:
            active_id = next(iter(documents.keys()))
        else:
            active_id = "doc-1"
            documents[active_id] = {
                "id": active_id,
                "document_content": "",
                "document_title": "Untitled",
                "document_history": [],
                "redo_stack": [],
                "last_saved_path": "",
                "last_saved_b64": "",
                "last_saved_format": "",
                "pending_email": None,
                "updated_at": time.time(),
            }
            state["document_order"] = [active_id]
        state["active_document_id"] = active_id

    return documents[active_id]


def _active_document_to_agent_state(session_id: str, state: dict) -> dict:
    doc = _ensure_multi_document_state(state)
    return {
        "session_id": session_id,
        "messages": list(state.get("messages", [])),
        "document_content": doc.get("document_content", ""),
        "document_title": doc.get("document_title", "Untitled"),
        "document_history": list(doc.get("document_history", [])),
        "redo_stack": list(doc.get("redo_stack", [])),
        "last_saved_path": doc.get("last_saved_path", ""),
        "last_saved_b64": doc.get("last_saved_b64", ""),
        "last_saved_format": doc.get("last_saved_format", ""),
        "pending_email": doc.get("pending_email", None),
    }


def _merge_agent_result_into_session(state: dict, result_state: dict) -> None:
    doc = _ensure_multi_document_state(state)
    doc["document_content"] = result_state.get("document_content", "")
    doc["document_title"] = result_state.get("document_title", "Untitled")
    doc["document_history"] = list(result_state.get("document_history", []))
    doc["redo_stack"] = list(result_state.get("redo_stack", []))
    doc["last_saved_path"] = result_state.get("last_saved_path", "")
    doc["last_saved_b64"] = result_state.get("last_saved_b64", "")
    doc["last_saved_format"] = result_state.get("last_saved_format", "")
    doc["pending_email"] = result_state.get("pending_email", None)
    doc["updated_at"] = time.time()

    state["messages"] = list(result_state.get("messages", state.get("messages", [])))

    # Keep legacy top-level fields mirrored for compatibility.
    state["document_content"] = doc["document_content"]
    state["document_title"] = doc["document_title"]
    state["document_history"] = doc["document_history"]
    state["redo_stack"] = doc["redo_stack"]
    state["last_saved_path"] = doc["last_saved_path"]
    state["last_saved_b64"] = doc["last_saved_b64"]
    state["last_saved_format"] = doc["last_saved_format"]
    state["pending_email"] = doc["pending_email"]


def _document_state_response(session_state: dict) -> DocumentStateResponse:
    doc = _ensure_multi_document_state(session_state)
    return DocumentStateResponse(
        document_id=session_state.get("active_document_id"),
        document_content=doc.get("document_content", ""),
        document_title=doc.get("document_title", "Untitled"),
        undo_count=len(doc.get("document_history", [])),
        redo_count=len(doc.get("redo_stack", [])),
        last_saved_path=doc.get("last_saved_path", ""),
        pending_email=doc.get("pending_email"),
    )


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
    _sessions[sid] = {
        "messages": [],
        "documents": {
            "doc-1": {
                "id": "doc-1",
                "document_content": "",
                "document_title": "Untitled",
                "document_history": [],
                "redo_stack": [],
                "last_saved_path": "",
                "last_saved_b64": "",
                "last_saved_format": "",
                "pending_email": None,
                "updated_at": time.time(),
            }
        },
        "document_order": ["doc-1"],
        "active_document_id": "doc-1",
    }
    return CreateSessionResponse(session_id=sid)


@app.get("/sessions/{session_id}/documents", response_model=DocumentsResponse)
def list_documents(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    _ensure_multi_document_state(state)
    documents = state.get("documents", {})
    order = state.get("document_order", list(documents.keys()))
    infos: list[DocumentInfo] = []
    for doc_id in order:
        doc = documents.get(doc_id)
        if not doc:
            continue
        infos.append(
            DocumentInfo(
                id=doc_id,
                title=doc.get("document_title", "Untitled"),
                updated_at=float(doc.get("updated_at", 0.0)),
            )
        )

    return DocumentsResponse(
        documents=infos,
        active_document_id=state.get("active_document_id", infos[0].id if infos else "doc-1"),
    )


@app.post("/sessions/{session_id}/documents", response_model=DocumentStateResponse)
def create_document(session_id: str, body: CreateDocumentRequest | None = None):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    _ensure_multi_document_state(state)
    doc_id = f"doc-{int(time.time() * 1000)}"
    title = (body.title.strip() if body and body.title else "") or "Untitled"
    state["documents"][doc_id] = {
        "id": doc_id,
        "document_content": "",
        "document_title": title,
        "document_history": [],
        "redo_stack": [],
        "last_saved_path": "",
        "last_saved_b64": "",
        "last_saved_format": "",
        "pending_email": None,
        "updated_at": time.time(),
    }
    state.setdefault("document_order", []).append(doc_id)
    state["active_document_id"] = doc_id
    return _document_state_response(state)


@app.post("/sessions/{session_id}/documents/switch", response_model=DocumentStateResponse)
def switch_document(session_id: str, body: SwitchDocumentRequest):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    _ensure_multi_document_state(state)
    if body.document_id not in state.get("documents", {}):
        raise HTTPException(status_code=404, detail="Document not found")

    state["active_document_id"] = body.document_id
    return _document_state_response(state)


@app.put("/sessions/{session_id}/documents/{document_id}", response_model=DocumentStateResponse)
def sync_document(session_id: str, document_id: str, body: SyncDocumentRequest):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    _ensure_multi_document_state(state)
    doc = state.get("documents", {}).get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.title is not None:
        doc["document_title"] = body.title.strip() or "Untitled"
    if body.content is not None:
        doc["document_content"] = body.content
    doc["updated_at"] = time.time()

    if state.get("active_document_id") == document_id:
        state["document_title"] = doc.get("document_title", "Untitled")
        state["document_content"] = doc.get("document_content", "")

    return _document_state_response(state)


@app.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
def send_session_message(session_id: str, body: SendMessageRequest):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    _ensure_multi_document_state(state)
    active_doc = _ensure_multi_document_state(state)

    # Inject title if provided
    if body.document_title:
        active_doc["document_title"] = body.document_title

    result = send_message(
        session_id=session_id,
        user_message=body.message,
        state=_active_document_to_agent_state(session_id, state),
    )

    _merge_agent_result_into_session(state, result["state"])
    
    response = SendMessageResponse(
        ai_response=result["ai_response"],
        document_content=active_doc.get("document_content", ""),
        undo_count=len(active_doc.get("document_history", [])),
        redo_count=len(active_doc.get("redo_stack", [])),
        last_saved_path=active_doc.get("last_saved_path", ""),
        last_saved_b64=result.get("last_saved_b64", ""),
        last_saved_format=result.get("last_saved_format", ""),
        tool_calls_made=result["tool_calls_made"],
        pending_email=active_doc.get("pending_email"),
    )
    
    return response


@app.get("/sessions/{session_id}/document", response_model=DocumentStateResponse)
def get_document(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return _document_state_response(_sessions[session_id])


@app.post("/sessions/{session_id}/save", response_model=SaveDocumentResponse)
def save_document_endpoint(session_id: str, body: SaveDocumentRequest):
    """Save document and return base64 encoded file for download."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    state = _sessions[session_id]
    doc = _ensure_multi_document_state(state)
    content = doc.get("document_content", "")
    title = doc.get("document_title", "Untitled")
    
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
        doc["last_saved_b64"] = b64
        doc["last_saved_format"] = fmt
        doc["last_saved_path"] = str(filepath)
        doc["updated_at"] = time.time()
        
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
    _ensure_multi_document_state(state)
    active_doc = _ensure_multi_document_state(state)

    # Inject title if provided
    if body.document_title:
        active_doc["document_title"] = body.document_title

    # Get full response from agent
    result = send_message(
        session_id=session_id,
        user_message=body.message,
        state=_active_document_to_agent_state(session_id, state),
    )

    _merge_agent_result_into_session(state, result["state"])
    
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
            "document_content": active_doc.get("document_content", ""),
            "undo_count": len(active_doc.get("document_history", [])),
            "redo_count": len(active_doc.get("redo_stack", [])),
            "last_saved_path": active_doc.get("last_saved_path", ""),
            "pending_email": active_doc.get("pending_email"),
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
    _ensure_multi_document_state(state)
    active_doc = _ensure_multi_document_state(state)

    # Inject title if provided
    if body.document_title:
        active_doc["document_title"] = body.document_title

    # Import the selection-aware function
    from agent import send_message_with_selection
    
    # Get full response from agent with selection context
    result = send_message_with_selection(
        session_id=session_id,
        user_message=body.message,
        state=_active_document_to_agent_state(session_id, state),
        selection_start=body.selection_start,
        selection_end=body.selection_end,
        selected_text=body.selected_text,
    )

    _merge_agent_result_into_session(state, result["state"])
    
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
            "document_content": active_doc.get("document_content", ""),
            "undo_count": len(active_doc.get("document_history", [])),
            "redo_count": len(active_doc.get("redo_stack", [])),
            "last_saved_path": active_doc.get("last_saved_path", ""),
            "pending_email": active_doc.get("pending_email"),
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
    doc = _ensure_multi_document_state(state)
    pending = doc.get("pending_email")
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

    doc["pending_email"] = None
    doc["updated_at"] = time.time()
    return PendingEmailActionResponse(success=True, message=message)


@app.post("/sessions/{session_id}/email/cancel", response_model=PendingEmailActionResponse)
def cancel_pending_email(session_id: str):
    """Cancel pending email draft created by AI."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    state = _sessions[session_id]
    doc = _ensure_multi_document_state(state)
    if not doc.get("pending_email"):
        return PendingEmailActionResponse(success=True, message="No pending email to cancel")

    doc["pending_email"] = None
    doc["updated_at"] = time.time()
    return PendingEmailActionResponse(success=True, message="Pending email canceled")
