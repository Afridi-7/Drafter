# ✍️ Drafter — AI Writing Assistant

A production-grade AI writing assistant with FastAPI backend (LangGraph + GPT-4) and React + TypeScript frontend.

---

## ✨ Features

- 🤖 AI-powered writing and editing with GPT-4
- ✏️ **Manual editing** - Type and edit directly in Source mode
- ✂️ **Inline AI editing** - Select and edit specific text portions with AI
- 📥 **Direct file downloads** - MD, TXT, DOCX, PDF formats
- 👁️ Real-time document preview (Preview/Source modes)
- ⏪ Unlimited undo/redo
- 📊 Document statistics
- 🎨 Beautiful, responsive UI

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- OpenAI API key

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Add OpenAI API key
cp .env.example .env
# Edit .env: OPENAI_API_KEY=sk-your-key-here

# Start server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd drafter-frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### 3. Open Browser
Visit **http://localhost:5173**

---

## 📥 Download Files

1. Write content using AI chat
2. Go to left sidebar
3. Select format (MD, TXT, DOCX, or PDF)
4. Click "Download" button
5. File downloads to your Downloads folder!

Files are also backed up in `backend/saved_documents/`

---

## 💬 Writing Commands

| Command | Action |
|---------|--------|
| "Write a blog post about X" | Create new draft |
| "Improve the flow and clarity" | Enhance writing |
| "Make this more concise" | Shorten content |
| "Fix all grammar issues" | Fix grammar |
| "Add a conclusion" | Add sections |
| "Undo that" / "Redo" | Undo/redo changes |
| "Show document statistics" | View stats |

### ✨ NEW: Editing Modes

#### Manual Editing
1. Switch to **Source** mode in document panel
2. **Click and type** directly in the text area
3. Edit like any text editor - fully editable!
4. Switch to Preview to see formatted result

#### AI Selection Editing
1. Switch to **Source** mode in document panel
2. **Select** the text you want AI to edit
3. Click **"Edit Selection with AI"** button (or press Ctrl+E)
4. Enter your editing instruction
5. Only the selected portion is changed!

**Use cases:**
- Manual: Quick typo fixes, adding content, formatting
- AI: "Make this more professional", "Fix grammar", "Expand with examples"

---

## 📁 Project Structure

```
drafter/
├── backend/
│   ├── agent.py              # LangGraph agent with tools
│   ├── main.py               # FastAPI server
│   ├── requirements.txt      # Python dependencies
│   └── saved_documents/      # Downloaded files backup
│
└── drafter-frontend/
    ├── src/
    │   ├── components/       # React components
    │   ├── hooks/            # Custom hooks
    │   ├── api/              # API client
    │   └── App.tsx           # Main app
    └── package.json          # Node dependencies
```

---

## 🛠️ Tech Stack

**Frontend:** React 18, TypeScript, Vite, TailwindCSS  
**Backend:** FastAPI, LangChain, LangGraph, OpenAI GPT-4  
**Documents:** python-docx (DOCX), reportlab (PDF)

---

## 🐛 Troubleshooting

**Connection Failed**
- Check backend is running on port 8000
- Visit http://localhost:8000/health

**OpenAI Error**
- Check `.env` file has valid API key
- Format: `OPENAI_API_KEY=sk-...`

**Download Not Working**
- Make sure document has content
- Check browser console (F12) for errors
- Refresh browser (F5)

---

## 📝 License

Personal project - use and modify freely!

---

**Happy writing! 🚀**
