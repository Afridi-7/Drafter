// src/App.tsx
import React, { useEffect, useState } from 'react'
import Sidebar        from './components/Sidebar'
import ChatPanel      from './components/ChatPanel'
import DocumentPanel  from './components/DocumentPanel'
import { useStore }   from './hooks/useStore'
import { Loader2, WifiOff, MessageSquare, FileText } from 'lucide-react'
import clsx from 'clsx'

type Panel = 'chat' | 'document'

/* ── Loading screen ────────────────────────────────── */
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

/* ── Error screen ───────────────────────────────────── */
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

/* ── Main App ──────────────────────────────────────── */
export default function App() {
  const {
    state, initialize, sendMessage, setTitle,
    handleUndo, handleRedo, resetSession, clearError, saveDocument,
  } = useStore()

  const [activePanel, setActivePanel] = useState<Panel>('chat')

  useEffect(() => { initialize() }, [initialize])

  const handleQuickAction = (prompt: string) => {
    setActivePanel('chat')
    sendMessage(prompt)
  }

  const handleSave = async (format: string) => {
    try {
      if (!state.documentContent.trim()) {
        throw new Error('Document is empty')
      }
      
      // Get base64 from backend
      const b64 = await saveDocument(format as 'md' | 'txt' | 'docx' | 'pdf')
      
      // Decode base64 and trigger download
      const safe = state.documentTitle.replace(/[^\w\-]/g, '_') || 'document'
      const binaryString = atob(b64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const mimeTypes: Record<string, string> = {
        md: 'text/markdown; charset=utf-8',
        txt: 'text/plain; charset=utf-8',
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
      throw error
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
          documentTitle={state.documentTitle}
          undoCount={state.undoCount}
          redoCount={state.redoCount}
          lastSavedPath={state.lastSavedPath}
          loading={state.loading}
          onTitleChange={setTitle}
          onQuickAction={handleQuickAction}
          onSave={handleSave}
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
    </div>
  )
}