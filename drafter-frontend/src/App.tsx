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
      <div className="orb orb-violet" style={{ top: '20%', left: '25%', animationDelay: '0s' }} />
      <div className="orb orb-pink"   style={{ bottom: '25%', right: '20%', animationDelay: '-4s' }} />

      <div className="relative z-10 flex flex-col items-center anim-scale-in">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 anim-float"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(236,72,153,0.15))',
            border: '1px solid rgba(139,92,246,0.4)',
            boxShadow: '0 0 40px rgba(124,58,237,0.3)',
          }}
        >
          <span style={{ fontSize: '30px' }}>✍️</span>
        </div>
        <span className="font-serif italic text-2xl mb-1 gradient-text">Drafter</span>
        <div
          className="flex items-center gap-2 text-sm mt-3"
          style={{ color: 'var(--t4)' }}
        >
          <Loader2 size={13} className="anim-spin" style={{ color: '#8b5cf6' }} />
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
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto"
          style={{
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid rgba(244,63,94,0.25)',
            boxShadow: '0 0 30px rgba(244,63,94,0.15)',
          }}
        >
          <WifiOff size={26} style={{ color: '#fb7185' }} />
        </div>
        <h2 className="font-serif italic text-xl mb-2" style={{ color: 'var(--t1)' }}>
          Connection Failed
        </h2>
        <p className="text-sm mb-7 max-w-sm leading-relaxed" style={{ color: 'var(--t3)' }}>
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
    handleUndo, handleRedo, resetSession, clearError,
  } = useStore()

  const [activePanel, setActivePanel] = useState<Panel>('chat')

  useEffect(() => { initialize() }, [initialize])

  const handleQuickAction = (prompt: string) => {
    setActivePanel('chat')
    sendMessage(prompt)
  }

  const handleSave = (format: string) => {
    const safe = state.documentTitle.replace(/[^\w\-]/g, '_') || 'document'
    sendMessage(`Save the document as '${safe}' in ${format} format`)
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
              undoCount={state.undoCount}
              redoCount={state.redoCount}
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