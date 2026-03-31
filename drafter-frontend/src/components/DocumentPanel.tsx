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
    <div className="flex items-center gap-4 px-5 py-2.5 bg-parchment-dark border-b border-parchment-border text-xs text-ink-400">
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-ink-700">{words.toLocaleString()}</span> words
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-ink-700">{chars.toLocaleString()}</span> chars
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-ink-700">{paragraphs}</span> paragraphs
      </span>
      <span className="text-parchment-border">·</span>
      <span className="flex items-center gap-1.5">
        ~<span className="font-medium text-ink-700">{readTime}</span> min read
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
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all',
        copied
          ? 'bg-jade/10 text-jade'
          : 'bg-parchment-dark text-ink-400 hover:text-ink-700 hover:bg-parchment-border'
      )}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-parchment-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-ink-400 shrink-0" />
            <h2 className="font-display text-xl text-ink-900 truncate">{title}</h2>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            {!isEmpty && <CopyButton content={content} />}

            {/* View toggle */}
            <div className="flex items-center bg-parchment-dark border border-parchment-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('preview')}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all',
                  viewMode === 'preview'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                )}
              >
                <Eye size={11} /> Preview
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all',
                  viewMode === 'source'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                )}
              >
                <Code2 size={11} /> Source
              </button>
            </div>
          </div>
        </div>

        {/* Undo/redo info */}
        {(undoCount > 0 || redoCount > 0) && (
          <div className="flex gap-2 mt-2">
            {undoCount > 0 && (
              <span className="text-xs text-ink-400 bg-parchment-dark px-2 py-0.5 rounded-full border border-parchment-border">
                ↩ {undoCount} undo{undoCount !== 1 ? 's' : ''} available
              </span>
            )}
            {redoCount > 0 && (
              <span className="text-xs text-ink-400 bg-parchment-dark px-2 py-0.5 rounded-full border border-parchment-border">
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
            <div className="w-16 h-16 rounded-full bg-parchment-dark border border-parchment-border
                            flex items-center justify-center mb-4">
              <FileText size={24} className="text-ink-300" />
            </div>
            <p className="font-display text-lg text-ink-500 mb-2">Empty document</p>
            <p className="text-sm text-ink-400 max-w-xs leading-relaxed">
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
                            bg-parchment-dark border border-parchment-border
                            rounded-xl p-5 leading-relaxed">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
