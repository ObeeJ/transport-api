import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type Recipient = {
  id: string
  pseudonymousId: string
  status: 'pending' | 'approved' | 'declined'
  disbursementMethod: 'wallet' | 'bank'
  intakeWeeklyCostKobo: number
  intakeSituation: string
  weeklyCapKobo: number
  createdAt: string
  decidedAt?: string
}

type StewardAction = {
  id: string
  stewardId: string
  decision: 'approve' | 'decline'
  weeklyCapKobo: number
  note: string
  createdAt: string
}

type DetailResponse = {
  recipient: Recipient
  actions: StewardAction[]
  yourDecision?: StewardAction
}

type DecideResponse = {
  transitioned: boolean
  signoffsSoFar: number
  recipient: Recipient
}

export function StewardApplication() {
  const { id = '' } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const q = useQuery<DetailResponse>({
    queryKey: ['steward', 'application', id],
    queryFn: () => api.get(`/steward/applications/${id}`),
    enabled: !!id,
  })

  const [weeklyCap, setWeeklyCap] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'decline') => {
      const capKobo = parseInt(weeklyCap.replace(/[^\d]/g, ''), 10) * 100
      return api.post<DecideResponse>(`/steward/applications/${id}/decisions`, {
        decision,
        weeklyCapKobo: decision === 'approve' ? capKobo : 0,
        note,
      })
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['steward', 'application', id] })
      void queryClient.invalidateQueries({ queryKey: ['steward', 'queue'] })
      if (res.transitioned) {
        // Linger briefly so the user sees the transition, then bounce back.
        setTimeout(() => navigate('/steward'), 1200)
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(humanize(err.code ?? err.message))
      else setError('Could not record decision.')
    },
  })

  if (q.isLoading) return <p className="text-sm text-[var(--color-stone)]">Loading…</p>
  if (!q.data) return <p className="text-sm text-[var(--color-stone)]">Not found.</p>

  const { recipient, actions, yourDecision } = q.data
  const approvalsByDistinctStewards = uniqueStewards(actions, 'approve')
  const declinesByDistinctStewards = uniqueStewards(actions, 'decline')

  function onSubmit(e: React.FormEvent, decision: 'approve' | 'decline') {
    e.preventDefault()
    setError(null)
    if (decision === 'approve') {
      const cap = parseInt(weeklyCap.replace(/[^\d]/g, ''), 10)
      if (!Number.isFinite(cap) || cap < 1) {
        setError('Set a weekly cap (₦) before approving.')
        return
      }
    }
    decide.mutate(decision)
  }

  return (
    <div>
      <Link to="/steward" className="text-xs text-[var(--color-stone)] underline underline-offset-[3px]">
        ← Back to queue
      </Link>

      <div className="mt-3 flex items-baseline justify-between">
        <div>
          <div className="font-mono text-4xl font-medium tracking-tight text-[var(--color-indigo)]">
            {recipient.pseudonymousId}
          </div>
          <p className="mt-1 text-sm text-[var(--color-stone)]">
            Applied {new Date(recipient.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })} · {recipient.disbursementMethod}
          </p>
        </div>
        <StatusBadge status={recipient.status} />
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="md:col-span-2 card-base p-6">
          <div className="label-cap">Their note</div>
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--color-ink)]">
            {recipient.intakeSituation || <span className="text-[var(--color-stone)] italic">— no note provided —</span>}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 pt-6 border-t border-[var(--color-hairline)]">
            <div>
              <div className="label-cap">Typical weekly cost</div>
              <div className="mt-1 font-mono text-2xl text-[var(--color-ink)]">
                ₦{(recipient.intakeWeeklyCostKobo / 100).toLocaleString('en-NG')}
              </div>
            </div>
            <div>
              <div className="label-cap">Disbursement method</div>
              <div className="mt-1 uppercase tracking-wider text-sm">{recipient.disbursementMethod}</div>
            </div>
          </div>
        </section>

        <aside className="card-base p-6 bg-[var(--color-cream)]">
          <div className="label-cap">Two-person sign-off</div>
          <div className="mt-3 space-y-2 text-sm">
            <SignoffLine label="Approvals" count={approvalsByDistinctStewards} target={2} tone="moss" />
            <SignoffLine label="Declines" count={declinesByDistinctStewards} target={2} tone="coral" />
          </div>

          {actions.length > 0 ? (
            <ul className="mt-5 space-y-2 text-xs text-[var(--color-stone)] border-t border-[var(--color-hairline)] pt-4">
              {actions.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>
                    <span className={a.decision === 'approve' ? 'text-[var(--color-moss)]' : 'text-[var(--color-coral)]'}>
                      {a.decision}
                    </span>
                    {' · '}
                    <span className="font-mono">{a.stewardId.slice(0, 8)}…</span>
                  </span>
                  <span className="font-mono">{new Date(a.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {recipient.status === 'pending' && !yourDecision ? (
            <form className="mt-6 space-y-3 border-t border-[var(--color-hairline)] pt-4">
              <label className="block">
                <div className="label-cap mb-1">Weekly cap (₦, if approving)</div>
                <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2">
                  <input
                    inputMode="numeric"
                    value={weeklyCap}
                    onChange={(e) => setWeeklyCap(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="e.g. 8000"
                    className="w-full bg-transparent text-base outline-none placeholder:text-[var(--color-stone-soft)]"
                  />
                </div>
              </label>
              <label className="block">
                <div className="label-cap mb-1">Note (optional, internal)</div>
                <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2">
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Visible to other stewards only."
                    className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-[var(--color-stone-soft)]"
                  />
                </div>
              </label>

              {error ? <p className="text-xs text-[var(--color-coral)]">{error}</p> : null}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  onClick={(e) => onSubmit(e, 'decline')}
                  disabled={decide.isPending}
                  className="flex-1 h-10 rounded-[12px] text-xs font-medium border border-[var(--color-hairline)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]"
                >
                  Decline
                </button>
                <button
                  type="submit"
                  onClick={(e) => onSubmit(e, 'approve')}
                  disabled={decide.isPending}
                  className="flex-1 h-10 rounded-[12px] text-xs font-medium bg-[var(--color-indigo)] text-[var(--color-paper)]"
                >
                  {decide.isPending ? 'Recording…' : 'Approve'}
                </button>
              </div>
            </form>
          ) : yourDecision ? (
            <p className="mt-6 text-xs text-[var(--color-stone)] border-t border-[var(--color-hairline)] pt-4">
              You already <strong className="text-[var(--color-ink)]">{yourDecision.decision}d</strong> this application. Another steward must add the second sign-off.
            </p>
          ) : (
            <p className="mt-6 text-xs text-[var(--color-stone)] border-t border-[var(--color-hairline)] pt-4">
              Decision is final. Status: <strong className="text-[var(--color-ink)]">{recipient.status}</strong>.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function uniqueStewards(actions: StewardAction[], decision: 'approve' | 'decline') {
  const seen = new Set<string>()
  for (const a of actions) if (a.decision === decision) seen.add(a.stewardId)
  return seen.size
}

function StatusBadge({ status }: { status: Recipient['status'] }) {
  const cfg = {
    pending: { bg: 'var(--color-clay)', label: 'Pending' },
    approved: { bg: 'var(--color-moss)', label: 'Approved' },
    declined: { bg: 'var(--color-coral)', label: 'Declined' },
  }[status]
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium tracking-wider uppercase text-[var(--color-paper)]" style={{ background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function SignoffLine({ label, count, target, tone }: { label: string; count: number; target: number; tone: 'moss' | 'coral' }) {
  const c = tone === 'moss' ? 'var(--color-moss)' : 'var(--color-coral)'
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-stone)]">{label}</span>
      <span className="flex items-center gap-1.5">
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className="size-2.5 rounded-full"
            style={{ background: i < count ? c : 'var(--color-stone-soft)' }}
          />
        ))}
        <span className="ml-1 font-mono text-xs">{count}/{target}</span>
      </span>
    </div>
  )
}

function humanize(code: string): string {
  switch (code) {
    case 'already_recorded':
      return "You've already recorded a decision on this. Another steward must add the second sign-off."
    case 'already_decided':
      return 'This application is already decided.'
    case 'self_review_forbidden':
      return "You can't act on your own application."
    case 'weekly_cap_too_small':
      return 'Set a weekly cap of at least ₦1 before approving.'
    default:
      return code
  }
}
