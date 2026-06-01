import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, api } from '@/lib/api'

type Recipient = {
  id: string
  pseudonymousId: string
  status: 'pending' | 'approved' | 'declined'
  disbursementMethod: 'wallet' | 'bank'
  weeklyCapKobo: number
  decidedAt?: string
}

type BankAccount = {
  bankName: string
  accountName: string
  accountNumber: string
}

function maskAccount(n: string): string {
  if (n.length < 4) return n
  return '••• ' + n.slice(-4)
}

export function RecipientStatus() {
  const q = useQuery<Recipient>({
    queryKey: ['recipient', 'me'],
    queryFn: () => api.get<Recipient>('/recipients/me'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })

  if (q.isLoading) {
    return <div className="pt-12 text-sm text-[var(--color-stone)]">Loading…</div>
  }

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <div className="pt-4">
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          You haven't applied yet.
        </h2>
        <p className="mt-3 text-[13px] text-[var(--color-stone)]">
          If transport is keeping you from class, two stewards will read what you write — and decide together. Anonymously.
        </p>
        <Link to="/support/apply" className="btn-primary w-full mt-8 h-[52px]">
          Apply for support
        </Link>
      </div>
    )
  }

  const r = q.data
  if (!r) return null

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--color-stone)]">Your code in the queue</p>
        <span className="font-mono text-[12px] text-[var(--color-stone)]">{r.disbursementMethod.toUpperCase()}</span>
      </div>
      <div className="mt-1 font-mono text-[44px] font-medium tracking-tight text-[var(--color-indigo)]">
        {r.pseudonymousId}
      </div>

      <div className="mt-6 card-base p-5">
        <div className="label-cap">Status</div>
        <div className="mt-2 flex items-center gap-3">
          <Dot status={r.status} />
          <div className="text-2xl font-medium tracking-tight text-[var(--color-indigo)]">
            {statusLabel(r.status)}
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-stone)] leading-relaxed">
          {statusBody(r.status)}
        </p>
        {r.status === 'approved' && r.weeklyCapKobo > 0 ? (
          <p className="mt-3 text-[12px] text-[var(--color-ink)]">
            Weekly cap: <span className="font-mono">₦{(r.weeklyCapKobo / 100).toLocaleString('en-NG')}</span>
          </p>
        ) : null}
      </div>

      {r.status === 'approved' ? <BankTile /> : null}
      {r.status === 'approved' ? <AttendanceTile /> : null}
      {r.status === 'declined' ? <AppealTile recipientId={r.id} /> : null}

      <p className="mt-6 text-[11px] text-[var(--color-stone)] leading-relaxed">
        Decisions are made by two stewards — never one. Your name and email are not in their view. If anything in your situation changes, you can always reach out.
      </p>
    </div>
  )
}

type AttendanceCell = {
  weekStart: string
  attended: boolean
  recorded: boolean
}

