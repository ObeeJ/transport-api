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

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// CSRF token store.
//
// We DON'T read `document.cookie` to get the token. Firefox Total Cookie
// Protection and Chrome's third-party-cookie deprecation hide partitioned
// cross-site cookies from JS — `document.cookie` returns empty even when
// the cookie is happily sent on requests. So the token is fetched from
// the API's JSON response body and kept in module memory.
//
// The cookie still travels with every request (the browser sends it
// because of `credentials: 'include'` and SameSite=None;Partitioned).
// Server-side, CSRF middleware compares the cookie against the
// X-CSRF-Token header we set from this in-memory value.
let csrfToken: string | null = null
let csrfBootstrap: Promise<void> | null = null

async function ensureCSRF(): Promise<void> {
  if (csrfToken) return
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { token?: string }) => {
        if (data?.token) csrfToken = data.token
      })
      .catch(() => {
        // Swallow — the next state-changing request will retry the bootstrap
        // by virtue of csrfToken still being null.
        csrfBootstrap = null
      })
  }
  return csrfBootstrap
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()

  if (STATE_CHANGING.has(method)) {
    await ensureCSRF()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (STATE_CHANGING.has(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  })

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null

  // If the server tells us the CSRF token is missing/mismatched, drop our
  // cached one and let the next request re-fetch. Helps recover after
  // server-side token rotation or cookie expiry without a full reload.
  if (!res.ok) {
    const body = data as { error?: string; detail?: string } | null
    const code = body?.error ?? `http_${res.status}`
    if (res.status === 403 && (code === 'csrf_missing' || code === 'csrf_mismatch')) {
      csrfToken = null
      csrfBootstrap = null
    }
    // Translate known machine codes into human, actionable copy so any screen
    // that surfaces err.message reads well without bespoke handling.
    const friendly: Record<string, string> = {
      email_not_verified:
        'Verify your email to do this. Open the link we emailed you, or resend it from Account → Verify email.',
    }
    const message = friendly[code] ?? body?.detail ?? body?.error ?? `Request failed (${res.status})`
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
