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

// ── Phase 0 types ──────────────────────────────────────────────────────────
export type EscrowState = 'held' | 'released' | 'refunded' | 'frozen' | 'expired'
export interface EscrowHold {
  id: string; txnId: string; fromAccountId: string; toAccountId: string
  amountKobo: number; currency: string; purpose: string
  referenceId?: string; state: EscrowState; expiresAt?: string; createdAt: string
}
export class InsufficientFundsError extends ApiError {
  constructor() { super(422, "You don't have enough balance for this. Top up your wallet and try again.", 'insufficient_balance') }
}
export class IdempotentReplay extends ApiError {
  constructor() { super(200, 'This request was already processed.', 'idempotency_replay') }
}

// ── Phase 1 types ──────────────────────────────────────────────────────────
export interface WingsBalance { available: number; locked: number; expiring_soon: number }
export interface WingsGrant {
  id: string; userId: string; amount: number; purpose: string
  issuedAt: string; expiresAt: string; status: string
}
export type KYCStatus = 'pending' | 'verified' | 'failed'

// ── Phase 2 types ──────────────────────────────────────────────────────────
export interface PricingQuote {
  vehicleCode: string; vehicleName: string; distanceKm: number
  fareKobo: number; platformFeeKobo: number; driverEarnsKobo: number; surgeMultiplier: number
}

// ── Phase 3 types ──────────────────────────────────────────────────────────
export interface TrustScore { userId: string; score: number; tier: string; components: Record<string, unknown> }
export interface LadderStatus { rideId: string; tier: number; tierLabel: string; status: string }

// ── Phase 4 types ──────────────────────────────────────────────────────────
export interface Post {
  id: string; authorId: string; kind: string; body: string
  visibility: string; createdAt: string; score: number
}
export interface Streak { userId: string; kind: string; count: number; lastHitAt?: string; freezesLeft: number }
export interface TransparencyHold { userId: string; wingsLocked: number; reason: string; releaseBy: string }

// ── Phase 5 types ──────────────────────────────────────────────────────────
export interface Ambassador {
  userId: string; tier: string; referralCode: string
  earnedWings: number; earnedNaira: number; vanityUrl?: string
}
export interface RecurringSponsor {
  id: string; amountKobo: number; cadence: string; status: string; nextChargeAt: string
}

// ── Phase 6 types ──────────────────────────────────────────────────────────
export interface CircleMembership { id: string; userId: string; status: string; foundingMember: boolean }
export type BadgeLevel = '' | 'grey' | 'blue' | 'gold' | 'diamond'

// ── CSRF + request core ────────────────────────────────────────────────────
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let csrfToken: string | null = null
let csrfBootstrap: Promise<void> | null = null

async function ensureCSRF(): Promise<void> {
  if (csrfToken) return
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: { token?: string }) => {
        if (data?.token) csrfToken = data.token
        else csrfBootstrap = null
      })
      .catch(() => { csrfBootstrap = null })
  }
  return csrfBootstrap
}

async function request<T>(path: string, init: RequestInit = {}, idempotent = false): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  if (STATE_CHANGING.has(method)) await ensureCSRF()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  if (STATE_CHANGING.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken
  if (idempotent && STATE_CHANGING.has(method)) headers['Idempotency-Key'] = crypto.randomUUID()

  const res = await fetch(`${API_BASE}${path}`, { ...init, method, credentials: 'include', headers })

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
      csrfToken = null; csrfBootstrap = null
    }
    if (code === 'insufficient_balance') throw new InsufficientFundsError()
    const friendly: Record<string, string> = {
      email_not_verified: 'Verify your email to do this. Open the link we emailed you, or resend it from Account → Verify email.',
    }
    throw new ApiError(res.status, friendly[code] ?? body?.detail ?? body?.error ?? `Request failed (${res.status})`, code)
  }
  return data as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown, idempotent = false) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, idempotent)
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

