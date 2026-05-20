const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function readCSRFToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)akin_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Fetch the CSRF cookie once on boot. The API sets it on any GET response.
// Without this, the first POST from a fresh browser session has no cookie.
let csrfBootstrap: Promise<void> | null = null

function ensureCSRF(): Promise<void> {
  if (readCSRFToken()) return Promise.resolve()
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${API_BASE}/auth/csrf`, {
      credentials: 'include',
    }).then(() => {}).catch(() => {})
  }
  return csrfBootstrap
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()

  // Ensure we have the CSRF cookie before any state-changing request.
  if (STATE_CHANGING.has(method)) {
    await ensureCSRF()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (STATE_CHANGING.has(method)) {
    const csrf = readCSRFToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  })

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const body = data as { error?: string; detail?: string } | null
    const code = body?.error ?? `http_${res.status}`
    const message = body?.detail ?? body?.error ?? `Request failed (${res.status})`
    throw new ApiError(res.status, message, code)
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
