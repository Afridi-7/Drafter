"""
drafter/backend/main.py
=======================
FastAPI server exposing the Drafter agent over HTTP + SSE streaming.

Endpoints:
  POST /sessions                  → create new session
  POST /sessions/{id}/messages    → send message, get full response
  GET  /sessions/{id}/document    → get current document state
  DELETE /sessions/{id}           → clear a session

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import pickle
import json
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent import create_session, send_message

# ── In-process session store (swap for Redis in production) ───────────────────
_sessions: dict[str, dict] = {}

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


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateSessionResponse(BaseModel):
    session_id: str


class SendMessageRequest(BaseModel):
    message: str
    document_title: str | None = "Untitled"


class SendMessageResponse(BaseModel):
    ai_response: str
    document_content: str
    undo_count: int
    redo_count: int
    last_saved_path: str
    last_saved_b64: str
    last_saved_format: str
    tool_calls_made: list[str]


class DocumentStateResponse(BaseModel):
    document_content: str
    document_title: str
    undo_count: int
    redo_count: int
    last_saved_path: str


class SaveDocumentRequest(BaseModel):
    format: str  # 'md', 'txt', or 'docx'


class SaveDocumentResponse(BaseModel):
    b64: str
    format: str
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

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
    )


@app.post("/sessions/{session_id}/save", response_model=SaveDocumentResponse)
def save_document(session_id: str, body: SaveDocumentRequest):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    state = _sessions[session_id]
    content = state.get("document_content", "")
    title = state.get("document_title", "Untitled")
    
    # Send message to agent to save the document
    from agent import save_document as agent_save_doc, _ctx
    
    # Call the save tool directly - it will handle file creation and base64 encoding
    result_msg = agent_save_doc(content, title, body.format)
    
    # Get the context which has the base64 data
    ctx = _ctx()
    b64 = ctx.get("last_saved_b64", "")
    fmt = ctx.get("last_saved_format", body.format)
    
    # Update session state with the saved info
    state["last_saved_path"] = ctx.get("last_saved_path", "")
    state["last_saved_b64"] = b64
    state["last_saved_format"] = fmt
    
    return SaveDocumentResponse(
        b64=b64,
        format=fmt,
        message=result_msg,
    )


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
