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
    <aside className="w-64 shrink-0 bg-gradient-to-b from-ink-950 to-ink-900 flex flex-col h-full overflow-hidden border-r border-white/5">
      {/* Logo with gradient accent */}
      <div className="px-5 pt-6 pb-5 border-b border-white/5 bg-gradient-to-r from-transparent to-blue-600/5">
        <div className="flex items-center gap-2.5 mb-1 group">
          <span className="text-2xl group-hover:animate-bounce-gentle transition-all">✍️</span>
          <div>
            <span className="font-display text-xl bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent tracking-tight">Drafter</span>
            <p className="text-xs text-ink-400 font-body">AI writing assistant</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {/* Document title */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-3">
            <FileText size={12} className="text-blue-400" />
            <span className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Document</span>
          </div>
          {editingTitle ? (
            <div className="px-1">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
                className="w-full bg-white/10 text-white text-sm px-3 py-2.5 rounded-lg
                           border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400
                           placeholder:text-ink-400 transition-all duration-200"
                placeholder="Document title..."
              />
            </div>
          ) : (
            <button
              onClick={() => { setTitleDraft(documentTitle); setEditingTitle(true) }}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10
                         transition-all duration-200 group flex items-center justify-between border border-white/5 hover:border-blue-500/20"
            >
              <span className="text-sm text-white/80 truncate">{documentTitle}</span>
              <ChevronRight size={12} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* History indicators */}
          <div className="flex gap-2 px-1 mt-2.5 flex-wrap">
            {undoCount > 0 && (
              <span className="text-xs text-emerald-400 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 px-2.5 py-1 rounded-full border border-emerald-400/20">
                ↩️ {undoCount} undo
              </span>
            )}
            {redoCount > 0 && (
              <span className="text-xs text-cyan-400 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 px-2.5 py-1 rounded-full border border-cyan-400/20">
                ↪️ {redoCount} redo
              </span>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="section-divider" />

        {/* Quick actions */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-3">
            <Zap size={12} className="text-amber-accent" />
            <span className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Quick Actions</span>
          </div>
          <div className="space-y-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => onQuickAction(action.prompt)}
                disabled={loading}
                className="sidebar-item text-left hover:from-purple-500/15 hover:to-blue-500/15"
              >
                <span className="text-base leading-none">{action.icon}</span>
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Divider */}
        <div className="section-divider" />

        {/* Save */}
        <section>
          <div className="flex items-center gap-2 px-2 mb-3">
            <Download size={12} className="text-emerald-400" />
            <span className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Export</span>
          </div>

          <div className="space-y-1.5 px-1">
            {FORMATS.map((fmt) => (
              <label
                key={fmt.value}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                  ${saveFormat === fmt.value
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-400/40'
                    : 'text-ink-300 hover:bg-gradient-to-r hover:from-white/8 hover:to-white/5 hover:text-white border border-white/5 hover:border-white/10'
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
                <span className="text-lg">{fmt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold">{fmt.label}</div>
                  <div className="text-xs text-ink-400">{fmt.ext}</div>
                </div>
                {saveFormat === fmt.value && (
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400" />
                )}
              </label>
            ))}

            <button
              onClick={() => onSave(saveFormat)}
              disabled={loading}
              className="btn-accent w-full mt-3"
            >
              <Download size={14} />
              Save & Download
            </button>

            {lastSavedPath && (
              <p className="text-xs text-emerald-400 px-1 mt-2 truncate flex items-center gap-1">
                <span>✓</span> {lastSavedPath.split('/').pop()}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-white/5 p-3 space-y-1">
        <button
          onClick={onNewSession}
          className="sidebar-item w-full text-rose-400 hover:text-rose-300 hover:from-rose-500/15 hover:to-rose-500/10 hover:border-rose-500/20"
        >
          <RefreshCw size={14} />
          <span>New Session</span>
        </button>
      </div>
    </aside>
  )
}
