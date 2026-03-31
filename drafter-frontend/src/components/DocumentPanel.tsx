// src/components/DocumentPanel.tsx
import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Eye, Code2, FileText, Download, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  title:     string
  content:   string
  undoCount: number
  redoCount: number
  onSave?:   (format: 'md' | 'txt' | 'docx') => Promise<string>
}

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard.writeText(text).then(onDone).catch(() => {})
}

function triggerDownloadFromBase64(b64: string, format: 'md' | 'txt' | 'docx', filename: string) {
  try {
    const binaryString = atob(b64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const mimeTypes: Record<string, string> = {
      md: 'text/markdown; charset=utf-8',
      txt: 'text/plain; charset=utf-8',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }

    const blob = new Blob([bytes], { type: mimeTypes[format] })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.${format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Download error:', error)
    throw new Error('Failed to download file')
  }
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

export default function DocumentPanel({ title, content, undoCount, redoCount, onSave }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [copied, setCopied] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const isEmpty = !content.trim()

  const handleCopy = () => {
    copyToClipboard(content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownload = async (format: 'md' | 'txt' | 'docx') => {
    setDownloadingFormat(format)
    setDownloadError(null)
    try {
      let b64: string

      if (onSave) {
        // Get base64 from backend
        b64 = await onSave(format)
      } else {
        // Fallback: client-side conversion to base64
        const mimeTypes: Record<string, string> = {
          md: 'text/markdown',
          txt: 'text/plain',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }
        const blob = new Blob([content], { type: mimeTypes[format] })
        b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1] || '')
          }
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }

      if (!b64) throw new Error('Invalid file data')

      const safe = title.replace(/[^\w\-]/g, '_').slice(0, 30) || 'document'
      triggerDownloadFromBase64(b64, format, safe)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Download failed'
      setDownloadError(msg)
      console.error('Download error:', error)
    } finally {
      setDownloadingFormat(null)
      setTimeout(() => setShowDownloadMenu(false), 500)
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

          {/* Download button with dropdown */}
          {!isEmpty && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className="btn-ghost text-xs py-1.5 px-3"
                title="Download document"
              >
                <Download size={12} /> Download
              </button>
              {showDownloadMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.25rem',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    zIndex: 10,
                    minWidth: '150px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  {(['md', 'txt', 'docx'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => handleDownload(fmt)}
                      disabled={downloadingFormat !== null}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        textAlign: 'left',
                        fontSize: '12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: downloadingFormat !== null ? 'not-allowed' : 'pointer',
                        color: downloadingFormat !== null ? 'var(--text3)' : 'var(--text1)',
                        borderBottom: fmt === 'txt' ? '1px solid var(--border)' : 'none',
                        opacity: downloadingFormat !== null ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (downloadingFormat === null) {
                          (e.target as HTMLButtonElement).style.background = 'var(--surface3)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.background = 'transparent'
                      }}
                    >
                      {downloadingFormat === fmt ? (
                        <>
                          <Loader2 size={10} className="anim-spin" style={{ display: 'inline', marginRight: '0.25rem' }} />
                          {fmt.toUpperCase()}
                        </>
                      ) : (
                        fmt.toUpperCase()
                      )}
                    </button>
                  ))}
                  {downloadError && (
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '11px',
                        color: '#fb7185',
                        borderTop: '1px solid var(--border)',
                        textAlign: 'center',
                      }}
                    >
                      {downloadError}
                    </div>
                  )}
                </div>
              )}
            </div>
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
