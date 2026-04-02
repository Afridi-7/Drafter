from __future__ import annotations

import base64
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Callable, Sequence, TypedDict
from dotenv import load_dotenv
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

load_dotenv()

# Save files to user's Documents folder, outside the repository
OUTPUT_DIR = Path.home() / "Documents" / "Drafter_Documents"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

_local = threading.local()


def _ctx() -> dict:
    if not hasattr(_local, "data"):
        _local.data = {
            "session_id": "",
            "document_content": "",
            "document_history": [],
            "redo_stack": [],
            "document_title": "Untitled",
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
            "pending_email": None,
        }
    return _local.data


_email_sender: Callable[[str, str, str, str], str] | None = None


def register_email_sender(sender: Callable[[str, str, str, str], str]) -> None:
    """Register callback used by send_email_via_gmail(session_id, to, subject, body)."""
    global _email_sender
    _email_sender = sender


def _push_history(new_content: str) -> None:
    ctx = _ctx()
    ctx["document_history"].append(ctx["document_content"])
    if len(ctx["document_history"]) > 50:
        ctx["document_history"].pop(0)
    ctx["redo_stack"].clear()
    ctx["document_content"] = new_content



# STATE

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    session_id: str
    document_content: str
    document_history: list[str]
    redo_stack: list[str]
    document_title: str
    last_saved_path: str
    last_saved_b64: str
    last_saved_format: str
    pending_email: dict[str, str] | None



# TOOLS


@tool
def update_document(content: str) -> str:
    """Replace the entire document with new content.
    Use when rewriting the whole document or starting a fresh draft.

    Args:
        content: The complete new document text (supports Markdown).
    """
    _push_history(content)
    wc = len(content.split())
    
    return f"✅ Document updated ({wc} words).\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def append_to_document(content: str) -> str:
    """Add content to the END of the document.
    Use for new paragraphs, sections, or conclusions.

    Args:
        content: Text to append.
    """
    ctx = _ctx()
    sep = "\n\n" if ctx["document_content"] else ""
    _push_history(ctx["document_content"] + sep + content)
    return f"✅ Content appended.\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def prepend_to_document(content: str) -> str:
    """Add content to the BEGINNING of the document.
    Use for titles, introductions, or executive summaries.

    Args:
        content: Text to prepend.
    """
    ctx = _ctx()
    sep = "\n\n" if ctx["document_content"] else ""
    _push_history(content + sep + ctx["document_content"])
    return f"✅ Content prepended.\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def replace_section(old_text: str, new_text: str) -> str:
    """Find and replace a specific passage in the document.
    Prefer this over update_document for targeted edits.

    Args:
        old_text: The exact text to find (case-insensitive fallback).
        new_text: The replacement text.
    """
    ctx = _ctx()
    doc = ctx["document_content"]
    if old_text in doc:
        new_doc = doc.replace(old_text, new_text, 1)
    else:
        pattern = re.compile(re.escape(old_text), re.IGNORECASE)
        if not pattern.search(doc):
            return "❌ Text not found. Ensure it matches exactly what's in the document."
        new_doc = pattern.sub(new_text, doc, count=1)
    _push_history(new_doc)
    return f"✅ Section replaced.\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def insert_after_section(heading: str, content: str) -> str:
    """Insert new content immediately after a specific heading or paragraph.
    Useful for adding subsections without rewriting the document.

    Args:
        heading: The heading or sentence after which to insert.
        content: The text to insert after the heading.
    """
    ctx = _ctx()
    doc = ctx["document_content"]
    idx = doc.find(heading)
    if idx == -1:
        return "❌ Heading not found. Check spelling and try again."
    insert_pos = idx + len(heading)
    new_doc = doc[:insert_pos] + "\n\n" + content + doc[insert_pos:]
    _push_history(new_doc)
    return f"✅ Content inserted.\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def replace_selected_text(selected_text: str, new_text: str, selection_start: int, selection_end: int) -> str:
    """Replace a selected portion of the document with new text.
    This is used for inline editing where only part of the document should be changed.
    
    Args:
        selected_text: The text that was selected by the user (for verification).
        new_text: The new text to replace the selection with.
        selection_start: Character position where selection starts.
        selection_end: Character position where selection ends.
    """
    ctx = _ctx()
    doc = ctx["document_content"]
    
    # Verify the selection matches what we expect
    actual_selection = doc[selection_start:selection_end]
    if actual_selection != selected_text:
        return f"Selection mismatch. Document may have changed. Expected:\n{selected_text}\n\nActual:\n{actual_selection}"
    
    # Replace only the selected portion
    new_doc = doc[:selection_start] + new_text + doc[selection_end:]
    _push_history(new_doc)
    
    word_count = len(new_text.split())
    return f"Selection replaced ({word_count} words in new text).\n\nCURRENT:\n{_ctx()['document_content']}"


