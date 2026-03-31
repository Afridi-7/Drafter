// src/hooks/useStore.ts
import { useState, useCallback, useRef } from 'react'
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

export function useStore() {
  const [state, setState] = useState<AppState>({
    sessionId:       null,
    loading:         false,
    initializing:    true,
    error:           null,
    chatMessages:    [],
    documentContent: '',
    documentTitle:   'Untitled Document',
    undoCount:       0,
    redoCount:       0,
    lastSavedPath:   '',
  })
  const initRef = useRef(false)

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
    setState({
      sessionId: null, loading: false, initializing: true, error: null,
      chatMessages: [], documentContent: '', documentTitle: 'Untitled Document',
      undoCount: 0, redoCount: 0, lastSavedPath: '',
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
