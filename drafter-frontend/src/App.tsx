import { useEffect, useState } from 'react'
import Sidebar        from './components/Sidebar'
import ChatPanel      from './components/ChatPanel'
import DocumentPanel  from './components/DocumentPanel'
import { useStore }   from './hooks/useStore'
import { Loader2, WifiOff, MessageSquare, FileText } from 'lucide-react'
import clsx from 'clsx'

type Panel = 'chat' | 'document'

/*  Loading screen  */
function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient orbs */}
      <div className="orb orb-violet" style={{ top: '15%', left: '20%', animationDelay: '0s' }} />
      <div className="orb orb-pink"   style={{ bottom: '20%', right: '15%', animationDelay: '-4s' }} />

      <div className="relative z-10 flex flex-col items-center anim-scale-in">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 anim-float"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.4), rgba(244,114,182,0.3))',
            border: '1px solid rgba(167,139,250,0.6)',
            boxShadow: '0 0 60px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <span style={{ fontSize: '36px' }}>✍️</span>
        </div>
        <span className="font-serif italic text-3xl mb-2 gradient-text">Drafter</span>
        <div
          className="flex items-center gap-2 text-sm mt-4"
          style={{ color: 'var(--t3)' }}
        >
          <Loader2 size={14} className="anim-spin" style={{ color: '#a78bfa' }} />
          Connecting to backend…
        </div>
      </div>
    </div>
  )
}

/*  Error screen  */
function ErrorScreen({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="orb orb-violet" style={{ top: '10%', left: '30%' }} />

      <div className="relative z-10 anim-scale-in">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto"
          style={{
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.3)',
            boxShadow: '0 0 40px rgba(244,63,94,0.2)',
          }}
        >
          <WifiOff size={32} style={{ color: '#fb7185' }} />
        </div>
        <h2 className="font-serif italic text-2xl mb-3" style={{ color: 'var(--t1)' }}>
          Connection Failed
        </h2>
        <p className="text-sm mb-8 max-w-sm leading-relaxed" style={{ color: 'var(--t3)' }}>
          {message}
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Try again
        </button>
      </div>
    </div>
  )
}

