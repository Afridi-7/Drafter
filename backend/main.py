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
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

    return SendMessageResponse(
        ai_response=result["ai_response"],
        document_content=result["document_content"],
        undo_count=len(result.get("document_history", [])),
        redo_count=len(result.get("redo_stack", [])),
        last_saved_path=result["last_saved_path"],
        last_saved_b64=result.get("last_saved_b64", ""),
        last_saved_format=result.get("last_saved_format", ""),
        tool_calls_made=result["tool_calls_made"],
    )


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


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    _sessions.pop(session_id, None)
    return {"deleted": session_id}


@app.get("/health")
def health():
    return {"status": "ok", "sessions": len(_sessions)}
