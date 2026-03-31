// src/components/ChatPanel.tsx
import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2, AlertCircle, X } from 'lucide-react'
import { ChatMessage } from '../hooks/useStore'
import clsx from 'clsx'

interface ChatPanelProps {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  onSend: (msg: string) => void
  onClearError: () => void
  pendingInput?: string
}

function TypingIndicator() {
  return (
    <div className="chat-bubble-ai animate-fade-in">
      <div className="flex items-center gap-1.5 h-5">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="typing-dot"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div
      className={clsx(
        'animate-slide-up',
        isUser ? 'flex justify-end' : 'flex justify-start'
      )}
    >
      <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}>
        {/* Tool badges */}
        {!isUser && msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {msg.tools.map((tool) => (
              <span key={tool} className="tool-badge">
                ⚙ {tool.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className={isUser ? 'text-parchment' : 'text-ink-800 chat-markdown'}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          )}
        </div>

        {/* Timestamp */}
        <div className={clsx('text-xs mt-1.5', isUser ? 'text-white/30 text-right' : 'text-ink-300')}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({
  messages,
  loading,
  error,
  onSend,
  onClearError,
  pendingInput,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Handle pending input from sidebar quick actions
  useEffect(() => {
    if (pendingInput) {
      setInput(pendingInput)
      textareaRef.current?.focus()
    }
  }, [pendingInput])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-parchment/80 to-parchment">
      {/* Header */}
      <div className="px-5 py-4 border-b border-parchment-border bg-gradient-to-r from-white/60 to-blue-50/30">
        <h2 className="font-display text-xl text-ink-900">Chat</h2>
        <p className="text-xs text-ink-500 mt-0.5">Describe what you'd like to write or edit</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in">
            <div className="text-5xl mb-4">✍️</div>
            <h3 className="font-display text-lg text-ink-700 mb-2">Ready to write</h3>
            <p className="text-sm text-ink-500 max-w-xs leading-relaxed">
              Start by describing what you'd like to create, or pick a quick action from the sidebar.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-xs">
              {[
                'Write a blog post about productivity',
                'Draft a professional email',
                'Create a product description',
                'Write an executive summary',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="quick-action-btn animate-slide-up"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div key={msg.id} style={{ animationDelay: `${idx * 50}ms` }} className="animate-slide-up">
                <MessageBubble msg={msg} />
              </div>
            ))}
            {loading && (
              <div className="flex justify-start animate-slide-up">
                <TypingIndicator />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-3 flex items-start gap-3 bg-gradient-to-r from-rose-500/10 to-rose-400/5 border border-rose-300/30
                        text-rose-700 rounded-lg px-4 py-3 text-xs animate-slide-up">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
          <span className="flex-1">{error}</span>
          <button onClick={onClearError} className="shrink-0 hover:opacity-70 transition-opacity">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-3 border-t border-parchment-border/60 bg-white/30">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e.target) }}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to write or edit? (Enter to send, Shift+Enter for newline)"
              rows={1}
              style={{ resize: 'none' }}
              className="input-field py-3 pr-3 min-h-[44px] max-h-40"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary h-11 px-4 shrink-0"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
        <p className="text-xs text-ink-400 mt-2 text-center">
          Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
