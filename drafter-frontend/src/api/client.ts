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

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
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

  getDocument: (sessionId: string) =>
    request<DocumentState>(`/sessions/${sessionId}/document`),

  deleteSession: (sessionId: string) =>
    request<{ deleted: string }>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
}

export function triggerDownload(
  b64: string,
  format: string,
  filename: string
) {
  const mime: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
    type: mime[format] ?? 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
