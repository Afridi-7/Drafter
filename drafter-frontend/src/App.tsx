// src/App.tsx
import React, { useEffect, useState } from 'react'
import Sidebar        from './components/Sidebar'
import ChatPanel      from './components/ChatPanel'
import DocumentPanel  from './components/DocumentPanel'
import { useStore }   from './hooks/useStore'
import { Loader2, WifiOff, MessageSquare, FileText } from 'lucide-react'
import clsx from 'clsx'

type Panel = 'chat' | 'document'

function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.3)' }}
        >
          <span className="text-xl">✍️</span>
        </div>
        <span className="font-serif italic text-2xl" style={{ color: 'var(--text1)' }}>Drafter</span>
      </div>
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text3)' }}>
        <Loader2 size={13} className="anim-spin" />
        Connecting to backend…
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center"
      style={{ background: 'var(--surface)' }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)' }}
      >
        <WifiOff size={24} style={{ color: '#fb7185' }} />
      </div>
      <h2 className="font-serif italic text-xl mb-2" style={{ color: 'var(--text1)' }}>
        Connection Failed
      </h2>
      <p className="text-sm mb-6 max-w-sm leading-relaxed" style={{ color: 'var(--text3)' }}>
        {message}
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary">
        Try again
      </button>
    </div>
  )
}

export default function App() {
  const { state, initialize, sendMessage, setTitle, handleUndo, handleRedo, resetSession, clearError } = useStore()
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
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface)' }}>

      {/* Sidebar */}
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

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile tab bar */}
        <div
          className="lg:hidden flex"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}
        >
          {(['chat', 'document'] as Panel[]).map(p => (
            <button
              key={p}
              onClick={() => setActivePanel(p)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium capitalize transition-all"
              style={{
                color: activePanel === p ? '#a78bfa' : 'var(--text3)',
                borderBottom: activePanel === p ? '2px solid #7c3aed' : '2px solid transparent',
              }}
            >
              {p === 'chat'
                ? <><MessageSquare size={14} /> Chat</>
                : <><FileText size={14} /> Document</>
              }
            </button>
          ))}
        </div>

        {/* Split panes */}
        <div className="flex-1 flex overflow-hidden">

          {/* Chat pane */}
          <div
            className={clsx(
              'flex flex-col',
              'lg:flex lg:w-[44%]',
              activePanel === 'chat' ? 'flex w-full' : 'hidden'
            )}
            style={{ borderRight: '1px solid var(--border)' }}
          >
            <ChatPanel
              messages={state.chatMessages}
              loading={state.loading}
              error={state.error}
              onSend={sendMessage}
              onClearError={clearError}
            />
          </div>

          {/* Document pane */}
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
            background: 'var(--surface2)',
            borderTop: '1px solid var(--border)',
            color: 'var(--text3)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: state.sessionId ? '#34d399' : '#f87171' }}
              />
              {state.sessionId ? 'Connected' : 'Disconnected'}
            </span>
            {state.sessionId && (
              <span className="font-mono opacity-40">{state.sessionId.slice(0, 8)}…</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {state.loading && (
              <span className="flex items-center gap-1.5" style={{ color: '#a78bfa' }}>
                <Loader2 size={10} className="anim-spin" />
                Processing…
              </span>
            )}
            <span className="opacity-40">Drafter v2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