@tool
def undo_last_change() -> str:
    """Undo the last change to the document. Can be called multiple times."""
    ctx = _ctx()
    if not ctx["document_history"]:
        return "❌ Nothing to undo."
    ctx["redo_stack"].append(ctx["document_content"])
    ctx["document_content"] = ctx["document_history"].pop()
    remaining = len(ctx["document_history"])
    return (
        f"↩️ Undone. {remaining} more undo(s) available.\n\n"
        f"CURRENT:\n{ctx['document_content']}"
    )


@tool
def redo_last_change() -> str:
    """Redo a previously undone change."""
    ctx = _ctx()
    if not ctx["redo_stack"]:
        return "❌ Nothing to redo."
    ctx["document_history"].append(ctx["document_content"])
    ctx["document_content"] = ctx["redo_stack"].pop()
    return f"↪️ Redone.\n\nCURRENT:\n{ctx['document_content']}"


@tool
def get_document_stats() -> str:
    """Return word count, character count, paragraph count, and reading time."""
    content = _ctx()["document_content"]
    if not content.strip():
        return "📄 Document is empty."
    words = len(content.split())
    chars = len(content)
    chars_ns = len(content.replace(" ", "").replace("\n", ""))
    paragraphs = len([p for p in content.split("\n\n") if p.strip()])
    sentences = len(re.findall(r"[.!?]+", content))
    read_time = max(1, round(words / 200))
    return (
        f"📊 Document Statistics\n"
        f"  Words      : {words:,}\n"
        f"  Characters : {chars:,}  ({chars_ns:,} without spaces)\n"
        f"  Paragraphs : {paragraphs}\n"
        f"  Sentences  : {sentences}\n"
        f"  Read time  : ~{read_time} min"
    )


