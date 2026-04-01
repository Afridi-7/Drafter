from __future__ import annotations

import base64
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Sequence, TypedDict

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
from langgraph.prebuilt import ToolNode

load_dotenv()

# Save files to user's Documents folder, outside the repository
OUTPUT_DIR = Path.home() / "Documents" / "Drafter_Documents"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

#  Thread-local context (safe for concurrent requests) 
_local = threading.local()


def _ctx() -> dict:
    if not hasattr(_local, "data"):
        _local.data = {
            "document_content": "",
            "document_history": [],
            "redo_stack": [],
            "document_title": "Untitled",
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
        }
    return _local.data


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
    document_content: str
    document_history: list[str]
    redo_stack: list[str]
    document_title: str
    last_saved_path: str
    last_saved_b64: str
    last_saved_format: str



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


def _save_document_helper(content: str, title: str, filename: str, format: str = "md") -> tuple[str, str, str]:
    """Helper function to save document and return (base64, format, message).
    
    Args:
        content: Document content to save
        title: Document title
        filename: Base name for the file (no extension)
        format: 'txt', 'md', 'docx', or 'pdf'. Default is 'md'
        
    Returns:
        Tuple of (base64_string, actual_format, message)
    """
    if not content.strip():
        raise ValueError("Cannot save — document is empty.")

    safe = re.sub(r"[^\w\-_\. ]", "_", filename).strip() or (
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
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

            doc_pdf = SimpleDocTemplate(
                str(filepath),
                pagesize=A4,
                leftMargin=2.5*cm, rightMargin=2.5*cm,
                topMargin=2.5*cm, bottomMargin=2.5*cm,
            )
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                "DocTitle", parent=styles["Heading1"],
                fontSize=20, spaceAfter=18, textColor=colors.HexColor("#0d0d0d"),
            )
            body_style = ParagraphStyle(
                "DocBody", parent=styles["Normal"],
                fontSize=11, leading=18, spaceAfter=10,
                textColor=colors.HexColor("#1a1a1a"),
            )
            h2_style = ParagraphStyle(
                "DocH2", parent=styles["Heading2"],
                fontSize=14, spaceAfter=8, spaceBefore=14,
                textColor=colors.HexColor("#111111"),
            )

            story = [Paragraph(title, title_style)]
            for line in content.split("\n"):
                stripped = line.strip()
                if not stripped:
                    story.append(Spacer(1, 6))
                elif stripped.startswith("## "):
                    story.append(Paragraph(stripped[3:], h2_style))
                elif stripped.startswith("# "):
                    story.append(Paragraph(stripped[2:], title_style))
                else:
                    # strip basic markdown bold/italic for PDF
                    clean = re.sub(r"\*\*(.+?)\*\*", r"\1", stripped)
                    clean = re.sub(r"\*(.+?)\*", r"\1", clean)
                    story.append(Paragraph(clean, body_style))

            doc_pdf.build(story)
        except ImportError:
            fmt = "md"
            filepath = OUTPUT_DIR / f"{safe}.{fmt}"
            filepath.write_text(content, encoding="utf-8")
    else:
        filepath.write_text(content, encoding="utf-8")

    # Base64 encode for browser download
    with open(filepath, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()

    message = (
        f"💾 Saved!\n"
        f"   Path   : {filepath}\n"
        f"   Format : {fmt.upper()}\n"
        f"   Words  : {len(content.split()):,}"
    )
    
    return b64, fmt, message


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
    
    try:
        b64, fmt, message = _save_document_helper(content, title, filename, format)
        
        # Update context
        ctx["last_saved_b64"] = b64
        ctx["last_saved_format"] = fmt
        ctx["last_saved_path"] = str(OUTPUT_DIR / f"{filename}.{fmt}")
        
        return message
    except ValueError as e:
        return f"❌ {str(e)}"


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
        return f"❌ Selection mismatch. Document may have changed. Expected:\n{selected_text}\n\nActual:\n{actual_selection}"
    
    # Replace only the selected portion
    new_doc = doc[:selection_start] + new_text + doc[selection_end:]
    _push_history(new_doc)
    
    word_count = len(new_text.split())
    return f"✅ Selection replaced ({word_count} words in new text).\n\nCURRENT:\n{_ctx()['document_content']}"


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
]

#  Model 
_model = ChatOpenAI(
    model="gpt-4o",
    temperature=0.7,
    streaming=False,  # streaming handled at API layer
).bind_tools(TOOLS, tool_choice="auto")



# GRAPH NODES

