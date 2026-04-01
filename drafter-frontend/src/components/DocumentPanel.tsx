import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  title:     string
  content:   string
  onContentChange?: (newContent: string) => void
  onEditSelection?: (instruction: string, selectedText: string, selectionStart: number, selectionEnd: number) => void
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

export default function DocumentPanel({ title, content, onContentChange, onEditSelection }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [copied, setCopied] = useState(false)
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isEmpty = !content.trim()

  const handleCopy = () => {
    copyToClipboard(content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleTextSelect = () => {
    if (!textareaRef.current) return
    
    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd
    const selectedText = content.substring(start, end)
    
    if (selectedText.length > 0) {
      setSelection({ start, end, text: selectedText })
    } else {
      setSelection(null)
    }
  }

  const handleEditSelection = () => {
    if (selection && onEditSelection) {
      setShowEditModal(true)
    }
  }

  const handleSubmitEdit = () => {
    if (selection && onEditSelection && editInstruction.trim()) {
      onEditSelection(editInstruction, selection.text, selection.start, selection.end)
      setShowEditModal(false)
      setEditInstruction('')
      setSelection(null)
    }
  }

  const handleCancelEdit = () => {
    setShowEditModal(false)
    setEditInstruction('')
  }

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmitEdit()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+E or Cmd+E to edit selection
    if ((e.ctrlKey || e.metaKey) && e.key === 'e' && selection) {
      e.preventDefault()
      handleEditSelection()
    }
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onContentChange) {
      onContentChange(e.target.value)
    }
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
          <div className="prose prose-invert max-w-none px-6 py-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="relative h-full">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onMouseUp={handleTextSelect}
              onKeyUp={handleTextSelect}
              onKeyDown={handleKeyDown}
              className="w-full h-full p-6 bg-transparent font-mono text-sm resize-none outline-none"
              style={{ color: 'var(--text1)' }}
              spellCheck="false"
            />

            {selection && onEditSelection && (
              <div
                className="absolute bottom-4 right-4 rounded-xl px-3 py-2 flex items-center gap-2 anim-fade-in"
                style={{
                  background: 'linear-gradient(135deg, rgba(76,29,149,0.92), rgba(3,105,161,0.92))',
                  border: '1px solid rgba(196,181,253,0.35)',
                  boxShadow: '0 14px 34px rgba(0,0,0,0.45), 0 0 0 1px rgba(196,181,253,0.12) inset',
                }}
              >
                <span className="text-xs" style={{ color: 'rgba(237,233,254,0.9)' }}>
                  {selection.text.length} chars selected
                </span>
                <button
                  onClick={handleEditSelection}
                  className="text-xs font-semibold rounded-lg px-2.5 py-1.5"
                  style={{
                    color: '#0f172a',
                    background: 'linear-gradient(135deg, #c4b5fd, #67e8f9)',
                  }}
                >
                  Edit With AI
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!isEmpty && viewMode === 'source' && (
        <div className="px-6 py-2 text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text3)' }}>
          Select text and press <b>Ctrl/Cmd + E</b> or use the floating <b>Edit With AI</b> action.
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selection && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{
            background:
              'radial-gradient(circle at 18% 18%, rgba(56,189,248,0.2), transparent 42%), radial-gradient(circle at 82% 78%, rgba(192,132,252,0.2), transparent 42%), rgba(2,6,23,0.75)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="max-w-xl w-full rounded-2xl p-5 anim-scale-in"
            style={{
              background: 'linear-gradient(155deg, rgba(30,41,59,0.96), rgba(49,46,129,0.93) 60%, rgba(14,116,144,0.9))',
              border: '1px solid rgba(196,181,253,0.35)',
              boxShadow: '0 30px 80px rgba(2,6,23,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(186,230,253,0.85)' }}>
              AI Selection Edit
            </p>
            <h3 className="text-lg font-semibold mb-3" style={{ color: '#eef2ff' }}>
              Tell AI How To Transform This Selection
            </h3>

            <div
              className="mb-4 rounded-xl p-3 text-xs leading-relaxed max-h-28 overflow-y-auto"
              style={{
                background: 'rgba(15,23,42,0.46)',
                border: '1px solid rgba(148,163,184,0.28)',
                color: 'rgba(226,232,240,0.9)',
              }}
            >
              {selection.text}
            </div>

            <input
              autoFocus
              type="text"
              value={editInstruction}
              onChange={e => setEditInstruction(e.target.value)}
              onKeyDown={handleModalKeyDown}
              placeholder="Example: Rewrite this to sound more confident and concise"
              className="input w-full mb-4"
              style={{ color: 'var(--text1)' }}
            />

            <div className="flex gap-2">
              <button
                onClick={handleSubmitEdit}
                disabled={!editInstruction.trim()}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
                style={{
                  color: '#0f172a',
                  background: 'linear-gradient(135deg, #c4b5fd, #67e8f9)',
                  opacity: editInstruction.trim() ? 1 : 0.45,
                }}
              >
                Send To AI
              </button>
              <button onClick={handleCancelEdit} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