/*  Main App  */
export default function App() {
  const {
    state, initialize, sendMessage, sendMessageWithSelection, setTitle, updateDocumentContent,
    createDocument, switchDocument,
    handleUndo, handleRedo, resetSession, clearError, saveDocument, connectGmail,
    disconnectGmail, changeGmailAccount,
    confirmPendingEmail, cancelPendingEmail,
  } = useStore()

  const [activePanel, setActivePanel] = useState<Panel>('chat')
  const [emailDraft, setEmailDraft] = useState({ to: '', subject: '', body: '' })

  useEffect(() => { initialize() }, [initialize])

  useEffect(() => {
    if (state.pendingEmail) {
      setEmailDraft({
        to: state.pendingEmail.to || '',
        subject: state.pendingEmail.subject || '',
        body: state.pendingEmail.body || '',
      })
    }
  }, [state.pendingEmail])

  const handleQuickAction = (prompt: string) => {
    setActivePanel('chat')
    sendMessage(prompt)
  }

  const handleEditSelection = (instruction: string, selectedText: string, selectionStart: number, selectionEnd: number) => {
    // Switch to chat panel to show the AI response
    setActivePanel('chat')
    // Send the instruction with selection
    sendMessageWithSelection(instruction, selectionStart, selectionEnd, selectedText)
  }

  const handleSave = async (format: string) => {
    try {
      if (!state.documentContent.trim()) {
        alert('Cannot download - document is empty')
        return
      }
      
      // Get base64 from backend
      const b64 = await saveDocument(format as 'md' | 'txt' | 'docx' | 'pdf')
      
      if (!b64 || b64.trim() === '') {
        alert('Failed to generate file - empty response from server')
        return
      }
      
      // Decode base64 and trigger download
      const safe = state.documentTitle.replace(/[^\w\-]/g, '_') || 'document'
      const binaryString = atob(b64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const mimeTypes: Record<string, string> = {
        md: 'text/markdown',
        txt: 'text/plain',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pdf: 'application/pdf',
      }

      const blob = new Blob([bytes], { type: mimeTypes[format] || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safe}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed'
      alert(`Download failed: ${message}`)
    }
  }

  if (state.initializing) return <LoadingScreen />
  if (state.error && !state.sessionId) return <ErrorScreen message={state.error} />

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Ambient background orbs (decorative) */}
      <div
        className="pointer-events-none fixed"
        style={{ top: '-80px', left: '-60px', zIndex: 0 }}
      >
        <div className="orb orb-violet" style={{ opacity: 0.6 }} />
      </div>
      <div
        className="pointer-events-none fixed"
        style={{ bottom: '-60px', right: '-40px', zIndex: 0 }}
      >
        <div className="orb orb-pink" style={{ opacity: 0.5 }} />
      </div>

      {/* Sidebar */}
      <div className="relative z-10">
        <Sidebar
          documents={state.documents.map(d => ({ id: d.id, title: d.title }))}
          activeDocumentId={state.activeDocumentId}
          documentTitle={state.documentTitle}
          undoCount={state.undoCount}
          redoCount={state.redoCount}
          lastSavedPath={state.lastSavedPath}
          loading={state.loading}
          gmailConnected={state.gmailConnected}
          onTitleChange={setTitle}
          onQuickAction={handleQuickAction}
          onSave={handleSave}
          onCreateDocument={() => createDocument('Untitled')}
          onSwitchDocument={switchDocument}
          onConnectGmail={connectGmail}
          onDisconnectGmail={disconnectGmail}
          onChangeGmailAccount={changeGmailAccount}
          onNewSession={resetSession}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">

        {/* Mobile tab bar */}
        <div
          className="lg:hidden flex"
          style={{ borderBottom: '1px solid var(--b1)', background: 'var(--s2)' }}
        >
          {(['chat', 'document'] as Panel[]).map(p => (
            <button
              key={p}
              onClick={() => setActivePanel(p)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium capitalize transition-all"
              style={{
                color: activePanel === p ? '#a78bfa' : 'var(--t4)',
                borderBottom: activePanel === p
                  ? '2px solid #7c3aed'
                  : '2px solid transparent',
              }}
            >
              {p === 'chat'
                ? <><MessageSquare size={13} /> Chat</>
                : <><FileText size={13} /> Document</>
              }
            </button>
          ))}
        </div>

        {/* Split panes */}
        <div className="flex-1 flex overflow-hidden">

          {/* Chat */}
          <div
            className={clsx(
              'flex flex-col',
              'lg:flex lg:w-[44%]',
              activePanel === 'chat' ? 'flex w-full' : 'hidden'
            )}
            style={{ borderRight: '1px solid var(--b1)' }}
          >
            <ChatPanel
              messages={state.chatMessages}
              loading={state.loading}
              error={state.error}
              onSend={sendMessage}
              onClearError={clearError}
            />
          </div>

          {/* Document */}
          <div
            className={clsx(
              'flex flex-col',
              'lg:flex lg:flex-1',
              activePanel === 'document' ? 'flex w-full' : 'hidden'
            )}
          >
            <DocumentPanel
              title={state.documentTitle}
              content={state.documentContent}
              onContentChange={updateDocumentContent}
              onEditSelection={handleEditSelection}
            />
          </div>
        </div>

        {/* Status bar */}
        <div
          className="hidden lg:flex items-center justify-between px-5 py-1.5 text-[11px]"
          style={{
            background: 'var(--s2)',
            borderTop: '1px solid var(--b1)',
            color: 'var(--t4)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className={state.sessionId ? 'status-dot-connected' : 'status-dot-disconnected'}
              />
              {state.sessionId ? 'Connected' : 'Disconnected'}
            </span>
            {state.sessionId && (
              <span className="font-mono" style={{ color: 'var(--t4)', opacity: 0.5 }}>
                {state.sessionId.slice(0, 8)}…
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="px-2 py-0.5 rounded-full"
              style={{
                color: state.gmailConnected ? '#bbf7d0' : '#fecaca',
                background: state.gmailConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                border: state.gmailConnected ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(239,68,68,0.35)',
              }}
            >
              Gmail: {state.gmailConnected ? 'Connected' : 'Not Connected'}
            </span>
            {state.loading && (
              <span
                className="flex items-center gap-1.5 anim-fade-in"
                style={{ color: '#a78bfa' }}
              >
                <Loader2 size={10} className="anim-spin" />
                Processing…
              </span>
            )}
            <span style={{ opacity: 0.35 }}>Drafter v2.0</span>
          </div>
        </div>
      </div>

      {state.pendingEmail && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{
            background:
              'radial-gradient(circle at 18% 18%, rgba(34,197,94,0.2), transparent 42%), radial-gradient(circle at 82% 78%, rgba(14,165,233,0.2), transparent 42%), rgba(2,6,23,0.74)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="max-w-2xl w-full rounded-2xl p-5 anim-scale-in"
            style={{
              background: 'linear-gradient(155deg, rgba(15,23,42,0.96), rgba(30,41,59,0.95) 60%, rgba(14,116,144,0.9))',
              border: '1px solid rgba(148,163,184,0.35)',
              boxShadow: '0 30px 80px rgba(2,6,23,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(134,239,172,0.9)' }}>
              Confirm Email Send
            </p>
            <h3 className="text-lg font-semibold mb-3" style={{ color: '#eef2ff' }}>
              Review And Confirm Before Sending
            </h3>

            <div className="space-y-2 mb-4 text-sm" style={{ color: 'rgba(226,232,240,0.92)' }}>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(148,163,184,0.95)' }}>Recipient</span>
                <input
                  value={emailDraft.to}
                  onChange={e => setEmailDraft(s => ({ ...s, to: e.target.value }))}
                  className="input w-full mt-1"
                  placeholder="recipient@example.com"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(148,163,184,0.95)' }}>Subject</span>
                <input
                  value={emailDraft.subject}
                  onChange={e => setEmailDraft(s => ({ ...s, subject: e.target.value }))}
                  className="input w-full mt-1"
                  placeholder="Email subject"
                />
              </label>
            </div>

            <label className="block mb-4">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(148,163,184,0.95)' }}>Body</span>
              <textarea
                value={emailDraft.body}
                onChange={e => setEmailDraft(s => ({ ...s, body: e.target.value }))}
                className="input w-full mt-1 min-h-[180px]"
                style={{ resize: 'vertical' }}
                placeholder="Email body"
              />
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => confirmPendingEmail(emailDraft)}
                disabled={!emailDraft.to.trim() || !emailDraft.body.trim()}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
                style={{
                  color: '#0f172a',
                  background: 'linear-gradient(135deg, #86efac, #67e8f9)',
                  opacity: emailDraft.to.trim() && emailDraft.body.trim() ? 1 : 0.5,
                }}
              >
                Confirm & Send
              </button>
              <button onClick={cancelPendingEmail} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}