// src/components/Sidebar.tsx
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
  { value: 'md',   label: 'Markdown',   ext: '.md',   icon: FileText },
  { value: 'txt',  label: 'Plain Text', ext: '.txt',  icon: File     },
  { value: 'docx', label: 'Word',       ext: '.docx', icon: FileType },
  { value: 'pdf',  label: 'PDF',        ext: '.pdf',  icon: BookOpen },
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
  const [saveFormat,   setSaveFormat]   = useState('md')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft,   setTitleDraft]   = useState(documentTitle)

  const commitTitle = () => {
    onTitleChange(titleDraft.trim() || 'Untitled Document')
    setEditingTitle(false)
  }

  return (
    <aside
      className="w-[215px] shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        background: 'var(--s1)',
        borderRight: '1px solid var(--b1)',
      }}
    >
      {/* ── Logo ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="logo-icon anim-fade-in">
            <Feather size={14} style={{ color: '#c4b5fd' }} />
          </div>
          <span className="font-serif italic text-[1.15rem] gradient-text-static anim-fade-in" style={{ animationDelay: '60ms' }}>
            Drafter
          </span>
        </div>
        <p className="text-[11px] pl-[42px] anim-fade-in" style={{ color: 'var(--t4)', animationDelay: '120ms' }}>
          AI writing assistant
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-3 space-y-1">

        {/* ── Document ── */}
        <div className="px-3 pt-2 pb-3 anim-slide-left" style={{ animationDelay: '80ms' }}>
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
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left"
              style={{
                background: 'var(--s3)',
                border: '1px solid var(--b1)',
                color: 'var(--t2)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--b3)'
                e.currentTarget.style.boxShadow = 'var(--glow-sm)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--b1)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <span className="truncate pr-2">{documentTitle}</span>
              <ChevronRight size={10} style={{ color: 'var(--t4)', flexShrink: 0 }} />
            </button>
          )}

          {/* Undo / Redo */}
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={onUndo}
              disabled={undoCount === 0 || loading}
              className="btn-ghost flex-1 text-xs py-1.5 gap-1.5"
              title="Undo last change"
            >
              <RotateCcw size={11} />
              <span>{undoCount > 0 ? undoCount : ''}</span>
            </button>
            <button
              onClick={onRedo}
              disabled={redoCount === 0 || loading}
              className="btn-ghost flex-1 text-xs py-1.5 gap-1.5"
              title="Redo last change"
            >
              <RotateCw size={11} />
              <span>{redoCount > 0 ? redoCount : ''}</span>
            </button>
          </div>
        </div>

        <div className="divider" />

        {/* ── Quick Actions ── */}
        <div className="px-3 py-3 anim-slide-left" style={{ animationDelay: '140ms' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={10} style={{ color: 'var(--t4)' }} />
            <p className="sidebar-label">Quick actions</p>
          </div>
          <div className="space-y-0.5 stagger">
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => onQuickAction(a.prompt)}
                disabled={loading}
                className="nav-item anim-slide-left"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>{a.emoji}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* ── Export ── */}
        <div className="px-3 py-3 anim-slide-left" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Download size={10} style={{ color: 'var(--t4)' }} />
            <p className="sidebar-label">Export</p>
          </div>

          <div className="space-y-1.5 mb-3">
            {FORMATS.map(fmt => {
              const Icon = fmt.icon
              const sel  = saveFormat === fmt.value
              return (
                <label
                  key={fmt.value}
                  className={clsx('format-card', sel && 'selected')}
                  onClick={() => setSaveFormat(fmt.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="radio-dot" />
                  <Icon size={13} style={{ color: sel ? '#c4b5fd' : 'var(--t4)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="text-xs font-semibold" style={{ color: sel ? '#ede9fe' : 'var(--t2)' }}>
                      {fmt.label}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--t4)' }}>{fmt.ext}</div>
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
            <p className="text-[11px] mt-2 truncate flex items-center gap-1.5 anim-fade-in" style={{ color: '#34d399' }}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }}
              />
              {lastSavedPath.split('/').pop()}
            </p>
          )}
        </div>
      </div>

      {/* ── Bottom ── */}
      <div className="p-3" style={{ borderTop: '1px solid var(--b1)' }}>
        <button
          onClick={onNewSession}
          className="nav-item w-full text-[12px]"
          style={{ color: '#f87171' }}
        >
          <Trash2 size={13} />
          <span>New session</span>
        </button>
      </div>
    </aside>
  )
}