import React, { useState } from 'react'
import {
  Feather, Zap, Download, Trash2, ChevronRight,
  FileText, File, FileType, BookOpen, RotateCcw, RotateCw,
} from 'lucide-react'
import clsx from 'clsx'

const QUICK_ACTIONS = [
  { emoji: '📝', label: 'New draft',       prompt: 'Write a professional draft for me' },
  { emoji: '✨', label: 'Improve writing', prompt: 'Improve the writing quality and flow' },
  { emoji: '📏', label: 'Make concise',    prompt: 'Make the document more concise' },
  { emoji: '🔍', label: 'Fix grammar',     prompt: 'Fix all grammar and spelling issues' },
  { emoji: '💡', label: 'Add examples',    prompt: 'Add concrete examples to support the content' },
  { emoji: '📊', label: 'Show stats',      prompt: 'Show document statistics' },
]

const FORMATS = [
  { value: 'md',   label: 'Markdown',  ext: '.md',   icon: FileText },
  { value: 'txt',  label: 'Plain Text',ext: '.txt',  icon: File     },
  { value: 'docx', label: 'Word',      ext: '.docx', icon: FileType },
  { value: 'pdf',  label: 'PDF',       ext: '.pdf',  icon: BookOpen },
]

interface SidebarProps {
  documentTitle: string
  undoCount:     number
  redoCount:     number
  lastSavedPath: string
  loading:       boolean
  onTitleChange: (t: string) => void
  onQuickAction: (prompt: string) => void
  onSave:        (format: string) => void
  onNewSession:  () => void
  onUndo:        () => void
  onRedo:        () => void
}

export default function Sidebar({
  documentTitle, undoCount, redoCount, lastSavedPath,
  loading, onTitleChange, onQuickAction, onSave, onNewSession,
  onUndo, onRedo,
}: SidebarProps) {
  const [saveFormat,    setSaveFormat]    = useState('md')
  const [editingTitle,  setEditingTitle]  = useState(false)
  const [titleDraft,    setTitleDraft]    = useState(documentTitle)

  const commitTitle = () => {
    const val = titleDraft.trim() || 'Untitled Document'
    onTitleChange(val)
    setEditingTitle(false)
  }

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col h-full overflow-hidden"
      style={{ 
        background: 'rgba(32,32,74,0.85)', 
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid var(--b1)',
        boxShadow: 'inset -1px 0 0 rgba(167,139,250,0.08)'
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="logo-icon">
            <Feather size={16} style={{ color: '#c4b5fd' }} />
          </div>
          <span className="font-serif italic text-xl gradient-text-static" style={{ color: 'var(--t1)' }}>
            Drafter
          </span>
        </div>
        <p className="text-xs pl-11" style={{ color: 'var(--t4)' }}>AI writing assistant</p>
      </div>

      <div
        className="flex-1 overflow-y-auto pb-3"
        style={{ '--scrollbar-width': '3px' } as React.CSSProperties}
      >

        {/* ── Document ── */}
        <div className="px-3 mb-4">
          <p className="sidebar-label mb-2">Document</p>

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => e.key === 'Enter' && commitTitle()}
              className="input text-xs py-2"
              placeholder="Document title…"
            />
          ) : (
            <button
              onClick={() => { setTitleDraft(documentTitle); setEditingTitle(true) }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left group"
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
              }}
            >
              <span className="truncate pr-2">{documentTitle}</span>
              <ChevronRight size={10} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            </button>
          )}

          {/* Undo / Redo row */}
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={onUndo}
              disabled={undoCount === 0 || loading}
              className="btn-ghost flex-1 text-xs py-1.5"
              title="Undo"
            >
              <RotateCcw size={11} />
              {undoCount > 0 && <span>{undoCount}</span>}
            </button>
            <button
              onClick={onRedo}
              disabled={redoCount === 0 || loading}
              className="btn-ghost flex-1 text-xs py-1.5"
              title="Redo"
            >
              <RotateCw size={11} />
              {redoCount > 0 && <span>{redoCount}</span>}
            </button>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="mx-3 mb-4" style={{ height: '1px', background: 'var(--border)' }} />

        {/* ── Quick Actions ── */}
        <div className="px-3 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={10} style={{ color: 'var(--text3)' }} />
            <p className="sidebar-label">Quick actions</p>
          </div>
          <div className="space-y-0.5">
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => onQuickAction(a.prompt)}
                disabled={loading}
                className="nav-item"
              >
                <span className="text-sm leading-none">{a.emoji}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="mx-3 mb-4" style={{ height: '1px', background: 'var(--border)' }} />

        {/* ── Export ── */}
        <div className="px-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Download size={10} style={{ color: 'var(--text3)' }} />
            <p className="sidebar-label">Export</p>
          </div>

          <div className="space-y-1.5 mb-3">
            {FORMATS.map(fmt => {
              const Icon = fmt.icon
              return (
                <label
                  key={fmt.value}
                  className={clsx('format-card', saveFormat === fmt.value && 'selected')}
                  onClick={() => setSaveFormat(fmt.value)}
                >
                  <div className="radio-dot" />
                  <Icon size={13} style={{ color: saveFormat === fmt.value ? '#a78bfa' : 'var(--text3)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: saveFormat === fmt.value ? '#ede9fe' : 'var(--text2)' }}>
                      {fmt.label}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text3)' }}>{fmt.ext}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <button
            onClick={() => onSave(saveFormat)}
            disabled={loading}
            className="btn-primary w-full text-xs py-2.5"
          >
            <Download size={12} />
            Save & Download
          </button>

          {lastSavedPath && (
            <p className="text-xs mt-2 truncate" style={{ color: '#34d399' }}>
              ✓ {lastSavedPath.split('/').pop()}
            </p>
          )}
        </div>
      </div>

      {/* ── Bottom ── */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onNewSession}
          className="nav-item w-full"
          style={{ color: '#f87171' }}
        >
          <Trash2 size={13} />
          <span>New session</span>
        </button>
      </div>
    </aside>
  )
}