def _sync_ctx_from_state(state: AgentState) -> None:
    ctx = _ctx()
    ctx["document_content"] = state.get("document_content", "")
    ctx["document_history"] = list(state.get("document_history", []))
    ctx["redo_stack"] = list(state.get("redo_stack", []))
    ctx["document_title"] = state.get("document_title", "Untitled")
    ctx["last_saved_path"] = state.get("last_saved_path", "")
    ctx["last_saved_b64"] = state.get("last_saved_b64", "")
    ctx["last_saved_format"] = state.get("last_saved_format", "")


def _sync_state_from_ctx() -> dict:
    ctx = _ctx()
    return {
        "document_content": ctx["document_content"],
        "document_history": list(ctx["document_history"]),
        "redo_stack": list(ctx["redo_stack"]),
        "last_saved_path": ctx["last_saved_path"],
        "last_saved_b64": ctx["last_saved_b64"],
        "last_saved_format": ctx["last_saved_format"],
    }


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
• update_document(content)      → Replace entire document with new content
• append_to_document(content)   → Add content to the end
• prepend_to_document(content)  → Add content to the beginning
• replace_section(old, new)     → Find and replace specific text
• insert_after_section(heading, content) → Insert after a heading
• replace_selected_text(selected_text, new_text, selection_start, selection_end) → Replace a user-selected portion (inline editing)
• undo_last_change()            → Undo last change
• redo_last_change()            → Redo last change
• get_document_stats()          → Get word count, reading time
• save_document(title, format)  → Save as .txt, .md, .docx, or .pdf

⚠️ CRITICAL RULES - READ CAREFULLY:
1. **YOU MUST USE TOOLS TO WRITE CONTENT** - When the user asks you to write, draft, create, or generate ANY content (emails, letters, blog posts, etc.), you MUST call update_document() or append_to_document() with the ACTUAL content. DO NOT just describe what you would write - WRITE IT using the tool!

2. **EXAMPLE - CORRECT BEHAVIOR**:
   User: "Write an email about sick leave"
   YOU MUST DO: Call update_document(content="Subject: Sick Leave Request\n\nDear [Manager's Name]...")
   Then respond: "I've drafted your sick leave email. You can see it in the document panel."
   
3. **EXAMPLE - WRONG BEHAVIOR** (DO NOT DO THIS):
   User: "Write an email about sick leave"
   WRONG: Just responding "I've drafted an email..." without calling any tool
   
4. The user can ONLY see content that you put in the document using tools. If you don't call a tool, they see nothing!

5. After calling a tool, briefly confirm what you did and suggest next steps.

6. When user asks to save/download, call save_document with appropriate format.

7. Use Markdown formatting in your content for better readability.