@tool
def save_document(filename: str, format: str = "md") -> str:
    """Save the document to disk and prepare a download payload.

    Args:
        filename: Base name for the file (no extension).
        format: 'txt', 'md', 'docx', or 'pdf'. Default is 'md'.
    """
    ctx = _ctx()
    content = ctx["document_content"]
    title = ctx["document_title"]
    
    if not content.strip():
        return "❌ Cannot save — document is empty."

    safe = re.sub(r"[^\w\-_.]", "_", filename).strip() or (
        f"document_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    fmt = format.lower().lstrip(".")
    if fmt not in ("txt", "md", "docx", "pdf"):
        fmt = "md"

    filepath = OUTPUT_DIR / f"{safe}.{fmt}"

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
            fmt = "md"
            filepath = OUTPUT_DIR / f"{safe}.{fmt}"
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
            fmt = "md"
            filepath = OUTPUT_DIR / f"{safe}.{fmt}"
            filepath.write_text(content, encoding="utf-8")
    else:
        filepath.write_text(content, encoding="utf-8")

    # Base64 encode for browser download
    with open(filepath, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()

    # Update context
    ctx["last_saved_b64"] = b64
    ctx["last_saved_format"] = fmt
    ctx["last_saved_path"] = str(filepath)
    
    message = (
        f"💾 Saved!\n"
        f"   Path   : {filepath}\n"
        f"   Format : {fmt.upper()}\n"
        f"   Words  : {len(content.split()):,}"
    )
    
    return message


@tool
def send_email_via_gmail(to: str, subject: str = "", body: str = "") -> str:
    """Send an email using the session's connected Gmail account.

    If subject/body are omitted, document title/content are used.
    """
    ctx = _ctx()
    session_id = ctx.get("session_id", "")

    if not session_id:
        return "❌ No active session found for email sending."
    if _email_sender is None:
        return "❌ Gmail sender is not configured on server."
    if "@" not in to:
        return "❌ Invalid recipient email address."

    resolved_subject = (subject or "").strip() or ctx.get("document_title", "Draft from Drafter")
    resolved_body = (body or "").strip() or ctx.get("document_content", "")
    if not resolved_body:
        return "❌ Email body is empty. Add content to the document or provide a body explicitly."

    try:
        result_message = _email_sender(session_id, to.strip(), resolved_subject, resolved_body)
        ctx["pending_email"] = None
        return f"✅ {result_message}"
    except Exception as exc:
        return f"❌ Failed to send email: {exc}"


@tool
def prepare_email_send(to: str, subject: str = "", body: str = "") -> str:
    """Prepare an email draft and store it for confirmation in the UI before sending."""
    ctx = _ctx()
    if "@" not in to:
        return "❌ Invalid recipient email address."

    resolved_subject = (subject or "").strip() or ctx.get("document_title", "Draft from Drafter")
    resolved_body = (body or "").strip() or ctx.get("document_content", "")
    if not resolved_body:
        return "❌ Email body is empty. Add content to the document or provide a body explicitly."

    ctx["pending_email"] = {
        "to": to.strip(),
        "subject": resolved_subject,
        "body": resolved_body,
    }

    preview = resolved_body[:160] + ("..." if len(resolved_body) > 160 else "")
    return (
        "📨 Email draft is ready for confirmation.\n"
        f"To: {to.strip()}\n"
        f"Subject: {resolved_subject}\n"
        f"Body preview: {preview}\n"
        "Please confirm send in the popup."
    )


@tool
def cancel_pending_email() -> str:
    """Cancel any pending email draft waiting for confirmation."""
    ctx = _ctx()
    if not ctx.get("pending_email"):
        return "ℹ️ No pending email draft to cancel."
    ctx["pending_email"] = None
    return "✅ Pending email draft canceled."


#  Tool registry 
TOOLS = [
    update_document,
    append_to_document,
    prepend_to_document,
    replace_section,
    insert_after_section,
    undo_last_change,
    redo_last_change,
    get_document_stats,
    save_document,
    replace_selected_text,
    prepare_email_send,
    cancel_pending_email,
]
#  Tool registry 
#  State sync functions 

def _sync_ctx_from_state(state: AgentState) -> None:
    """Sync thread-local context from state dict."""
    ctx = _ctx()
    ctx["session_id"] = state.get("session_id", "")
    ctx["document_content"] = state.get("document_content", "")
    ctx["document_history"] = list(state.get("document_history", []))
    ctx["redo_stack"] =list(state.get("redo_stack", []))
    ctx["document_title"] = state.get("document_title", "Untitled")
    ctx["last_saved_path"] = state.get("last_saved_path", "")
    ctx["last_saved_b64"] = state.get("last_saved_b64", "")
    ctx["last_saved_format"] = state.get("last_saved_format", "")
    ctx["pending_email"] = state.get("pending_email", None)


def _sync_state_from_ctx() -> dict:
    """Sync state dict from thread-local context."""
    ctx = _ctx()
    return {
        "session_id": ctx["session_id"],
        "document_content": ctx["document_content"],
        "document_history": ctx["document_history"],
        "redo_stack": ctx["redo_stack"],
        "document_title": ctx["document_title"],
        "last_saved_path": ctx["last_saved_path"],
        "last_saved_b64": ctx["last_saved_b64"],
        "last_saved_format": ctx["last_saved_format"],
        "pending_email": ctx.get("pending_email", None),
    }



# AGENT

_base_model = ChatOpenAI(model="gpt-4o", temperature=1)
_model = _base_model.bind_tools(TOOLS)

def agent_node(state: AgentState) -> dict:
    _sync_ctx_from_state(state)
    ctx = _ctx()

    doc = ctx["document_content"]
    preview = doc[:3000] + "\n… [truncated]" if len(doc) > 3000 else doc
    history_info = (
        f"{len(ctx['document_history'])} version(s) available for undo"
        if ctx["document_history"]
        else "No undo history yet"
    )

    system = SystemMessage(
        content=f"""You are Drafter — an expert writing assistant. Your PRIMARY JOB is to write content into a document using your tools.

═══ CURRENT DOCUMENT ═══
{preview if preview else "(empty — awaiting content)"}
═══════════════════════

DOCUMENT INFO:
• Title   : {ctx['document_title']}
• Words   : {len(doc.split()) if doc else 0}
• History : {history_info}
• Redo    : {len(ctx['redo_stack'])} version(s) available

🔧 YOUR TOOLS (YOU MUST USE THESE):
• update_document(content)         → Replace entire document with new content
• append_to_document(content)      → Add content to the end
• prepend_to_document(content)     → Add content to the beginning
• replace_section(old, new)        → Find and replace specific text
• insert_after_section(h, content) → Insert after a heading
• replace_selected_text(s, new, start, end) → Replace user selection
• undo_last_change()               → Undo last change
• redo_last_change()               → Redo last change
• get_document_stats()             → Get word count, reading time
• save_document(name, format)      → Save as .txt, .md, .docx, or .pdf
• prepare_email_send(to, subject, body) → Create a pending email draft for confirmation popup
• cancel_pending_email()           → Cancel pending email draft
• send_email_via_gmail(to, subject, body) → Direct send (use only if user explicitly asks to skip confirmation)

⚠️ CRITICAL RULES - READ CAREFULLY:
1. **YOU MUST USE TOOLS TO WRITE CONTENT** - When the user asks you to write, draft, create, or generate ANY content (emails, letters, blog posts, etc.), you MUST call update_document() or append_to_document() with the ACTUAL content. DO NOT just describe what you would write - WRITE IT using the tool!

2. **EXAMPLE - CORRECT BEHAVIOR**:
   User: "Write an email about sick leave"
   YOU MUST DO: Call update_document(content="Subject: Sick Leave Request\n\nDear [Manager's Name]...")
   Then respond: "I've drafted your sick leave email. You can see it in the document panel."
  • replace_selected_text(selected_text, new_text, selection_start, selection_end) → Replace a user-selected portion (inline editing)
 
3. **EXAMPLE - WRONG BEHAVIOR** (DO NOT DO THIS):
   User: "Write an email about sick leave"
   WRONG: Just responding "I've drafted an email..." without calling any tool
   
4. The user can ONLY see content that you put in the document using tools. If you don't call a tool, they see nothing!

5. After calling a tool, briefly confirm what you did and suggest next steps.

6. When user asks to save/download, call save_document with appropriate format.
7. When user asks to send email, call prepare_email_send first so user can confirm in popup.
8. Use send_email_via_gmail only if user explicitly says to send immediately without confirmation.
9. Use Markdown formatting in your content for better readability.

REMEMBER: Your tools are how you actually create content for the user. Always use them when writing!
"""
    )

    response = _model.invoke([system] + list(state["messages"]))
    result = {"messages": [response], **_sync_state_from_ctx()}
    return result


def tools_node(state: AgentState) -> dict:
    """Execute the tools called by the agent."""

    tool_messages = []
    last_message = state["messages"][-1] if state["messages"] else None
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]
            
            # Find and execute the tool
            tool_func = next((t for t in TOOLS if t.name == tool_name), None)
            if tool_func:
                try:
                    result = tool_func.invoke(tool_args)
                    tool_messages.append(
                        ToolMessage(content=str(result), tool_call_id=tool_id)
                    )
                except Exception as e:
                    tool_messages.append(
                        ToolMessage(content=f"Error: {str(e)}", tool_call_id=tool_id)
                    )
    
    # Sync state from context (after tools have run)
    sync_data = _sync_state_from_ctx()
    
    return {
        "messages": tool_messages,
        **sync_data
    }


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1] if state["messages"] else None
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END



