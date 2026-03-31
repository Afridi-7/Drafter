// src/App.tsx
import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import DocumentPanel from './components/DocumentPanel'
import { useStore } from './hooks/useStore'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'

type ActivePanel = 'chat' | 'document'

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-parchment flex flex-col items-center justify-center">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl">✍️</span>
        <span className="font-display text-3xl text-ink-900 tracking-tight">Drafter</span>
      </div>
      <div className="flex items-center gap-2 text-ink-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        <span>Connecting to backend…</span>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 bg-parchment flex flex-col items-center justify-center px-8">
      <WifiOff size={40} className="text-crimson mb-4" />
      <h2 className="font-display text-xl text-ink-900 mb-2">Connection Failed</h2>
      <p className="text-sm text-ink-500 text-center max-w-sm leading-relaxed mb-6">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="btn-primary"
      >
        Retry
      </button>
    </div>
  )
}

export default function App() {
  const { state, initialize, sendMessage, setTitle, resetSession, clearError } = useStore()
  const [activePanel, setActivePanel] = useState<ActivePanel>('chat')
  const [pendingInput, setPendingInput] = useState<string | undefined>()

  useEffect(() => {
    initialize()
  }, [initialize])

  const handleQuickAction = (prompt: string) => {
    setPendingInput(prompt)
    setActivePanel('chat')
    // Clear after a tick so it triggers the effect in ChatPanel
    setTimeout(() => setPendingInput(undefined), 100)
    sendMessage(prompt)
  }

  const handleSave = (format: string) => {
    const safeName = state.documentTitle.replace(/[^\w\-]/g, '_') || 'document'
    sendMessage(`Save the document as '${safeName}' in ${format} format`)
  }

  if (state.initializing) return <LoadingScreen />
  if (state.error && !state.sessionId) return <ErrorScreen message={state.error} />

  return (
    <div className="flex h-screen overflow-hidden bg-parchment">
      {/* Sidebar */}
      <Sidebar
        documentTitle={state.documentTitle}
        undoCount={state.undoCount}
        redoCount={state.redoCount}
        lastSavedPath={state.lastSavedPath}
        onTitleChange={setTitle}
        onQuickAction={handleQuickAction}
        onSave={handleSave}
        onNewSession={resetSession}
        loading={state.loading}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile tab bar */}
        <div className="lg:hidden flex border-b border-parchment-border bg-white/50">
          {(['chat', 'document'] as ActivePanel[]).map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={clsx(
                'flex-1 py-3 text-sm font-medium capitalize transition-all',
                activePanel === panel
                  ? 'text-ink-900 border-b-2 border-ink-900'
                  : 'text-ink-400'
              )}
            >
              {panel === 'chat' ? '💬 Chat' : '📄 Document'}
            </button>
          ))}
        </div>

        {/* Desktop split view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat panel */}
          <div
            className={clsx(
              'flex flex-col border-r border-parchment-border bg-parchment/50',
              'lg:flex lg:w-[45%]',
              activePanel === 'chat' ? 'flex w-full' : 'hidden'
            )}
          >
            <ChatPanel
              messages={state.chatMessages}
              loading={state.loading}
              error={state.error}
              onSend={sendMessage}
              onClearError={clearError}
              pendingInput={pendingInput}
            />
          </div>

          {/* Document panel */}
          <div
            className={clsx(
              'flex flex-col bg-white',
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
        <div className="hidden lg:flex items-center justify-between
                        px-4 py-1.5 bg-ink-950 text-xs text-ink-400
                        border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={clsx(
                'status-dot',
                state.sessionId ? 'bg-jade' : 'bg-crimson'
              )} />
              <span>{state.sessionId ? 'Connected' : 'Disconnected'}</span>
            </div>
            {state.sessionId && (
              <span className="text-ink-600 font-mono">
                {state.sessionId.slice(0, 8)}…
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {state.loading && (
              <span className="flex items-center gap-1.5 text-amber-accent">
                <Loader2 size={10} className="animate-spin" />
                Processing…
              </span>
            )}
            <span>Drafter v2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
