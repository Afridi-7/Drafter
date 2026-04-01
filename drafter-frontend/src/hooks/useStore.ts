import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '../api/client'

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
  gmailConnected:  boolean
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
      documentContent: parsed.documentContent || '',
      documentTitle: parsed.documentTitle || 'Untitled Document',
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
      gmailConnected:  false,
    }
  })
  const initRef = useRef(false)

  // Persist to localStorage whenever state changes
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
      
      // Check Gmail connection status
      try {
        const gmailStatus = await api.checkGmailStatus(session_id)
        setState(s => ({ ...s, gmailConnected: gmailStatus.connected }))
      } catch {
        // Gmail status check failed, keep as false
      }
      
      // Check for OAuth callback success
      const params = new URLSearchParams(window.location.search)
      if (params.get('gmail_connected') === 'true') {
        setState(s => ({ ...s, gmailConnected: true }))
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
      }
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
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }

    const aiMsgId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setState(s => ({ ...s, chatMessages: [...s.chatMessages, userMsg, aiMsg] }))

    try {
      await api.sendMessageStream(
        state.sessionId!,
        message,
        state.documentTitle,
        (char: string) => {
          setState(s => ({
            ...s,
            chatMessages: s.chatMessages.map(m =>
              m.id === aiMsgId ? { ...m, content: m.content + char } : m
            ),
          }))
        },
        (data: any) => {
          setState(s => ({
            ...s,
            loading: false,
            documentContent: data.document_content ?? s.documentContent,
            undoCount: data.undo_count ?? s.undoCount,
            redoCount: data.redo_count ?? s.redoCount,
            lastSavedPath: data.last_saved_path || s.lastSavedPath,
          }))
        },
        (error: string) => {
          setState(s => ({ ...s, loading: false, error }))
        }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [state.sessionId, state.documentTitle])

  const sendMessageWithSelection = useCallback(async (
    message: string,
    selectionStart: number,
    selectionEnd: number,
    selectedText: string
  ) => {
    setState(s => ({ ...s, loading: true, error: null }))

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Edit selection: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}" - ${message}`,
      timestamp: new Date(),
    }

    const aiMsgId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setState(s => ({ ...s, chatMessages: [...s.chatMessages, userMsg, aiMsg] }))

    try {
      await api.sendMessageWithSelectionStream(
        state.sessionId!,
        message,
        state.documentTitle,
        selectionStart,
        selectionEnd,
        selectedText,
        (char: string) => {
          setState(s => ({
            ...s,
            chatMessages: s.chatMessages.map(m =>
              m.id === aiMsgId ? { ...m, content: m.content + char } : m
            ),
          }))
        },
        (data: any) => {
          setState(s => ({
            ...s,
            loading: false,
            documentContent: data.document_content ?? s.documentContent,
            undoCount: data.undo_count ?? s.undoCount,
            redoCount: data.redo_count ?? s.redoCount,
            lastSavedPath: data.last_saved_path || s.lastSavedPath,
          }))
        },
        (error: string) => {
          setState(s => ({ ...s, loading: false, error }))
        }
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [state.sessionId, state.documentTitle, state.documentContent])

  const setTitle = useCallback((title: string) => {
    setState(s => ({ ...s, documentTitle: title }))
  }, [])

  const updateDocumentContent = useCallback((newContent: string) => {
    setState(s => ({ ...s, documentContent: newContent }))
  }, [])

  const handleUndo = useCallback(() => {
    sendMessage('Undo the last change')
  }, [sendMessage])

  const handleRedo = useCallback(() => {
    sendMessage('Redo the last change')
  }, [sendMessage])

  const resetSession = useCallback(async () => {
    if (state.sessionId) {
      await api.deleteSession(state.sessionId).catch(() => {})
    }
    initRef.current = false

    const freshState = {
      sessionId: null,
      loading: false,
      initializing: true,
      error: null,
      chatMessages: [],
      documentContent: '',
      documentTitle: 'Untitled Document',
      undoCount: 0,
      redoCount: 0,
      lastSavedPath: '',
      gmailConnected: false,
    }
    setState(freshState)
    saveToStorage({
      chatMessages: [],
      documentContent: '',
      documentTitle: 'Untitled Document',
    })

    // Delay re-init to ensure clean state
    setTimeout(async () => {
      initRef.current = false
      try {
        const { session_id } = await api.createSession()
        setState(s => ({ ...s, sessionId: session_id, initializing: false }))
      } catch {
        setState(s => ({ ...s, initializing: false }))
      }
    }, 100)
  }, [state.sessionId])

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }))
  }, [])

  const saveDocument = useCallback(
    async (format: 'md' | 'txt' | 'docx' | 'pdf'): Promise<string> => {
      if (!state.sessionId) throw new Error('No active session')
      try {
        const res = await api.saveDocument(state.sessionId, format)
        return res.b64 || res.document_b64 || ''
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to save document'
        setState(s => ({ ...s, error: msg }))
        throw e
      }
    },
    [state.sessionId]
  )

  const connectGmail = useCallback(() => {
    if (!state.sessionId) {
      setState(s => ({ ...s, error: 'No active session' }))
      return
    }
    const loginUrl = api.getGmailLoginUrl(state.sessionId)
    window.location.href = loginUrl
  }, [state.sessionId])

  const sendEmail = useCallback(
    async (to: string, subject: string, body: string): Promise<void> => {
      if (!state.sessionId) throw new Error('No active session')
      if (!state.gmailConnected) throw new Error('Gmail not connected')
      
      try {
        const result = await api.sendEmail({
          to,
          subject,
          body,
          session_id: state.sessionId,
        })
        
        if (!result.success) {
          throw new Error(result.message)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to send email'
        setState(s => ({ ...s, error: msg }))
        throw e
      }
    },
    [state.sessionId, state.gmailConnected]
  )

  return {
    state,
    initialize,
    sendMessage,
    sendMessageWithSelection,
    setTitle,
    updateDocumentContent,
    handleUndo,
    handleRedo,
    resetSession,
    clearError,
    saveDocument,
    connectGmail,
    sendEmail,
  }
}
