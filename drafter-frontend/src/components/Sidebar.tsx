// src/components/Sidebar.tsx
import React, { useState } from 'react'
import {
  FileText, Trash2, Download, Zap, ChevronRight,
  RefreshCw, BookOpen, Settings
} from 'lucide-react'
import { QUICK_ACTIONS } from '../hooks/useStore'

interface SidebarProps {
  documentTitle: string
  undoCount: number
  redoCount: number
  lastSavedPath: string
  onTitleChange: (t: string) => void
  onQuickAction: (prompt: string) => void
  onSave: (format: string) => void
  onNewSession: () => void
  loading: boolean
}

const FORMATS = [
  { value: 'md', label: 'Markdown', ext: '.md', icon: '📄' },
  { value: 'txt', label: 'Plain Text', ext: '.txt', icon: '📃' },
  { value: 'docx', label: 'Word Document', ext: '.docx', icon: '📝' },
]

export default function Sidebar({
  documentTitle,
  undoCount,
  redoCount,
  lastSavedPath,
  onTitleChange,
  onQuickAction,
  onSave,
  onNewSession,
  loading,
}: SidebarProps) {
  const [saveFormat, setSaveFormat] = useState('md')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(documentTitle)

  const commitTitle = () => {
    onTitleChange(titleDraft.trim() || 'Untitled Document')
    setEditingTitle(false)
  }

  return (
    <aside className="w-64 shrink-0 bg-ink-950 flex flex-col h-full overflow-hidden border-r border-white/5">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-2xl">✍️</span>
          <span className="font-display text-xl text-white tracking-tight">Drafter</span>
        </div>
        <p className="text-xs text-ink-400 font-body">AI writing assistant</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {/* Document title */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-2">
            <FileText size={12} className="text-ink-400" />
            <span className="text-xs font-medium text-ink-400 uppercase tracking-widest">Document</span>
          </div>
          {editingTitle ? (
            <div className="px-1">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
                className="w-full bg-white/10 text-white text-sm px-3 py-2 rounded-lg
                           border border-white/20 focus:outline-none focus:border-white/40
                           placeholder:text-ink-400"
                placeholder="Document title..."
              />
            </div>
          ) : (
            <button
              onClick={() => { setTitleDraft(documentTitle); setEditingTitle(true) }}
              className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10
                         transition-colors group flex items-center justify-between"
            >
              <span className="text-sm text-white/80 truncate">{documentTitle}</span>
              <ChevronRight size={12} className="text-ink-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* History indicators */}
          <div className="flex gap-2 px-1 mt-2">
            {undoCount > 0 && (
              <span className="text-xs text-ink-400 bg-white/5 px-2 py-0.5 rounded-md">
                ↩️ {undoCount} undo
              </span>
            )}
            {redoCount > 0 && (
              <span className="text-xs text-ink-400 bg-white/5 px-2 py-0.5 rounded-md">
                ↪️ {redoCount} redo
              </span>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-white/5" />

        {/* Quick actions */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-2">
            <Zap size={12} className="text-ink-400" />
            <span className="text-xs font-medium text-ink-400 uppercase tracking-widest">Quick Actions</span>
          </div>
          <div className="space-y-0.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => onQuickAction(action.prompt)}
                disabled={loading}
                className="sidebar-item text-left"
              >
                <span className="text-base leading-none">{action.icon}</span>
                <span className="text-sm">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-white/5" />

        {/* Save */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-2">
            <Download size={12} className="text-ink-400" />
            <span className="text-xs font-medium text-ink-400 uppercase tracking-widest">Export</span>
          </div>

          <div className="space-y-1.5 px-1">
            {FORMATS.map((fmt) => (
              <label
                key={fmt.value}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all
                  ${saveFormat === fmt.value
                    ? 'bg-white/15 text-white'
                    : 'text-ink-300 hover:bg-white/8 hover:text-white'
                  }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={fmt.value}
                  checked={saveFormat === fmt.value}
                  onChange={() => setSaveFormat(fmt.value)}
                  className="sr-only"
                />
                <span>{fmt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{fmt.label}</div>
                  <div className="text-xs text-ink-400">{fmt.ext}</div>
                </div>
                {saveFormat === fmt.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-accent" />
                )}
              </label>
            ))}

            <button
              onClick={() => onSave(saveFormat)}
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2
                         bg-amber-accent/20 hover:bg-amber-accent/30
                         text-amber-accent border border-amber-accent/30
                         px-3 py-2 rounded-lg text-sm font-medium
                         transition-all duration-150 disabled:opacity-40"
            >
              <Download size={14} />
              Save & Download
            </button>

            {lastSavedPath && (
              <p className="text-xs text-jade px-1 mt-1 truncate">
                ✓ {lastSavedPath.split('/').pop()}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-white/5 p-3 space-y-1">
        <button
          onClick={onNewSession}
          className="sidebar-item w-full text-crimson/80 hover:text-crimson hover:bg-crimson/10"
        >
          <RefreshCw size={14} />
          <span>New Session</span>
        </button>
      </div>
    </aside>
  )
}
