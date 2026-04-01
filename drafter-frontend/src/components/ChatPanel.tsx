import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2, X, AlertTriangle } from 'lucide-react'
import { ChatMessage } from '../hooks/useStore'
import clsx from 'clsx'

const STARTER_PROMPTS = [
  'Write a blog post about morning productivity habits',
  'Draft a professional email declining a meeting',
  'Create a product description for noise-cancelling headphones',
  'Write an executive summary for a Q3 report',
]

function TypingIndicator() {
  return (
    <div className="flex justify-start anim-fade-in">
      <div className="bubble-ai flex items-center gap-1.5 py-3 px-4">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('anim-fade-up', isUser ? 'flex justify-end' : 'flex justify-start')}>
      <div className={isUser ? 'bubble-user' : 'bubble-ai'}>
        {!isUser && msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {msg.tools.map(t => (
              <span key={t} className="tool-badge">
                ⚙ {t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{msg.content}</p>
        ) : (
          <div className="prose-chat text-[13.5px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}

        <p
          className="text-[10px] mt-1.5 select-none"
          style={{ color: isUser ? 'rgba(255,255,255,0.4)' : 'var(--text3)', textAlign: isUser ? 'right' : 'left' }}
        >
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

interface ChatPanelProps {
  messages:      ChatMessage[]
  loading:       boolean
  error:         string | null
  onSend:        (msg: string) => void
  onClearError:  () => void
}

export default function ChatPanel({ messages, loading, error, onSend, onClearError }: ChatPanelProps) {
  const [input, setInput]         = useState('')
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = input.trim()
    if (!t || loading) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSend(t)
  }

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="font-serif italic text-lg" style={{ color: 'var(--text1)' }}>Chat</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
          Describe what you'd like to write or edit
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 anim-fade-in">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' }}
            >
              <span className="text-2xl">✍️</span>
            </div>
            <h3 className="font-serif italic text-lg mb-1" style={{ color: 'var(--text1)' }}>
              Ready to write
            </h3>
            <p className="text-xs mb-6 max-w-[240px] leading-relaxed" style={{ color: 'var(--text3)' }}>
              Start a conversation or pick a prompt below to begin
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {STARTER_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="text-xs text-left px-3 py-2.5 rounded-xl transition-all duration-150"
                  style={{
                    background: 'var(--surface3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text2)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'
                    e.currentTarget.style.color = 'var(--text1)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text2)'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 rounded-xl text-xs anim-fade-in"
          style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={onClearError}><X size={12} /></button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <form onSubmit={submit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target) }}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to write or edit?"
              rows={1}
              disabled={loading}
              style={{ minHeight: '42px', maxHeight: '150px' }}
              className="input pr-3"
            />
          </div>
          <button type="submit" disabled={loading || !input.trim()} className="btn-primary h-[42px] px-4 shrink-0">
            {loading
              ? <Loader2 size={15} className="anim-spin" />
              : <Send size={15} />
            }
          </button>
        </form>
        <p className="text-center mt-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
