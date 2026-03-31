# ✍️ Drafter — Setup Guide

A production-grade AI writing assistant with a FastAPI backend (LangGraph + GPT-4o)
and a React + TypeScript frontend.

---

## Project Structure

```
drafter/
├── backend/
│   ├── agent.py          ← LangGraph agent (tools, state, graph)
│   ├── main.py           ← FastAPI server
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── client.ts       ← API client + download helper
    │   ├── components/
    │   │   ├── Sidebar.tsx     ← Navigation, quick actions, export
    │   │   ├── ChatPanel.tsx   ← Chat UI with markdown rendering
    │   │   └── DocumentPanel.tsx ← Live doc preview + source view
    │   ├── hooks/
    │   │   └── useStore.ts     ← Central state management
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── tailwind.config.js
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | bundled with Node.js |
| OpenAI API key | — | https://platform.openai.com |

---

## Step 1 — Clone / Place Files

Place the files exactly as shown in the project structure above.

---

## Step 2 — Backend Setup

### 2a. Create a virtual environment

```bash
cd drafter/backend
python -m venv venv
```

Activate it:

```bash
# macOS / Linux
source venv/bin/activate

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (CMD)
venv\Scripts\activate.bat
```

### 2b. Install dependencies

```bash
pip install -r requirements.txt
```

### 2c. Add your OpenAI API key

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder:

```
OPENAI_API_KEY=sk-...your-real-key-here...
```

### 2d. Start the backend

```bash
uvicorn main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

Visit http://localhost:8000/docs to explore the auto-generated API documentation.

---

## Step 3 — Frontend Setup

Open a **new terminal** (keep the backend running).

### 3a. Install dependencies

```bash
cd drafter/frontend
npm install
```

### 3b. Start the dev server

```bash
npm run dev
```

You should see:

```
  VITE v5.x.x  ready in 500ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open http://localhost:5173 in your browser. 🎉

> The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`,
> so no CORS configuration is needed during development.

---

## Step 4 — Verify Everything Works

1. Open http://localhost:5173
2. You should see the Drafter interface load with a "Connected" status in the bottom bar
3. Type: **"Write a short blog post about the benefits of morning routines"**
4. The AI will respond and the document panel on the right will populate
5. Try the sidebar quick actions (Improve, Shorten, Fix grammar, etc.)
6. Click **Save & Download** to export the document

---

## Troubleshooting

### "Connection Failed" on startup

The frontend can't reach the backend. Check:
- Is the backend running? (`uvicorn main:app --reload --port 8000`)
- Is there an error in the backend terminal?
- Is port 8000 blocked by a firewall?

### "openai.AuthenticationError"

Your API key is missing or invalid. Check:
```bash
cat drafter/backend/.env
# Should show: OPENAI_API_KEY=sk-...
```

### "ModuleNotFoundError"

Your virtual environment may not be active:
```bash
source drafter/backend/venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

### Port already in use

Change the backend port:
```bash
uvicorn main:app --reload --port 8001
```

Then update the proxy in `frontend/vite.config.ts`:
```ts
target: 'http://localhost:8001',
```

---

## Production Deployment

### Backend

```bash
# Install production ASGI server
pip install gunicorn

# Run with multiple workers
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

For persistent sessions across restarts, swap `MemorySaver` in `agent.py`
for `SqliteSaver`:

```python
# agent.py — replace the _build_graph function's last two lines:
from langgraph.checkpoint.sqlite import SqliteSaver
memory = SqliteSaver.from_conn_string("drafter_sessions.db")
return g.compile(checkpointer=memory)
```

### Frontend

```bash
cd frontend
npm run build
# Outputs to frontend/dist/ — serve with Nginx, Vercel, Netlify, etc.
```

For Nginx, point the root to `frontend/dist/` and proxy `/api/` to the backend.

---

## Features

| Feature | How to use |
|---------|-----------|
| Write a draft | "Write a blog post about X" |
| Improve writing | "Improve the flow and clarity" |
| Shorten content | "Make this more concise" |
| Fix grammar | "Fix all grammar issues" |
| Add sections | "Add an introduction and conclusion" |
| Targeted edit | "Replace the second paragraph with something more engaging" |
| Insert content | "Add a section about pricing after the features section" |
| Undo / Redo | "Undo that" / "Redo last change" |
| View stats | "Show document statistics" |
| Save & download | Click Save & Download in the sidebar |

---

## Key Improvements Over Original

| Area | Original | Improved |
|------|----------|----------|
| Concurrency | Global `_ctx` dict (race conditions) | `threading.local` (thread-safe) |
| Graph routing | Always routes to tools | Conditional: only routes if tool calls exist |
| Tools | 8 tools | 9 tools (added `insert_after_section`) |
| Downloads | Server-side only | Base64 payload → browser download |
| Frontend | Streamlit | React + TypeScript + Tailwind |
| API | None | FastAPI with auto-docs at `/docs` |
| State | Streamlit session | React hooks + API-backed state |
| Redo stack | Present but unused in UI | Fully exposed in sidebar |
