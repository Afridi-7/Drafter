// src/api/client.ts

const BASE = '/api'

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
}

export interface DocumentState {
  document_content: string
  document_title: string
  undo_count: number
  redo_count: number
  last_saved_path: string
}

export interface SaveResponse {
  document_b64: string
  b64: string
  format: string
  message: string
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  console.log(`[API] Calling ${path}`, options?.method || 'GET')
  const res = await fetch(`${BASE}${path}`, {
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
      const response = await fetch(`${BASE}/sessions/${sessionId}/messages-stream`, {
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
}