function AttendanceTile() {
  const q = useQuery<{ items: AttendanceCell[] }>({
    queryKey: ['attendance', 'me'],
    queryFn: () => api.get('/attendance/me?weeks=8'),
  })

  if (q.isLoading || !q.data) return null
  const items = q.data.items
  // Last cell is the current (still-in-progress) week. The "previous full
  // week" — the one the payout gate checks — is the second-from-last cell.
  const previousFull = items[items.length - 2]
  const gatePassed = previousFull?.recorded && previousFull?.attended

  return (
    <div className="mt-4 card-base p-5">
      <div className="flex items-center justify-between">
        <div className="label-cap">Attendance</div>
        <span
          className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            background: gatePassed ? 'rgba(94,114,89,0.15)' : 'rgba(217,119,87,0.15)',
            color: gatePassed ? 'var(--color-moss)' : 'var(--color-clay)',
          }}
        >
          {gatePassed ? 'eligible' : 'on hold'}
        </span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {items.map((c, i) => {
          const isCurrentWeek = i === items.length - 1
          let bg = 'var(--color-cream-2)'
          let fg = 'var(--color-stone)'
          if (c.recorded) {
            if (c.attended) {
              bg = 'var(--color-moss)'
              fg = 'var(--color-paper)'
            } else {
              bg = 'rgba(200,75,58,0.55)'
              fg = 'var(--color-paper)'
            }
          }
          const date = new Date(c.weekStart)
          return (
            <div
              key={c.weekStart}
              className="flex-1 rounded-md text-center py-2 text-[10px]"
              style={{
                background: bg,
                color: fg,
                opacity: isCurrentWeek && !c.recorded ? 0.6 : 1,
              }}
              title={`${date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })} · ${
                c.recorded ? (c.attended ? 'attended' : 'absent') : 'no record'
              }`}
            >
              {date.toLocaleDateString('en-NG', { day: '2-digit' })}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-[var(--color-stone)] leading-relaxed">
        {gatePassed
          ? 'Last week\'s attendance is on file. You\'re eligible for this week\'s disbursement.'
          : previousFull?.recorded
            ? 'Last week\'s attendance was missed — payouts are paused this week. Reach out if circumstances were unusual.'
            : 'Stewards haven\'t uploaded last week\'s attendance yet. Once they do, payouts resume.'}
      </p>
    </div>
  )
}

function BankTile() {
  const q = useQuery<BankAccount>({
    queryKey: ['recipient', 'bank'],
    queryFn: () => api.get<BankAccount>('/recipients/me/bank'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  })

  if (q.isLoading) return null

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <div className="mt-4 card-base p-5">
        <div className="label-cap">Bank account</div>
        <p className="mt-2 text-[13px] text-[var(--color-ink)]">
          Add the account that should receive disbursements.
        </p>
        <Link
          to="/support/bank"
          className="btn-primary mt-4 inline-flex h-11 px-4 text-sm"
        >
          Add bank account
        </Link>
      </div>
    )
  }

  const b = q.data
  if (!b) return null
  return (
    <div className="mt-4 card-base p-5">
      <div className="flex items-center justify-between">
        <div className="label-cap">Bank account</div>
        <Link
          to="/support/bank"
          className="font-mono text-[10px] text-[var(--color-stone)] hover:text-[var(--color-ink)] uppercase tracking-wide"
        >
          Change
        </Link>
      </div>
      <div className="mt-2 text-base font-medium text-[var(--color-indigo)]">{b.accountName}</div>
      <div className="mt-1 text-[12px] text-[var(--color-stone)] font-mono">
        {b.bankName} · {maskAccount(b.accountNumber)}
      </div>
    </div>
  )
}

function Dot({ status }: { status: Recipient['status'] }) {
  const color =
    status === 'approved'
      ? 'var(--color-moss)'
      : status === 'declined'
        ? 'var(--color-coral)'
        : 'var(--color-clay)'
  return <span style={{ background: color }} className="size-2.5 rounded-full" />
}

function statusLabel(status: Recipient['status']): string {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'declined':
      return 'Decision made'
    case 'pending':
    default:
      return 'With the stewards'
  }
}

function statusBody(status: Recipient['status']): string {
  switch (status) {
    case 'approved':
      return "You're set. Funds will reach you on the next weekly cycle, tied to your attendance."
    case 'declined':
      return "Stewards weren't able to approve this round. You can submit an appeal below — a different steward pair will take a fresh look."
    case 'pending':
    default:
      return "Two stewards will read your note and decide together. We aim to respond within 48 hours."
  }
}

function AppealTile({ recipientId: _recipientId }: { recipientId: string }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => api.post('/recipients/me/appeal', { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipient', 'me'] })
      setOpen(false)
      setReason('')
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit.'),
  })

  if (!open) {
    return (
      <div className="mt-4 card-base p-5">
        <div className="label-cap">Appeal this decision</div>
        <p className="mt-2 text-[12px] text-[var(--color-stone)] leading-relaxed">
          If your circumstances have changed or you believe the decision was made in error, you can request a review by a different steward pair.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 h-10 px-4 rounded-[12px] border border-[var(--color-hairline)] text-xs font-medium text-[var(--color-ink)]"
        >
          Request a review
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 card-base p-5">
      <div className="label-cap">Your appeal</div>
      <p className="mt-2 text-[12px] text-[var(--color-stone)]">
        A different steward pair will review this. Be specific about what has changed.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder="What's changed, or what you'd like reconsidered…"
        className="mt-3 w-full card-base px-4 py-3 bg-[var(--color-cream)] text-sm outline-none resize-none placeholder:text-[var(--color-stone-soft)]"
      />
      {error && <p className="mt-2 text-[11px] text-[var(--color-coral)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 h-10 rounded-[12px] border border-[var(--color-hairline)] text-xs"
        >
          Cancel
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || reason.trim().length < 10}
          className="flex-1 h-10 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
        >
          {submit.isPending ? 'Sending…' : 'Submit appeal'}
        </button>
      </div>
    </div>
  )
}
