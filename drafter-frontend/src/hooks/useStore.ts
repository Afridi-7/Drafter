// src/hooks/useStore.ts
import { useState, useCallback, useRef, useEffect } from 'react'
import { api, triggerDownload } from '../api/client'

export interface ChatMessage {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  tools?:    string[]
  timestamp: Date
}

export interface AppState {
  sessionId:       string | null
  loading:         boolean
  initializing:    boolean
  error:           string | null
  chatMessages:    ChatMessage[]
  documentContent: string
  documentTitle:   string
  undoCount:       number
  redoCount:       number
  lastSavedPath:   string
}

interface PersistedState {
  chatMessages:    ChatMessage[]
  documentContent: string
  documentTitle:   string
}

const STORAGE_KEY = 'drafter_state'

const loadFromStorage = (): Partial<PersistedState> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as PersistedState
    return {
      chatMessages: parsed.chatMessages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp)
      })),
      documentContent: parsed.documentContent,
      documentTitle: parsed.documentTitle,
    }
  } catch {
    return {}
  }
}

const saveToStorage = (state: Partial<PersistedState>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Silently fail if storage is full or unavailable
  }
}

export function useStore() {
  const [state, setState] = useState<AppState>(() => {
    const persisted = loadFromStorage()
    return {
      sessionId:       null,
      loading:         false,
      initializing:    true,
      error:           null,
      chatMessages:    persisted.chatMessages || [],
      documentContent: persisted.documentContent || '',
      documentTitle:   persisted.documentTitle || 'Untitled Document',
      undoCount:       0,
      redoCount:       0,
      lastSavedPath:   '',
    }
  })
  const initRef = useRef(false)

  useEffect(() => {
    saveToStorage({
      chatMessages: state.chatMessages,
      documentContent: state.documentContent,
      documentTitle: state.documentTitle,
    })
  }, [state.chatMessages, state.documentContent, state.documentTitle])

  const initialize = useCallback(async () => {
    if (initRef.current) return
    initRef.current = true
    try {
      const { session_id } = await api.createSession()
      setState(s => ({ ...s, sessionId: session_id, initializing: false }))
    } catch {
      setState(s => ({
        ...s,
        initializing: false,
        error: 'Failed to connect to backend. Is the server running on port 8000?',
      }))
    }
  }, [])

  const sendMessage = useCallback(async (message: string) => {
    setState(s => ({ ...s, loading: true, error: null }))

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user',
      content: message, timestamp: new Date(),
    }
    setState(s => ({ ...s, chatMessages: [...s.chatMessages, userMsg] }))

    try {
      const res = await api.sendMessage(state.sessionId!, message, state.documentTitle)

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: res.ai_response, tools: res.tool_calls_made, timestamp: new Date(),
      }

      setState(s => ({
        ...s,
        loading:         false,
        chatMessages:    [...s.chatMessages, aiMsg],
        documentContent: res.document_content,
        undoCount:       res.undo_count,
        redoCount:       res.redo_count,
        lastSavedPath:   res.last_saved_path || s.lastSavedPath,
      }))

      if (res.last_saved_b64 && res.last_saved_format) {
        const safe = state.documentTitle.replace(/[^\w\-]/g, '_') || 'document'
        triggerDownload(res.last_saved_b64, res.last_saved_format, safe)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [state.sessionId, state.documentTitle])

  const setTitle = useCallback((title: string) => {
    setState(s => ({ ...s, documentTitle: title }))
  }, [])

  const handleUndo = useCallback(() => {
    sendMessage('Undo the last change')
  }, [sendMessage])

  const handleRedo = useCallback(() => {
    sendMessage('Redo the last change')
  }, [sendMessage])

  const resetSession = useCallback(async () => {
    if (state.sessionId) await api.deleteSession(state.sessionId).catch(() => {})
    initRef.current = false
    
    const freshState = {
      sessionId: null, loading: false, initializing: true, error: null,
      chatMessages: [], documentContent: '', documentTitle: 'Untitled Document',
      undoCount: 0, redoCount: 0, lastSavedPath: '',
    }
    setState(freshState)
    saveToStorage({
      chatMessages: [],
      documentContent: '',
      documentTitle: 'Untitled Document',
    })
    
    setTimeout(async () => {
      initRef.current = false
      try {
        const { session_id } = await api.createSession()
        setState(s => ({ ...s, sessionId: session_id, initializing: false }))
      } catch {
        setState(s => ({ ...s, initializing: false }))
      }
    }, 80)
  }, [state.sessionId])

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }))
  }, [])

  return { state, initialize, sendMessage, setTitle, handleUndo, handleRedo, resetSession, clearError }
}
