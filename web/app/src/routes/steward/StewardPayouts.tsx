import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type ApprovedRecipient = {
  id: string
  pseudonymousId: string
  weeklyCapKobo: number
  hasBank: boolean
  bankName?: string
  accountName?: string
}

type Payout = {
  id: string
  recipientId: string
  amountKobo: number
  status: 'awaiting_confirm' | 'pending' | 'succeeded' | 'failed' | 'reversed'
  reference: string
  paystackTransferCode?: string
  initiatedById: string
  confirmedById?: string
  failureReason?: string
  createdAt: string
  settledAt?: string
}

function nairaFromKobo(k: number): string {
  return '₦' + Math.round(k / 100).toLocaleString('en-NG')
}

function shortId(s: string): string {
  return s.length > 12 ? s.slice(0, 8) + '…' : s
}

export function StewardPayouts() {
  const qc = useQueryClient()
  const approved = useQuery<{ items: ApprovedRecipient[] }>({
    queryKey: ['steward', 'recipients', 'approved'],
    queryFn: () => api.get('/steward/recipients/approved'),
  })
  const payouts = useQuery<{ items: Payout[] }>({
    queryKey: ['steward', 'payouts'],
    queryFn: () => api.get('/steward/payouts'),
    refetchInterval: 8_000,
  })

  // pseudonymousId lookup so we can show codes instead of UUIDs in the list
  const pseudoLookup = useMemo(() => {
    const m: Record<string, string> = {}
    approved.data?.items.forEach((r) => {
      m[r.id] = r.pseudonymousId
    })
    return m
  }, [approved.data])

  const [recipientId, setRecipientId] = useState('')
  const [amountNaira, setAmountNaira] = useState('')
  const [error, setError] = useState<string | null>(null)

  const initiate = useMutation({
    mutationFn: (input: { recipientId: string; amountKobo: number }) =>
      api.post('/steward/payouts', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'payouts'] })
      setAmountNaira('')
      setError(null)
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not initiate.')
    },
  })

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/steward/payouts/${id}/confirm`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'payouts'] })
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not confirm.')
    },
  })

  function onInitiate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const naira = parseInt(amountNaira.replace(/[^\d]/g, ''), 10)
    if (!recipientId) {
      setError('Pick a recipient.')
      return
    }
    if (!Number.isFinite(naira) || naira < 1) {
      setError('Enter an amount.')
      return
    }
    initiate.mutate({ recipientId, amountKobo: naira * 100 })
  }

  return (
    <div>
      <StewardSubnav />

      <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Payouts</h1>
      <p className="mt-1 text-sm text-[var(--color-stone)]">
        Two distinct stewards required. Any steward initiates; a different one confirms — the confirmation fires the Paystack Transfer.
      </p>

      {/* Initiate form */}
      <section className="mt-6 card-base p-5">
        <div className="label-cap">Initiate a new payout</div>

        {(() => {
          const items = approved.data?.items ?? []
          const ready = items.filter((r) => r.hasBank)
          const waitingOnBank = items.filter((r) => !r.hasBank)

          if (approved.isLoading) {
            return <p className="mt-3 text-sm text-[var(--color-stone)]">Loading recipients…</p>
          }
          if (items.length === 0) {
            return (
              <p className="mt-3 text-sm text-[var(--color-stone)]">
                No approved recipients yet. Approvals happen on the{' '}
                <a href="/steward" className="underline underline-offset-[3px] text-[var(--color-ink)]">
                  Queue
                </a>{' '}
                — and need two distinct stewards.
              </p>
            )
          }
          if (ready.length === 0) {
            return (
              <div className="mt-3 text-sm text-[var(--color-stone)]">
                <p>
                  No recipient has added a bank account yet. Until they do, payouts can't go out.
                </p>
                <div className="mt-3 card-base p-3 bg-[var(--color-cream)]">
                  <div className="label-cap mb-1">Waiting on a bank account</div>
                  <ul className="font-mono text-[12px] text-[var(--color-indigo)] space-y-0.5">
                    {waitingOnBank.map((r) => (
                      <li key={r.id}>{r.pseudonymousId}</li>
                    ))}
                  </ul>
                </div>
                <p className="mt-3 text-[11px]">
                  Each approved recipient adds their own bank in{' '}
                  <span className="font-mono text-[var(--color-ink)]">/support/bank</span>. Nudge them — you can't add it for them.
                </p>
              </div>
            )
          }
          return (
            <>
              <form onSubmit={onInitiate} className="mt-3 grid grid-cols-12 gap-3">
                <div className="col-span-7">
                  <label className="text-[11px] text-[var(--color-stone)]">Recipient</label>
                  <select
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm"
                  >
                    <option value="">— pick a recipient —</option>
                    {ready.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.pseudonymousId}
                        {r.weeklyCapKobo ? ` · cap ${nairaFromKobo(r.weeklyCapKobo)}/wk` : ''}
                        {r.bankName ? ` · ${r.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] text-[var(--color-stone)]">Amount (₦)</label>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={amountNaira}
                    onChange={(e) => setAmountNaira(e.target.value.replace(/[^\d]/g, ''))}
                    className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm font-mono"
                  />
                </div>
                <div className="col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={initiate.isPending}
                    className="w-full h-11 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-sm font-medium"
                  >
                    {initiate.isPending ? '…' : 'Initiate'}
                  </button>
                </div>
              </form>
              {waitingOnBank.length > 0 ? (
                <p className="mt-3 text-[11px] text-[var(--color-stone)]">
                  {waitingOnBank.length} approved recipient{waitingOnBank.length === 1 ? '' : 's'} not shown — still waiting on a bank account from them.
                </p>
              ) : null}
              {error ? <p className="mt-3 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p> : null}
              <p className="mt-3 text-[11px] text-[var(--color-stone)]">
                You cannot confirm a payout you initiated yourself.
              </p>
            </>
          )
        })()}
      </section>

      {/* Payouts list */}
      <section className="mt-6 card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-cream)] text-left text-[10px] uppercase tracking-wider text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Initiated</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {payouts.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-stone)]">Loading…</td>
              </tr>
            ) : (payouts.data?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-stone)]">
                  No payouts yet.
                </td>
              </tr>
            ) : (
              payouts.data?.items.map((p) => (
                <tr key={p.id} className="border-t border-[var(--color-hairline)]">
                  <td className="px-4 py-3 font-mono text-[var(--color-indigo)]">
                    {pseudoLookup[p.recipientId] ?? shortId(p.recipientId)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{nairaFromKobo(p.amountKobo)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                    {p.failureReason ? (
                      <div className="text-[10px] text-[var(--color-coral)] mt-1">{p.failureReason}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-stone)] text-xs font-mono">
                    {new Date(p.createdAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'awaiting_confirm' ? (
                      <button
                        onClick={() => confirm.mutate(p.id)}
                        disabled={confirm.isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--color-indigo)] text-[var(--color-paper)]"
                      >
                        Confirm
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: Payout['status'] }) {
  const map: Record<Payout['status'], { label: string; bg: string; fg: string }> = {
    awaiting_confirm: { label: 'awaiting confirm', bg: 'rgba(217,119,87,0.15)', fg: 'var(--color-clay)' },
    pending: { label: 'in flight', bg: 'rgba(27,42,78,0.10)', fg: 'var(--color-indigo)' },
    succeeded: { label: 'succeeded', bg: 'rgba(94,114,89,0.15)', fg: 'var(--color-moss)' },
    failed: { label: 'failed', bg: 'rgba(200,75,58,0.15)', fg: 'var(--color-coral)' },
    reversed: { label: 'reversed', bg: 'rgba(200,75,58,0.15)', fg: 'var(--color-coral)' },
  }
  const s = map[status]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  )
}
