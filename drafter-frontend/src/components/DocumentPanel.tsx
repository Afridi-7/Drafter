// src/components/DocumentPanel.tsx
import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  title:     string
  content:   string
  undoCount: number
  redoCount: number
}

function StatsBar({ content }: { content: string }) {
  const words    = content.trim() ? content.split(/\s+/).length : 0
  const chars    = content.length
  const paras    = content.trim() ? content.split(/\n\n+/).filter(p => p.trim()).length : 0
  const readTime = Math.max(1, Math.round(words / 200))

  const chips = [
    { label: 'words',     val: words.toLocaleString() },
    { label: 'chars',     val: chars.toLocaleString() },
    { label: 'paras',     val: paras },
    { label: 'min read',  val: `~${readTime}` },
  ]

  return (
    <div
      className="flex items-center gap-2 flex-wrap px-5 py-2 anim-fade-in"
      style={{
        background: 'var(--s2)',
        borderBottom: '1px solid var(--b1)',
      }}
    >
      {chips.map(c => (
        <span key={c.label} className="stat-chip">
          <b>{c.val}</b> {c.label}
        </span>
      ))}
    </div>
  )
}

export default function DocumentPanel({ title, content, undoCount, redoCount }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [copied,   setCopied]   = useState(false)

  const isEmpty = !content.trim()

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: isEmpty ? 'var(--bg)' : '#fcfcfd' }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between gap-4 anim-fade-in"
        style={{
          background: 'var(--s2)',
          borderBottom: '1px solid var(--b1)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={15} style={{ color: 'var(--t4)', flexShrink: 0 }} />
          <h2
            className="font-serif italic text-[1.1rem] truncate gradient-text-static"
          >
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isEmpty && (
            <button
              onClick={handleCopy}
              className={clsx('btn-ghost text-xs py-1.5 px-3', copied && 'btn-copied')}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}

          {!isEmpty && (
            <div className="view-toggle">
              <button
                className={clsx('view-tab', viewMode === 'preview' && 'active')}
                onClick={() => setViewMode('preview')}
              >
                <Eye size={11} /> Preview
              </button>
              <button
                className={clsx('view-tab', viewMode === 'source' && 'active')}
                onClick={() => setViewMode('source')}
              >
                <Code2 size={11} /> Source
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {!isEmpty && <StatsBar content={content} />}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (

          /* ── Empty state ── */
          <div
            className="flex flex-col items-center justify-center h-full text-center py-16 px-8 anim-fade-in"
          >
            {/* Floating file icon */}
            <div className="relative mb-5">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center anim-float"
                style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(236,72,153,0.06))',
                  border: '1px solid var(--b2)',
                  boxShadow: '0 0 40px rgba(124,58,237,0.12)',
                }}
              >
                <FileText size={32} style={{ color: 'var(--t4)' }} />
              </div>
              {/* Decorative orbs */}
              <div
                className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(124,58,237,0.2), transparent)',
                  filter: 'blur(8px)',
                  animation: 'blobFloat 5s ease-in-out infinite',
                }}
              />
              <div
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(236,72,153,0.2), transparent)',
                  filter: 'blur(6px)',
                  animation: 'blobFloat 7s ease-in-out infinite reverse',
                }}
              />
            </div>

            <p
              className="font-serif italic text-xl mb-2"
              style={{ color: 'var(--t3)' }}
            >
              Empty document
            </p>
            <p
              className="text-xs max-w-[210px] leading-relaxed"
              style={{ color: 'var(--t4)' }}
            >
              Your document will appear here as you write. Use the chat to get started.
            </p>
          </div>

        ) : viewMode === 'preview' ? (

          /* ── Rendered preview ── */
          <div className="doc-surface min-h-full anim-fade-in">
            <div className="max-w-[680px] mx-auto px-10 py-10">
              <div className="prose-doc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          </div>

        ) : (

          /* ── Raw source ── */
          <div
            className="min-h-full p-6 anim-fade-in"
            style={{ background: 'var(--bg)' }}
          >
            <pre
              className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words p-5 rounded-xl"
              style={{
                background: 'var(--s2)',
                border: '1px solid var(--b2)',
                color: 'var(--t2)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}