# GRAPH ASSEMBLY

def _build_graph():
    g = StateGraph(AgentState)
    g.add_node("agent", agent_node)
    g.add_node("tools", tools_node)
    g.set_entry_point("agent")
    g.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    g.add_edge("tools", "agent")
    memory = MemorySaver()
    return g.compile(checkpointer=memory)


_graph = _build_graph()


# PUBLIC API

def create_session() -> str:
    return str(uuid.uuid4())


def send_message(
    session_id: str,
    user_message: str,
    state: dict,
) -> dict[str, Any]:
    """
    Send one user message and return the updated state and response.
    
    Args:
        session_id: Unique session identifier
        user_message: The user's message
        state: Current session state dict
    
    Returns:
        Dict with keys:
        - ai_response: Text response from the AI
        - document_content: Current document content
        - document_history: Undo history
        - redo_stack: Redo stack
        - last_saved_path: Path if just saved
        - last_saved_b64: Base64 file data for browser download
        - last_saved_format: File extension
        - tool_calls_made: List of tool names used
        - state: Full updated state for next call
    """
    # Initialize state with defaults if empty or missing fields
    if not state or "messages" not in state:
        state = {
            "messages": [],
            "session_id": session_id,
            "document_content": "",
            "document_history": [],
            "redo_stack": [],
            "document_title": "Untitled",
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
            "pending_email": None,
        }
    
    # Ensure all required fields exist in state
    state.setdefault("session_id", session_id)
    state.setdefault("document_content", "")
    state.setdefault("document_history", [])
    state.setdefault("redo_stack", [])
    state.setdefault("document_title", "Untitled")
    state.setdefault("last_saved_path", "")
    state.setdefault("last_saved_b64", "")
    state.setdefault("last_saved_format", "")
    state.setdefault("pending_email", None)

    initial_document_content = state.get("document_content", "")
    
    # Initialize context for this session
    _local.data = {
        "session_id": session_id,
        "document_content": state.get("document_content", ""),
        "document_history": list(state.get("document_history", [])),
        "redo_stack": list(state.get("redo_stack", [])),
        "document_title": state.get("document_title", "Untitled"),
        "last_saved_path": state.get("last_saved_path", ""),
        "last_saved_b64": state.get("last_saved_b64", ""),
        "last_saved_format": state.get("last_saved_format", ""),
        "pending_email": state.get("pending_email", None),
    }

    state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=user_message)
    ]

    config = {"configurable": {"thread_id": session_id}}

    final_state: dict | None = None
    for step in _graph.stream(state, config=config, stream_mode="values"):
        final_state = step

    if final_state is None:
        return {
            "ai_response": "Something went wrong. Please try again.",
            "document_content": state.get("document_content", ""),
            "document_history": state.get("document_history", []),
            "redo_stack": state.get("redo_stack", []),
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
            "tool_calls_made": [],
            "state": state,
        }


    
    ai_response = ""
    tool_calls_made: list[str] = []
    for msg in reversed(final_state["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            ai_response = msg.content
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                tool_calls_made = [tc["name"] for tc in msg.tool_calls]
            break

    # Keep chat concise when the assistant updated the document via tools.
    document_edit_tools = {
        "update_document",
        "append_to_document",
        "prepend_to_document",
        "replace_section",
        "insert_after_section",
        "replace_selected_text",
    }
    if any(t in document_edit_tools for t in tool_calls_made):
        ai_response = "✅ Updated the document. Review it in the document panel."


    final_document_content = final_state.get("document_content", "")
    if final_document_content != initial_document_content:
        ai_response = "✅ Updated the document. Review it in the document panel."

    # Guarantee popup workflow for send-email intents, even if model skipped tool call.
    if not final_state.get("pending_email"):
        lower_msg = user_message.lower()
        wants_email = ("send" in lower_msg and "email" in lower_msg) or ("email" in lower_msg and "to " in lower_msg)
        if wants_email:
            email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", user_message)
            if email_match:
                to = email_match.group(0)
                subject = final_state.get("document_title", "Draft from Drafter")
                body = final_state.get("document_content", "")
                if body:
                    final_state["pending_email"] = {
                        "to": to,
                        "subject": subject,
                        "body": body,
                    }
                    if "prepare_email_send" not in tool_calls_made:
                        tool_calls_made.append("prepare_email_send(auto)")
                    ai_response = "I've prepared the email for you. Please confirm the send in the popup."
    

    result = {
        "ai_response": ai_response,
        "document_content": final_state.get("document_content", ""),
        "document_history": final_state.get("document_history", []),
        "redo_stack": final_state.get("redo_stack", []),
        "last_saved_path": final_state.get("last_saved_path", ""),
        "last_saved_b64": final_state.get("last_saved_b64", ""),
        "last_saved_format": final_state.get("last_saved_format", ""),
        "pending_email": final_state.get("pending_email", None),
        "tool_calls_made": tool_calls_made,
        "state": final_state,
    }
    return result


def send_message_with_selection(
    session_id: str,
    user_message: str,
    state: dict,
    selection_start: int | None = None,
    selection_end: int | None = None,
    selected_text: str | None = None,
) -> dict[str, Any]:
    """
    Send a message with optional text selection context for AI editing.
    
    Args:
        session_id: Unique session identifier
        user_message: The user's message/instruction
        state: Current session state dict
        selection_start: Start index of selected text (optional)
        selection_end: End index of selected text (optional)
        selected_text: The actual selected text (optional)
    
    Returns:
        Same as send_message()
    """
    # If selection is provided, augment the message with context
    if selected_text and selection_start is not None and selection_end is not None:
        enhanced_message = (
            f"{user_message}\n\n"
            f"[SELECTION CONTEXT]\n"
            f"The user has selected text from position {selection_start} to {selection_end}:\n"
            f'"""{selected_text}"""\n\n'
            f"Please apply the instruction specifically to this selected portion of the document."
        )
    else:
        enhanced_message = user_message
    
    # Delegate to the main send_message function
    return send_message(session_id, enhanced_message, state)