REMEMBER: Your tools are how you actually create content for the user. Always use them when writing!
"""
    )

    response = _model.invoke([system] + list(state["messages"]))
    result = {"messages": [response], **_sync_state_from_ctx()}
    return result


def tools_node(state: AgentState) -> dict:
    # Sync context from state BEFORE running tools
    _sync_ctx_from_state(state)
    
    # Create a custom tool executor that preserves context
    from langchain_core.messages import ToolMessage
    
    tool_messages = []
    last_message = state["messages"][-1]
    
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
    
    # NOW sync state from context (after tools have run)
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
    Send one user message and return the updated state.

    Returns dict:
        ai_response      : assistant reply text
        document_content : current document
        document_history : undo stack
        redo_stack       : redo stack
        last_saved_path  : path if just saved
        last_saved_b64   : base64 file data for browser download
        last_saved_format: file extension
        tool_calls_made  : list of tool names used
        state            : full updated state for next call
    """
    # Initialize state with defaults if empty or missing fields
    if not state or "messages" not in state:
        state = {
            "messages": [],
            "document_content": "",
            "document_history": [],
            "redo_stack": [],
            "document_title": "Untitled",
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
        }
    
    # Ensure all required fields exist in state
    state.setdefault("document_content", "")
    state.setdefault("document_history", [])
    state.setdefault("redo_stack", [])
    state.setdefault("document_title", "Untitled")
    state.setdefault("last_saved_path", "")
    state.setdefault("last_saved_b64", "")
    state.setdefault("last_saved_format", "")
    
    # Initialize context for this session
    _local.data = {
        "document_content": state.get("document_content", ""),
        "document_history": list(state.get("document_history", [])),
        "redo_stack": list(state.get("redo_stack", [])),
        "document_title": state.get("document_title", "Untitled"),
        "last_saved_path": state.get("last_saved_path", ""),
        "last_saved_b64": state.get("last_saved_b64", ""),
        "last_saved_format": state.get("last_saved_format", ""),
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
    

    
    # Check if user asked to write/create/draft but AI didn't use tools
    write_keywords = ["write", "draft", "create", "compose", "generate", "make me", "email", "letter", "blog", "post"]
    user_wants_content = any(keyword in user_message.lower() for keyword in write_keywords)
    

    
    if user_wants_content and not tool_calls_made:

        
        # Force the AI to use tools by adding a very strong message
        force_msg = HumanMessage(
            content="STOP! You MUST call the update_document tool RIGHT NOW. Don't explain, don't describe - just call update_document(content='...') with the FULL email/letter content. Do it NOW."
        )
        final_state["messages"].append(force_msg)
        
        # Run one more iteration
        for step in _graph.stream(final_state, config=config, stream_mode="values"):
            final_state = step
        
        # Re-extract the response
        for msg in reversed(final_state["messages"]):
            if isinstance(msg, AIMessage):
                if msg.content:
                    ai_response = msg.content
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    tool_calls_made = [tc["name"] for tc in msg.tool_calls]

                break

    result = {
        "ai_response": ai_response,
        "document_content": final_state.get("document_content", ""),
        "document_history": final_state.get("document_history", []),
        "redo_stack": final_state.get("redo_stack", []),
        "last_saved_path": final_state.get("last_saved_path", ""),
        "last_saved_b64": final_state.get("last_saved_b64", ""),
        "last_saved_format": final_state.get("last_saved_format", ""),
        "tool_calls_made": tool_calls_made,
        "state": final_state,
    }
    return result


def send_message_with_selection(
    session_id: str,
    user_message: str,
    state: dict[str, Any],
    selection_start: int,
    selection_end: int,
    selected_text: str,
) -> dict:
    """Send a message with selection context to edit only a portion of the document.
    
    Args:
        session_id: Unique session identifier
        user_message: The user's prompt for editing the selection
        state: Current session state
        selection_start: Character position where selection starts
        selection_end: Character position where selection ends
        selected_text: The actual selected text
        
    Returns:
        Dictionary with ai_response, updated document_content, and state
    """
    if not _graph:
        return {
            "ai_response": "Agent not initialized",
            "document_content": "",
            "document_history": [],
            "redo_stack": [],
            "last_saved_path": "",
            "last_saved_b64": "",
            "last_saved_format": "",
            "tool_calls_made": [],
            "state": state,
        }
    
    # Ensure all required fields exist in state
    state.setdefault("document_content", "")
    state.setdefault("document_history", [])
    state.setdefault("redo_stack", [])
    state.setdefault("document_title", "Untitled")
    state.setdefault("last_saved_path", "")
    state.setdefault("last_saved_b64", "")
    state.setdefault("last_saved_format", "")
    
    # Initialize context for this session
    _local.data = {
        "document_content": state.get("document_content", ""),
        "document_history": list(state.get("document_history", [])),
        "redo_stack": list(state.get("redo_stack", [])),
        "document_title": state.get("document_title", "Untitled"),
        "last_saved_path": state.get("last_saved_path", ""),
        "last_saved_b64": state.get("last_saved_b64", ""),
        "last_saved_format": state.get("last_saved_format", ""),
        "selection_start": selection_start,
        "selection_end": selection_end,
        "selected_text": selected_text,
    }

    # Enhanced message with selection context
    enhanced_message = f"""INLINE EDITING MODE:

The user has selected a specific portion of the document to edit. You MUST use the replace_selected_text tool to edit ONLY this selection.

SELECTED TEXT (to be edited):
\"\"\"
{selected_text}
\"\"\"

SELECTION POSITION: characters {selection_start} to {selection_end}

USER'S REQUEST:
{user_message}

YOU MUST:
1. Call replace_selected_text(selected_text="{selected_text}", new_text="...", selection_start={selection_start}, selection_end={selection_end})
2. Keep the rest of the document UNCHANGED
3. Only modify the selected portion according to the user's request
"""

    state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=enhanced_message)
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

    result = {
        "ai_response": ai_response,
        "document_content": final_state.get("document_content", ""),
        "document_history": final_state.get("document_history", []),
        "redo_stack": final_state.get("redo_stack", []),
        "last_saved_path": final_state.get("last_saved_path", ""),
        "last_saved_b64": final_state.get("last_saved_b64", ""),
        "last_saved_format": final_state.get("last_saved_format", ""),
        "tool_calls_made": tool_calls_made,
        "state": final_state,
    }
    return result
