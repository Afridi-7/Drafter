import { useState, useCallback, useRef } from 'react'
import { api } from '../api/client'

interface SessionDocument {
  id: string
  title: string
  updated_at: number
}

interface PendingEmail {
  to: string
  subject: string
  body: string
}

interface PendingEmailOverrides {
  to?: string
  subject?: string
  body?: string
}

export interface ChatMessage {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  tools?:    string[]
  timestamp: Date
}

export interface AppState {
  sessionId:       string | null
  activeDocumentId: string | null
  documents:       SessionDocument[]
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
  pendingEmail:    PendingEmail | null
}

export function useStore() {
  const [state, setState] = useState<AppState>({
    sessionId:       null,
    activeDocumentId: null,
    documents:       [],
    loading:         false,
    initializing:    true,
    error:           null,
    chatMessages:    [],
    documentContent: '',
    documentTitle:   'Untitled Document',
    undoCount:       0,
    redoCount:       0,
    lastSavedPath:   '',
    gmailConnected:  false,
    pendingEmail:    null,
  })
  const initRef = useRef(false)

  const initialize = useCallback(async () => {
    if (initRef.current) return
    initRef.current = true
    try {
      const params = new URLSearchParams(window.location.search)
      const oauthSessionId = params.get('oauth_session_id')

      // If OAuth callback provided a bound session, reuse it.
      const sessionId = oauthSessionId || (await api.createSession()).session_id

      let documents: SessionDocument[] = []
      let activeDocumentId: string | null = null
      try {
        const docs = await api.listDocuments(sessionId)
        documents = docs.documents
        activeDocumentId = docs.active_document_id
      } catch {
        documents = []
        activeDocumentId = null
      }

      let activeDocState = null as any
      try {
        activeDocState = await api.getDocument(sessionId)
      } catch {
        activeDocState = null
      }

      setState(s => ({
        ...s,
        sessionId,
        activeDocumentId,
        documents,
        documentContent: activeDocState?.document_content ?? s.documentContent,
        documentTitle: activeDocState?.document_title ?? s.documentTitle,
        undoCount: activeDocState?.undo_count ?? s.undoCount,
        redoCount: activeDocState?.redo_count ?? s.redoCount,
        lastSavedPath: activeDocState?.last_saved_path ?? s.lastSavedPath,
        pendingEmail: activeDocState?.pending_email ?? s.pendingEmail,
        initializing: false,
      }))

      // Check Gmail connection status for the active session.
      try {
        const gmailStatus = await api.checkGmailStatus(sessionId)
        setState(s => ({ ...s, gmailConnected: gmailStatus.connected }))
      } catch {
        // Gmail status check failed, keep as false
      }

      // Handle OAuth callback query params.
      if (params.get('gmail_connected') === 'true') {
        setState(s => ({ ...s, gmailConnected: true }))
        window.history.replaceState({}, '', window.location.pathname)
      } else if (params.get('gmail_error')) {
        const reason = params.get('gmail_error') || 'unknown_error'
        setState(s => ({
          ...s,
          gmailConnected: false,
          error: `Gmail connection failed: ${reason}`,
        }))
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
            pendingEmail: data.pending_email ?? s.pendingEmail,
            documents: s.documents.map(d =>
              d.id === s.activeDocumentId ? { ...d, title: s.documentTitle, updated_at: Date.now() / 1000 } : d
            ),
          }))

          // Fallback: if stream payload omitted pending_email, pull latest state from backend.
          if (state.sessionId && data.pending_email === undefined) {
            void api.getDocument(state.sessionId)
              .then(doc => {
                if (doc.pending_email) {
                  setState(s => ({
                    ...s,
                    pendingEmail: {
                      to: doc.pending_email!.to,
                      subject: doc.pending_email!.subject,
                      body: doc.pending_email!.body,
                    },
                  }))
                }
              })
              .catch(() => {})
          }
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
            pendingEmail: data.pending_email ?? s.pendingEmail,
            documents: s.documents.map(d =>
              d.id === s.activeDocumentId ? { ...d, title: s.documentTitle, updated_at: Date.now() / 1000 } : d
            ),
          }))

          // Fallback: if stream payload omitted pending_email, pull latest state from backend.
          if (state.sessionId && data.pending_email === undefined) {
            void api.getDocument(state.sessionId)
              .then(doc => {
                if (doc.pending_email) {
                  setState(s => ({
                    ...s,
                    pendingEmail: {
                      to: doc.pending_email!.to,
                      subject: doc.pending_email!.subject,
                      body: doc.pending_email!.body,
                    },
                  }))
                }
              })
              .catch(() => {})
          }
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
    setState(s => ({
      ...s,
      documentTitle: title,
      documents: s.documents.map(d =>
        d.id === s.activeDocumentId ? { ...d, title } : d
      ),
    }))

    if (state.sessionId && state.activeDocumentId) {
      void api.syncDocument(state.sessionId, state.activeDocumentId, { title }).catch(() => {})
    }
  }, [state.sessionId, state.activeDocumentId])

  const updateDocumentContent = useCallback((newContent: string) => {
    setState(s => ({ ...s, documentContent: newContent }))
    if (state.sessionId && state.activeDocumentId) {
      void api.syncDocument(state.sessionId, state.activeDocumentId, { content: newContent }).catch(() => {})
    }
  }, [state.sessionId, state.activeDocumentId])

  const createDocument = useCallback(async (title?: string) => {
    if (!state.sessionId) return
    try {
      const doc = await api.createDocument(state.sessionId, { title })
      const docs = await api.listDocuments(state.sessionId)
      setState(s => ({
        ...s,
        documents: docs.documents,
        activeDocumentId: docs.active_document_id,
        documentTitle: doc.document_title,
        documentContent: doc.document_content,
        undoCount: doc.undo_count,
        redoCount: doc.redo_count,
        lastSavedPath: doc.last_saved_path,
        pendingEmail: doc.pending_email ?? null,
        chatMessages: [],
      }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create document'
      setState(s => ({ ...s, error: msg }))
    }
  }, [state.sessionId])

  const switchDocument = useCallback(async (documentId: string) => {
    if (!state.sessionId) return
    try {
      const doc = await api.switchDocument(state.sessionId, { document_id: documentId })
      setState(s => ({
        ...s,
        activeDocumentId: documentId,
        documentTitle: doc.document_title,
        documentContent: doc.document_content,
        undoCount: doc.undo_count,
        redoCount: doc.redo_count,
        lastSavedPath: doc.last_saved_path,
        pendingEmail: doc.pending_email ?? null,
        chatMessages: [],
      }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to switch document'
      setState(s => ({ ...s, error: msg }))
    }
  }, [state.sessionId])

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
      activeDocumentId: null,
      documents: [],
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
      pendingEmail: null,
    }
    setState(freshState)

    // Delay re-init to ensure clean state
    setTimeout(async () => {
      initRef.current = false
      try {
        const { session_id } = await api.createSession()
        let documents: SessionDocument[] = []
        let activeDocumentId: string | null = null
        try {
          const docs = await api.listDocuments(session_id)
          documents = docs.documents
          activeDocumentId = docs.active_document_id
        } catch {
          documents = []
          activeDocumentId = null
        }

        let activeDocState = null as any
        try {
          activeDocState = await api.getDocument(session_id)
        } catch {
          activeDocState = null
        }

        let gmailConnected = false
        try {
          const gmailStatus = await api.checkGmailStatus(session_id)
          gmailConnected = gmailStatus.connected
        } catch {
          gmailConnected = false
        }
        setState(s => ({
          ...s,
          sessionId: session_id,
          activeDocumentId,
          documents,
          documentContent: activeDocState?.document_content ?? s.documentContent,
          documentTitle: activeDocState?.document_title ?? s.documentTitle,
          undoCount: activeDocState?.undo_count ?? s.undoCount,
          redoCount: activeDocState?.redo_count ?? s.redoCount,
          lastSavedPath: activeDocState?.last_saved_path ?? s.lastSavedPath,
          pendingEmail: activeDocState?.pending_email ?? s.pendingEmail,
          initializing: false,
          gmailConnected,
        }))
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

  const disconnectGmail = useCallback(async () => {
    if (!state.sessionId) {
      setState(s => ({ ...s, error: 'No active session' }))
      return
    }
    try {
      await api.disconnectGmail(state.sessionId)
      setState(s => ({ ...s, gmailConnected: false }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to disconnect Gmail'
      setState(s => ({ ...s, error: msg }))
    }
  }, [state.sessionId])

  const changeGmailAccount = useCallback(() => {
    connectGmail()
  }, [connectGmail])

  const confirmPendingEmail = useCallback(async (overrides?: PendingEmailOverrides): Promise<void> => {
    if (!state.sessionId) throw new Error('No active session')
    try {
      const result = await api.confirmPendingEmail(state.sessionId, overrides)
      if (!result.success) throw new Error(result.message)
      setState(s => ({
        ...s,
        pendingEmail: null,
        chatMessages: [
          ...s.chatMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `✅ ${result.message}`,
            timestamp: new Date(),
          },
        ],
      }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm email send'
      setState(s => ({ ...s, error: msg }))
      throw e
    }
  }, [state.sessionId])

  const cancelPendingEmail = useCallback(async (): Promise<void> => {
    if (!state.sessionId) throw new Error('No active session')
    try {
      await api.cancelPendingEmail(state.sessionId)
      setState(s => ({ ...s, pendingEmail: null }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to cancel email'
      setState(s => ({ ...s, error: msg }))
      throw e
    }
  }, [state.sessionId])

  return {
    state,
    initialize,
    sendMessage,
    sendMessageWithSelection,
    createDocument,
    switchDocument,
    setTitle,
    updateDocumentContent,
    handleUndo,
    handleRedo,
    resetSession,
    clearError,
    saveDocument,
    connectGmail,
    disconnectGmail,
    changeGmailAccount,
    confirmPendingEmail,
    cancelPendingEmail,
  }
}