export const api = {
  get, post, patch, delete: del,

  // Phase 0 — Financial Spine
  wallet: {
    balance: () => get<{ balanceKobo: number; userId: string }>('/wallet'),
    transactions: () => get<{ items: unknown[] }>('/wallet/transactions'),
    escrow: () => get<{ items: EscrowHold[] }>('/wallet/escrow'),
    debit: (amountKobo: number, description: string) =>
      post<{ ok: boolean }>('/wallet/debit', { amountKobo, description }, true),
    withdraw: (amountKobo: number) => post<unknown>('/wallet/withdraw', { amountKobo }, true),
  },

  trips: {
    bookSeat: (tripId: string) => post<unknown>(`/trips/${tripId}/bookings`, undefined, true),
  },

  // Phase 1 — Wings + KYC
  wings: {
    balance: () => get<WingsBalance>('/wings/balance'),
    history: () => get<{ items: WingsGrant[] }>('/wings/history'),
  },
  kyc: {
    submitNIN: (nin: string) => post<{ jobId: string }>('/kyc/nin', { nin }),
    status: (jobId: string) => get<{ status: KYCStatus; jobId: string }>(`/kyc/status/${jobId}`),
  },

  // Phase 2 — Pricing + Evidence + Admin
  pricing: {
    quote: (vehicleCode: string, distanceKm: number) =>
      post<PricingQuote>('/pricing/quote', { vehicleCode, distanceKm }),
  },
  evidence: {
    uploadUrl: (kind: string, contentType: string) =>
      post<{ uploadUrl: string; key: string; evidenceId: string }>('/evidence/upload-url', { kind, contentType }),
    list: () => get<{ items: unknown[] }>('/evidence'),
  },
  admin: {
    metrics: () => get<unknown>('/admin/metrics'),
    updatePricing: (patch: Record<string, unknown>) => api.patch('/admin/pricing', patch),
    reviewDriver: (userId: string, decision: string, notes?: string) =>
      post<{ ok: boolean }>(`/admin/drivers/${userId}/review`, { decision, notes }),
    reviewEvidence: (id: string, decision: string, notes?: string) =>
      post<{ ok: boolean }>(`/admin/evidence/${id}/review`, { decision, notes }),
  },

  // Phase 3 — Trust + Matcher
  trust: {
    me: () => get<TrustScore>('/trust/me'),
  },
  rides: {
    status: (id: string) => get<LadderStatus>(`/rides/${id}/status`),
  },

  // Phase 4 — Social + Transparency
  posts: {
    create: (input: { kind: string; body: string; visibility?: string; refs?: Record<string, unknown> }) =>
      post<Post>('/posts', input),
    list: (tab: 'foryou' | 'following' | 'circle' | 'nearby' | 'live' = 'foryou', limit = 20) =>
      get<{ items: Post[] }>(`/feed?tab=${tab}&limit=${limit}`),
    clap: (id: string, count: number) => post<{ ok: boolean }>(`/posts/${id}/clap`, { count }),
  },
  follows: {
    toggle: (userId: string) => post<{ following: boolean }>(`/follows/${userId}`),
  },
  streaks: {
    me: () => get<{ items: Streak[] }>('/streaks/me'),
  },
  transparency: {
    myHolds: () => get<{ items: TransparencyHold[] }>('/transparency/holds'),
  },

  // Phase 5 — Ambassador + Sponsor
  ambassador: {
    activate: () => post<Ambassador>('/ambassador/activate'),
    me: () => get<Ambassador>('/ambassador/me'),
  },
  sponsor: {
    setupRecurring: (input: { amountKobo: number; cadence: string; authCode: string }) =>
      post<RecurringSponsor>('/sponsor/recurring', input),
    cancel: (id: string) => del<{ ok: boolean }>(`/sponsor/recurring/${id}`),
  },

  // Phase 6 — Circle
  circle: {
    status: () => get<{ membership: CircleMembership | null; badge: BadgeLevel }>('/circle/status'),
    purchase: () => post<CircleMembership>('/circle/purchase'),
  },

  // Phase 7 — Multi-tenant Circles
  circles: {
    mine: () => get<unknown>('/circles/mine'),
    join: (token: string) => post<{ ok: boolean }>(`/circles/join/${token}`),
    generateInvite: () => post<{ token: string }>('/circles/invite'),
  },
}
