// src/components/DocumentPanel.tsx
import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  title:     string
  content:   string
}

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard.writeText(text).then(onDone).catch(() => {})
}

function StatsBar({ content }: { content: string }) {
  const words = content.trim() ? content.split(/\s+/).length : 0
  const chars = content.length
  const paras = content.trim() ? content.split(/\n\n+/).filter(p => p.trim()).length : 0
  const readTime = Math.max(1, Math.round(words / 200))

  return (
    <div
      className="flex items-center gap-3 flex-wrap px-6 py-2 text-xs"
      style={{ background: 'var(--surface3)', borderBottom: '1px solid var(--border)' }}
    >
      <span className="stat-chip"><b>{words.toLocaleString()}</b> words</span>
      <span className="stat-chip"><b>{chars.toLocaleString()}</b> chars</span>
      <span className="stat-chip"><b>{paras}</b> paragraphs</span>
      <span className="stat-chip">~<b>{readTime}</b> min read</span>
    </div>
  )
}

export default function DocumentPanel({ title, content }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [copied, setCopied] = useState(false)

  const isEmpty = !content.trim()

  const handleCopy = () => {
    copyToClipboard(content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between gap-4"
        style={{
          background: 'var(--surface2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <h2 className="font-serif italic text-lg truncate" style={{ color: 'var(--text1)' }}>
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Copy button */}
          {!isEmpty && (
            <button
              onClick={handleCopy}
              className={clsx('btn-ghost text-xs py-1.5 px-3 transition-all', copied && 'text-emerald-400')}
              style={copied ? { color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' } : {}}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}

          {/* View toggle */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center py-16 px-8 anim-fade-in"
            style={{ background: 'var(--surface)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border)',
              }}
            >
              <FileText size={26} style={{ color: 'var(--text3)' }} />
            </div>
            <p className="font-serif italic text-lg mb-2" style={{ color: 'var(--text2)' }}>
              Empty document
            </p>
            <p className="text-xs max-w-[220px] leading-relaxed" style={{ color: 'var(--text3)' }}>
              Your document will appear here as you write. Use the chat to get started.
            </p>
          </div>
        ) : viewMode === 'preview' ? (
          <div className="doc-surface min-h-full">
            <div className="max-w-[680px] mx-auto px-10 py-10">
              <div className="prose-doc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-full p-6" style={{ background: 'var(--surface)' }}>
            <pre
              className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words p-5 rounded-xl"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
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
