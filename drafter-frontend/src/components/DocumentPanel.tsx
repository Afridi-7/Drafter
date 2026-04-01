import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText, Sparkles } from 'lucide-react'
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
          <div className="doc-surface min-h-full">
            <div className="max-w-[680px] mx-auto px-10 py-10">
              <div className="prose-doc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-full p-6" style={{ background: 'var(--surface)' }}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onSelect={handleTextSelect}
              onKeyDown={handleKeyDown}
              placeholder="Type here or use AI to edit..."
              className="w-full h-[calc(100vh-280px)] font-mono text-xs leading-relaxed p-5 rounded-xl resize-none"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                outline: 'none',
              }}
            />
            
            {/* Floating Edit Selection Button */}
            {selection && (
              <div className="fixed bottom-8 right-8 anim-scale-in">
                <button
                  onClick={handleEditSelection}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '14px',
                    zIndex: 50,
                    boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
                  }}
                >
                  <Sparkles size={18} />
                  <span>Edit Selection with AI</span>
                  <kbd 
                    className="ml-1 px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: '1px solid rgba(255,255,255,0.3)',
                    }}
                  >
                    Ctrl+E
                  </kbd>
                </button>
                
                {/* Selection info badge */}
                <div 
                  className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: '#10b981',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  {selection.text.split(/\s+/).length} words
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Edit Modal */}
      {showEditModal && selection && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
          onClick={handleCancelEdit}
        >
          <div 
            className="rounded-2xl shadow-2xl p-7 max-w-lg w-full mx-4"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-1" style={{ 
              color: '#1e293b',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              ✨ Edit Selection with AI
            </h3>
            <p className="text-xs mb-4" style={{ color: '#64748b' }}>
              Let AI transform your selected text
            </p>
            
            <div className="mb-5">
              <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>
                Selected ({selection.text.split(/\s+/).length} words)
              </p>
              <div 
                className="p-3 rounded-lg text-xs font-mono max-h-24 overflow-y-auto"
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                }}
              >
                {selection.text.substring(0, 200)}
                {selection.text.length > 200 && '...'}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold mb-2" style={{ color: '#334155' }}>
                What should AI do?
              </label>
              <input
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitEdit()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                placeholder="Make it concise, Fix grammar, Add examples..."
                autoFocus
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{
                  background: '#ffffff',
                  border: '2px solid #e2e8f0',
                  color: '#1e293b',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
                💡 Press <kbd style={{ 
                  background: '#f1f5f9', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11px'
                }}>Enter</kbd> to submit, <kbd style={{ 
                  background: '#f1f5f9', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11px'
                }}>Esc</kbd> to cancel
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelEdit}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:bg-gray-100"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEdit}
                disabled={!editInstruction.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)',
                }}
              >
                ✨ Edit with AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
