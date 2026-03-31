// src/components/ChatPanel.tsx
import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2, X, AlertTriangle } from 'lucide-react'
import { ChatMessage } from '../hooks/useStore'
import clsx from 'clsx'

const STARTER_PROMPTS = [
  'Write a blog post about morning productivity',
  'Draft a professional email declining a meeting',
  'Create a product description for headphones',
  'Write an executive summary for a Q3 report',
]

function TypingIndicator() {
  return (
    <div className="flex justify-start anim-fade-in">
      <div className="bubble-ai flex items-center gap-1.5 py-3 px-4" style={{ width: 'fit-content' }}>
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  )
}

function Bubble({ msg, index }: { msg: ChatMessage; index: number }) {
  const isUser = msg.role === 'user'
  const delay  = Math.min(index * 20, 120)

  return (
    <div
      className={clsx(
        'anim-fade-up',
        isUser ? 'flex justify-end' : 'flex justify-start'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={isUser ? 'bubble-user' : 'bubble-ai'}>
        {/* Tool badges */}
        {!isUser && msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {msg.tools.map(t => (
              <span key={t} className="tool-badge">⚙ {t.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}

        {/* Message body */}
        {isUser ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.65]">{msg.content}</p>
        ) : (
          <div className="prose-chat text-[13.5px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <p
          className="text-[10px] mt-1.5 select-none"
          style={{
            color: isUser ? 'rgba(255,255,255,0.45)' : 'var(--t4)',
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

interface ChatPanelProps {
  messages:     ChatMessage[]
  loading:      boolean
  error:        string | null
  onSend:       (msg: string) => void
  onClearError: () => void
}

export default function ChatPanel({ messages, loading, error, onSend, onClearError }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef         = useRef<HTMLDivElement>(null)
  const textareaRef       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = input.trim()
    if (!t || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSend(t)
  }

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 148) + 'px'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--s1)' }}>

      {/* Header */}
      <div
        className="px-5 py-4 anim-fade-in"
        style={{ borderBottom: '1px solid var(--b1)' }}
      >
        <h2 className="font-serif italic text-[1.1rem] gradient-text-static">Chat</h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--t4)' }}>
          Describe what you'd like to write or edit
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (

          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full text-center px-3 anim-fade-in">
            {/* Animated icon */}
            <div className="relative mb-5">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center anim-float"
                style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(236,72,153,0.12))',
                  border: '1px solid rgba(139,92,246,0.3)',
                  boxShadow: '0 0 30px rgba(124,58,237,0.2)',
                }}
              >
                <span style={{ fontSize: '28px' }}>✍️</span>
              </div>
              {/* Orbiting glow dot */}
              <div
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
                style={{
                  background: 'var(--grad-primary)',
                  boxShadow: '0 0 10px rgba(124,58,237,0.8)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            </div>

            <h3 className="font-serif italic text-lg mb-1.5 gradient-text">
              Ready to write
            </h3>
            <p className="text-xs mb-6 max-w-[240px] leading-relaxed" style={{ color: 'var(--t4)' }}>
              Start a conversation or pick a prompt below to begin
            </p>

            <div className="w-full max-w-[280px] space-y-2 stagger">
              {STARTER_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="starter-card anim-fade-up"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

        ) : (
          <>
            {messages.map((m, i) => <Bubble key={m.id} msg={m} index={i} />)}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2">
          <div className="error-banner">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={onClearError} style={{ opacity: 0.7 }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className="px-4 pb-4 pt-3"
        style={{ borderTop: '1px solid var(--b1)' }}
      >
        <form onSubmit={submit} className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target) }}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to write or edit?"
              rows={1}
              disabled={loading}
              style={{ minHeight: '42px', maxHeight: '148px' }}
              className="input"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary h-[42px] px-4 shrink-0"
          >
            {loading
              ? <Loader2 size={15} className="anim-spin" />
              : <Send size={15} />
            }
          </button>
        </form>
        <p className="text-center mt-1.5 text-[10px]" style={{ color: 'var(--t4)' }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}