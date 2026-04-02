  # Drafter

  - Multiple documents per session (create and switch documents)
  - Manual editing in the document panel
  - Selection edit workflow (edit only selected text)
  - Undo and redo support
  - Export to MD, TXT, DOCX, and PDF
  - Gmail OAuth connect, change account, and disconnect
  - Email send confirmation modal before actual send

  ## Tech Stack

  - Frontend: React 18, TypeScript, Vite, Tailwind
  - Backend: FastAPI, LangGraph, LangChain, OpenAI
  CORS_ORIGINS=http://localhost:5173,http://localhost:3000
  - Document export: python-docx, reportlab
  - Email: Google OAuth + Gmail API

  ## Project Structure

  ```text
  - GET /sessions/{session_id}/documents
  - POST /sessions/{session_id}/documents
  - POST /sessions/{session_id}/documents/switch
  - PUT /sessions/{session_id}/documents/{document_id}
      requirements.txt
      saved_documents/
    drafter-frontend/
  - A single session can contain multiple documents.
  - Document content/title/history are tracked per active document.
        api/
        components/
        hooks/
        App.tsx
  ```

  ## Prerequisites

  - Python 3.11+
  - Node.js 18+
  - npm
  - OpenAI API key
  - Google OAuth client (for Gmail features)

  ## Environment Variables (Backend)

  Create backend/.env with:

  ```dotenv
  OPENAI_API_KEY=your_openai_api_key
  GOOGLE_CLIENT_ID=your_google_client_id
  GOOGLE_CLIENT_SECRET=your_google_client_secret
  REDIRECT_URI=http://localhost:8000/auth/google/callback
  FRONTEND_URL=http://localhost:5173
  ```

  Notes:

  - REDIRECT_URI must exactly match the callback URI configured in Google Cloud Console.
  - FRONTEND_URL should match your frontend dev URL.

  ## Run Locally

  ### 1) Start Backend

  ```bash
  cd backend
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  python -m uvicorn main:app --reload --port 8000
  ```

  ### 2) Start Frontend

  ```bash
  cd drafter-frontend
  npm install
  npm run dev
  ```

  Open http://localhost:5173

  ## Build

  Frontend production build:

  ```bash
  cd drafter-frontend
  npm run build
  ```

  ## Deploy (Render + Vercel)

  ### Backend on Render

  1. Push this repository to GitHub.
  2. In Render, create a new Web Service from your repo.
  3. Use these settings:
    - Root Directory: backend
    - Build Command: pip install -r requirements.txt
    - Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
  4. Add environment variables in Render:
    - OPENAI_API_KEY
    - GOOGLE_CLIENT_ID
    - GOOGLE_CLIENT_SECRET
    - REDIRECT_URI (set to https://YOUR_RENDER_SERVICE.onrender.com/auth/google/callback)
    - FRONTEND_URL (set to your Vercel domain)
    - CORS_ORIGINS (comma-separated, include your Vercel domain and localhost)
  5. Deploy and copy the Render URL.

  Optional: this repo includes render.yaml for one-click Render Blueprint setup.

  ### Frontend on Vercel

  1. In Vercel, import the same repository.
  2. Configure project:
    - Root Directory: drafter-frontend
    - Build Command: npm run build
    - Output Directory: dist
  3. Add environment variable:
    - VITE_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com
  4. Deploy and copy the Vercel URL.

  This repo includes drafter-frontend/vercel.json for SPA rewrites and output settings.

  ### Google OAuth Final Setup

  In Google Cloud Console (OAuth client):

  - Authorized JavaScript origins:
    - https://YOUR_VERCEL_PROJECT.vercel.app
  - Authorized redirect URIs:
    - https://YOUR_RENDER_SERVICE.onrender.com/auth/google/callback

  After updating OAuth settings, redeploy backend/frontend if needed and test Gmail connect.

  ## Core Workflows

  ### Drafting and Editing

  1. Enter prompts in chat to create or modify content.
  2. Edit manually in the document panel.
  3. Select text and use selection edit for targeted rewrites.
  4. Use undo/redo controls for document revisions.

  ### Export

  1. Choose format in the sidebar.
  2. Click Save and Download.
  3. Files are also written to backend/saved_documents and the system Documents folder used by backend export logic.

  ### Gmail OAuth and Sending

  1. Connect Gmail from the sidebar.
  2. Ask AI to send to a recipient.
  3. Review and edit recipient/subject/body in the confirmation modal.
  4. Confirm to send.

  Account management:

  - Change Account: re-runs OAuth with account chooser.
  - Disconnect: clears active Gmail OAuth credentials.

  ## Session Behavior

  - New session starts with clean document and chat state.
  - History is reset in the frontend when creating a new session.

  ## API Overview

  Main backend endpoints:

  - POST /sessions
  - GET /sessions/{session_id}/document
  - POST /sessions/{session_id}/messages
  - POST /sessions/{session_id}/messages-stream
  - POST /sessions/{session_id}/messages-selection-stream
  - POST /sessions/{session_id}/save
  - DELETE /sessions/{session_id}
  - GET /auth/google/login
  - GET /auth/google/callback
  - GET /auth/google/status
  - POST /auth/google/disconnect
  - POST /sessions/{session_id}/email/confirm
  - POST /sessions/{session_id}/email/cancel
  - GET /health

  ## Troubleshooting

  ### Backend not reachable

  - Ensure backend is running on port 8000.
  - Check http://localhost:8000/health.

  ### Gmail OAuth issues

  - Verify REDIRECT_URI matches Google Cloud Console exactly.
  - Ensure FRONTEND_URL is correct.
  - Reconnect using Change Account if token/account changed.

  ### Empty export or save errors

  - Export requires non-empty document content.

  ## Security Notes

  - Never commit .env to source control.
  - If any key is exposed, rotate it immediately.
  - Use separate credentials for local development and production.

  ## License

  Internal/personal project. Add your preferred license if distributing.
