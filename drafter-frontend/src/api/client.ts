const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export interface SessionResponse {
  session_id: string
}

export interface MessageResponse {
  ai_response: string
  document_content: string
  undo_count: number
  redo_count: number
  last_saved_path: string
  last_saved_b64: string
  last_saved_format: string
  tool_calls_made: string[]
  pending_email?: PendingEmail | null
}

export interface PendingEmail {
  to: string
  subject: string
  body: string
}

export interface DocumentState {
  document_id?: string | null
  document_content: string
  document_title: string
  undo_count: number
  redo_count: number
  last_saved_path: string
  pending_email?: PendingEmail | null
}

export interface SessionDocument {
  id: string
  title: string
  updated_at: number
}

export interface DocumentsResponse {
  documents: SessionDocument[]
  active_document_id: string
}

export interface SaveResponse {
  document_b64: string
  b64: string
  format: string
  message: string
}

export interface GmailStatusResponse {
  connected: boolean
}

export interface GmailDisconnectResponse {
  success: boolean
  message: string
}

export interface PendingEmailActionResponse {
  success: boolean
  message: string
}

export interface PendingEmailConfirmRequest {
  to?: string
  subject?: string
  body?: string
}

export interface CreateDocumentRequest {
  title?: string
}

export interface SwitchDocumentRequest {
  document_id: string
}

export interface SyncDocumentRequest {
  title?: string
  content?: string
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(`API error ${res.status}`)
  }
  const data = await res.json()
  return data as Promise<T>
}

export const api = {
  createSession: () =>
    request<SessionResponse>('/sessions', { method: 'POST' }),

  getDocument: (sessionId: string) =>
    request<DocumentState>(`/sessions/${sessionId}/document`),

  listDocuments: (sessionId: string) =>
    request<DocumentsResponse>(`/sessions/${sessionId}/documents`),

  createDocument: (sessionId: string, payload?: CreateDocumentRequest) =>
    request<DocumentState>(`/sessions/${sessionId}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),

  switchDocument: (sessionId: string, payload: SwitchDocumentRequest) =>
    request<DocumentState>(`/sessions/${sessionId}/documents/switch`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  syncDocument: (sessionId: string, documentId: string, payload: SyncDocumentRequest) =>
    request<DocumentState>(`/sessions/${sessionId}/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  sendMessage: (
    sessionId: string,
    message: string,
    documentTitle: string
  ) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, document_title: documentTitle }),
    }),

  sendMessageStream: async (
    sessionId: string,
    message: string,
    documentTitle: string,
    onChunk: (char: string) => void,
    onComplete: (data: any) => void,
    onError: (err: string) => void
  ) => {
    try {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, document_title: documentTitle }),
      })

      if (!response.ok) throw new Error(`API error ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'chunk') {
                onChunk(data.text)
              } else if (data.type === 'complete') {
                onComplete(data)
              }
            } catch (e) {
              // Skip parsing errors
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onError(msg)
    }
  },

  sendMessageWithSelectionStream: async (
    sessionId: string,
    message: string,
    documentTitle: string,
    selectionStart: number,
    selectionEnd: number,
    selectedText: string,
    onChunk: (char: string) => void,
    onComplete: (data: any) => void,
    onError: (err: string) => void
  ) => {
    try {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages-selection-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          document_title: documentTitle,
          selection_start: selectionStart,
          selection_end: selectionEnd,
          selected_text: selectedText,
        }),
      })

      if (!response.ok) throw new Error(`API error ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'chunk') {
                onChunk(data.text)
              } else if (data.type === 'complete') {
                onComplete(data)
              }
            } catch (e) {
              // Skip parsing errors
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onError(msg)
    }
  },

  saveDocument: (
    sessionId: string,
    format: 'md' | 'txt' | 'docx' | 'pdf'
  ) =>
    request<SaveResponse>(`/sessions/${sessionId}/save`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    }),

  deleteSession: (sessionId: string) =>
    request<{ deleted: string }>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  // Gmail OAuth
  getGmailLoginUrl: (sessionId: string) =>
    `${API_BASE}/auth/google/login?session_id=${sessionId}`,

  checkGmailStatus: (sessionId: string) =>
    request<GmailStatusResponse>(`/auth/google/status?session_id=${sessionId}`),

  disconnectGmail: (sessionId: string) =>
    request<GmailDisconnectResponse>(`/auth/google/disconnect?session_id=${sessionId}`, {
      method: 'POST',
    }),

  confirmPendingEmail: (sessionId: string, payload?: PendingEmailConfirmRequest) =>
    request<PendingEmailActionResponse>(`/sessions/${sessionId}/email/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),

  cancelPendingEmail: (sessionId: string) =>
    request<PendingEmailActionResponse>(`/sessions/${sessionId}/email/cancel`, {
      method: 'POST',
    }),
}
