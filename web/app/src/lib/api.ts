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

// Phase 0 — Financial Spine types
export type EscrowState = 'held' | 'released' | 'refunded' | 'frozen' | 'expired'

export interface EscrowHold {
  id: string
  txnId: string
  fromAccountId: string
  toAccountId: string
  amountKobo: number
  currency: string
  purpose: string
  referenceId?: string
  state: EscrowState
  expiresAt?: string
  createdAt: string
}

export class InsufficientFundsError extends ApiError {
  constructor() {
    super(422, "You don't have enough balance for this. Top up your wallet and try again.", 'insufficient_balance')
  }
}

export class IdempotentReplay extends ApiError {
  constructor() {
    super(200, 'This request was already processed.', 'idempotency_replay')
  }
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfToken: string | null = null
let csrfBootstrap: Promise<void> | null = null

async function ensureCSRF(): Promise<void> {
  if (csrfToken) return
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { token?: string }) => {
        if (data?.token) {
          csrfToken = data.token
        } else {
          csrfBootstrap = null
        }
      })
      .catch(() => {
        csrfBootstrap = null
      })
  }
  return csrfBootstrap
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  idempotent = false,
): Promise<T> {
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
  // Attach idempotency key for all money-mutating POSTs.
  if (idempotent && STATE_CHANGING.has(method)) {
    headers['Idempotency-Key'] = crypto.randomUUID()
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  })

  // Idempotent replay — return cached body transparently.
  if (res.headers.get('Idempotency-Replay') === 'true') {
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const body = data as { error?: string; detail?: string } | null
    const code = body?.error ?? `http_${res.status}`
    if (res.status === 403 && (code === 'csrf_missing' || code === 'csrf_mismatch')) {
      csrfToken = null
      csrfBootstrap = null
    }
    if (code === 'insufficient_balance') throw new InsufficientFundsError()
    const friendly: Record<string, string> = {
      email_not_verified:
        'Verify your email to do this. Open the link we emailed you, or resend it from Account → Verify email.',
    }
    const message = friendly[code] ?? body?.detail ?? body?.error ?? `Request failed (${res.status})`
    throw new ApiError(res.status, message, code)
  }

  return data as T
}

// Convenience wrappers — idempotent=true attaches Idempotency-Key header.
const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown, idempotent = false) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, idempotent)
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

export const api = {
  // Low-level
  get,
  post,
  put,
  delete: del,

  // Phase 0 — Financial Spine
  wallet: {
    balance: () => get<{ balanceKobo: number; userId: string }>('/wallet'),
    transactions: () => get<{ items: unknown[] }>('/wallet/transactions'),
    escrow: () => get<{ items: EscrowHold[] }>('/wallet/escrow'),
    debit: (amountKobo: number, description: string) =>
      post<{ ok: boolean }>('/wallet/debit', { amountKobo, description }, true),
    withdraw: (amountKobo: number) =>
      post<unknown>('/wallet/withdraw', { amountKobo }, true),
  },

  trips: {
    bookSeat: (tripId: string) =>
      post<unknown>(`/trips/${tripId}/bookings`, undefined, true),
  },
}
