// src/components/DocumentPanel.tsx
import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText } from 'lucide-react'
import clsx from 'clsx'

interface DocumentPanelProps {
  title: string
  content: string
  undoCount: number
  redoCount: number
}

type ViewMode = 'preview' | 'source'

function StatsBar({ content }: { content: string }) {
  const words = content.trim() ? content.split(/\s+/).length : 0
  const chars = content.length
  const paragraphs = content.trim()
    ? content.split(/\n\n+/).filter((p) => p.trim()).length
    : 0
  const readTime = Math.max(1, Math.round(words / 200))

  return (
    <div className="flex items-center gap-4 px-5 py-3 bg-gradient-to-r from-blue-50/40 to-purple-50/40 border-b border-parchment-border/60 text-xs text-ink-600 font-medium">
      <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-blue-200/50">
        <span className="text-blue-600">{words.toLocaleString()}</span>
        <span className="text-ink-400">words</span>
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-purple-200/50">
        <span className="text-purple-600">{chars.toLocaleString()}</span>
        <span className="text-ink-400">chars</span>
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-cyan-200/50">
        <span className="text-cyan-600">{paragraphs}</span>
        <span className="text-ink-400">paragraphs</span>
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-emerald-200/50">
        <span className="text-emerald-600">~{readTime}</span>
        <span className="text-ink-400">min read</span>
      </span>
    </div>
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        copied
          ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/30'
          : 'bg-parchment border border-parchment-border text-ink-500 hover:text-ink-700 hover:bg-blue-50 hover:border-blue-300/40 hover:shadow-md'
      )}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function DocumentPanel({
  title,
  content,
  undoCount,
  redoCount,
}: DocumentPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')

  const isEmpty = !content.trim()

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-parchment-border/60 bg-gradient-to-r from-white via-blue-50/30 to-purple-50/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-blue-600 shrink-0" />
            <h2 className="font-display text-xl font-semibold bg-gradient-to-r from-ink-900 to-ink-800 bg-clip-text text-transparent truncate">{title}</h2>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2.5 shrink-0">
            {!isEmpty && <CopyButton content={content} />}

            {/* View toggle */}
            <div className="flex items-center bg-parchment-dark border border-parchment-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('preview')}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === 'preview'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-ink-500 hover:text-ink-700 hover:bg-white/50'
                )}
              >
                <Eye size={12} /> Preview
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === 'source'
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-ink-500 hover:text-ink-700 hover:bg-white/50'
                )}
              >
                <Code2 size={12} /> Source
              </button>
            </div>
          </div>
        </div>

        {/* Undo/redo info */}
        {(undoCount > 0 || redoCount > 0) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {undoCount > 0 && (
              <span className="stat-badge">
                ↩ {undoCount} undo{undoCount !== 1 ? 's' : ''} available
              </span>
            )}
            {redoCount > 0 && (
              <span className="stat-badge">
                ↪ {redoCount} redo{redoCount !== 1 ? 's' : ''} available
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      {!isEmpty && <StatsBar content={content} />}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-8 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 border border-blue-200/60
                            flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
              <FileText size={24} className="text-blue-600" />
            </div>
            <p className="font-display text-lg font-semibold text-ink-700 mb-2">Empty document</p>
            <p className="text-sm text-ink-500 max-w-xs leading-relaxed">
              Your document will appear here as you write. Use the chat to get started.
            </p>
          </div>
        ) : viewMode === 'preview' ? (
          <div className="doc-surface min-h-full px-8 py-8">
            <div className="max-w-2xl mx-auto doc-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <pre className="font-mono text-xs text-ink-700 whitespace-pre-wrap break-words
                            bg-gradient-to-br from-parchment to-parchment-dark border border-parchment-border/80
                            rounded-xl p-5 leading-relaxed shadow-sm hover:shadow-md transition-all duration-200">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
