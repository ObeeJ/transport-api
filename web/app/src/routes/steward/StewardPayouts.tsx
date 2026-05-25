import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { Link } from 'react-router'

type BatchPreviewLine = {
  recipientId: string
  pseudonymousId: string
  amountKobo: number
  disbursementMethod: string
  bankName?: string
  eligible: boolean
  skipReason?: 'absent_last_week' | 'no_attendance_record' | 'no_bank_on_file' | 'no_weekly_cap_set'
}

type BatchPreview = {
  weekStart: string
  lines: BatchPreviewLine[] | null
  totalKobo: number
  eligible: number
  skipped: number
}

type Payout = {
  id: string
  batchId?: string
  recipientId: string
  amountKobo: number
  status: 'awaiting_confirm' | 'pending' | 'succeeded' | 'failed' | 'reversed'
  initiatedById: string
  confirmedById?: string
  failureReason?: string
  createdAt: string
  settledAt?: string
}

const SKIP_LABELS: Record<NonNullable<BatchPreviewLine['skipReason']>, { label: string; hint: string; color: string }> = {
  absent_last_week:      { label: 'Absent',        hint: 'Marked absent in last week\'s attendance upload.',          color: 'var(--color-coral)' },
  no_attendance_record:  { label: 'No record',     hint: 'No attendance data found for last week. Upload CSV first.', color: 'var(--color-clay)'  },
  // Kept for backwards compatibility with older preview rows; new previews
  // won't produce this skip reason since steward payouts go to wallet only.
  no_bank_on_file:       { label: 'No bank (legacy)', hint: 'Bank-rail disbursement is retired. Recipient adds their own bank for withdrawals.', color: 'var(--color-stone)' },
  no_weekly_cap_set:     { label: 'No cap set',    hint: 'Weekly cap is ₦0 — set it when approving.',                color: 'var(--color-stone)' },
}

const STATUS_MAP: Record<Payout['status'], { label: string; bg: string; fg: string; dot: string }> = {
  awaiting_confirm: { label: 'Awaiting confirm', bg: 'rgba(217,119,87,0.12)', fg: 'var(--color-clay)',   dot: 'bg-[var(--color-clay)] animate-pulse'   },
  pending:          { label: 'In flight',        bg: 'rgba(27,42,78,0.08)',   fg: 'var(--color-indigo)', dot: 'bg-[var(--color-indigo)] animate-pulse' },
  succeeded:        { label: 'Succeeded',        bg: 'rgba(94,114,89,0.12)',  fg: 'var(--color-moss)',   dot: 'bg-[var(--color-moss)]'                 },
  failed:           { label: 'Failed',           bg: 'rgba(200,75,58,0.10)',  fg: 'var(--color-coral)',  dot: 'bg-[var(--color-coral)]'                },
  reversed:         { label: 'Reversed',         bg: 'rgba(200,75,58,0.10)',  fg: 'var(--color-coral)',  dot: 'bg-[var(--color-coral)]'                },
}

function naira(k: number) {
  return '₦' + Math.round(k / 100).toLocaleString('en-NG')
}

export function StewardPayouts() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const preview = useQuery<BatchPreview>({
    queryKey: ['steward', 'payouts', 'preview'],
    queryFn: () => api.get('/steward/payouts/preview'),
    staleTime: 60_000,
  })

  const payouts = useQuery<{ items: Payout[] }>({
    queryKey: ['steward', 'payouts'],
    queryFn: () => api.get('/steward/payouts'),
    refetchInterval: 8_000,
  })

  const initiateBatch = useMutation({
    mutationFn: () => api.post<{ batchId: string; count: number }>('/steward/payouts/batch'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'payouts'] })
      qc.invalidateQueries({ queryKey: ['steward', 'payouts', 'preview'] })
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not initiate batch.'),
  })

  const confirmBatch = useMutation({
    mutationFn: (id: string) => api.post<{ succeeded: number }>(`/steward/payouts/batch/${id}/confirm`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'payouts'] })
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not confirm batch.'),
  })

  // Find the pending batch in the payout list
  const pendingBatch = useMemo(() => {
    const list = payouts.data?.items ?? []
    const awaiting = list.filter(p => p.status === 'awaiting_confirm' && p.batchId)
    if (awaiting.length === 0) return null
    return awaiting[0].batchId!
  }, [payouts.data])

  const metrics = useMemo(() => {
    const list = payouts.data?.items ?? []
    const total = list.reduce((s, p) => s + (p.status === 'succeeded' ? p.amountKobo : 0), 0)
    const pending = list.filter(p => p.status === 'awaiting_confirm' || p.status === 'pending').length
    const failed = list.filter(p => p.status === 'failed').length
    return { total, pending, failed }
  }, [payouts.data])

  const p = preview.data

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-5">
      <StewardSubnav />

      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">Disburse to wallets</h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">
          Stewards credit approved recipients' wallets — never bank accounts directly. Recipients withdraw to their own bank from <span className="font-mono">Wallet → Withdraw</span>. Two stewards still required: one initiates, a different one confirms.
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-stone)]">
          The weekly auto-credit job covers the routine case. Use this page for one-off manual disbursements: corrections, advances, exceptions.
        </p>
      </motion.div>

      {/* Metrics */}
      <motion.div variants={fadeUp} transition={transition.default} className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total disbursed', value: naira(metrics.total), color: 'var(--color-moss)', bg: 'rgba(94,114,89,0.06)' },
          { label: 'Pending action',  value: metrics.pending, color: metrics.pending > 0 ? 'var(--color-clay)' : 'var(--color-stone)', bg: metrics.pending > 0 ? 'rgba(217,119,87,0.06)' : 'transparent' },
          { label: 'Failed',          value: metrics.failed,  color: metrics.failed > 0  ? 'var(--color-coral)' : 'var(--color-stone)', bg: metrics.failed > 0  ? 'rgba(200,75,58,0.06)'  : 'transparent' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="card-base p-4" style={{ background: bg }}>
            <div className="label-cap mb-1">{label}</div>
            <div className="text-[26px] font-semibold tracking-tight leading-none" style={{ color }}>
              {payouts.isLoading ? <span className="inline-block w-16 h-6 rounded bg-[var(--color-cream-2)] animate-pulse" /> : value}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Batch preview */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-hairline)] flex items-center justify-between">
          <div>
            <div className="label-cap">This week's payout run</div>
            <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">
              {preview.isLoading
                ? 'Calculating…'
                : p
                  ? `Week of ${p.weekStart} · ${p.eligible} eligible · ${p.skipped} skipped`
                  : 'No approved recipients yet'}
            </p>
          </div>
          {p && (
            <div className="text-right shrink-0">
              <div className="text-[22px] font-semibold tracking-tight text-[var(--color-moss)]">{naira(p.totalKobo)}</div>
              <div className="text-[10px] text-[var(--color-stone)]">total to disburse</div>
            </div>
          )}
        </div>

        {/* Preview lines */}
        <div className="divide-y divide-[var(--color-hairline)]">
          {preview.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3 animate-pulse">
                  <div className="size-2 rounded-full bg-[var(--color-cream-2)] shrink-0" />
                  <div className="flex-1 h-3 rounded bg-[var(--color-cream-2)]" />
                  <div className="w-16 h-3 rounded bg-[var(--color-cream-2)]" />
                </div>
              ))
            : (p?.lines ?? []).length === 0
              ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] font-medium text-[var(--color-indigo)]">No approved recipients yet</p>
                  <p className="mt-1 text-[11px] text-[var(--color-stone)]">
                    Recipients need two steward sign-offs on the <a href="/steward" className="underline underline-offset-2">Queue</a> before they appear here.
                  </p>
                </div>
              )
              : (p?.lines ?? []).map((line, i) => {
                const skip = line.skipReason ? SKIP_LABELS[line.skipReason] : null
                return (
                  <motion.div
                    key={line.recipientId}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...transition.fast, delay: i * 0.02 }}
                    className="px-5 py-3.5 flex items-center gap-3"
                  >
                    {/* Eligible dot */}
                    <span className={`size-2 rounded-full shrink-0 ${line.eligible ? 'bg-[var(--color-moss)]' : 'bg-[var(--color-hairline)]'}`} />

                    {/* Pseudonymous ID */}
                    <span className="font-mono text-[13px] font-semibold text-[var(--color-indigo)] w-16 shrink-0">
                      {line.pseudonymousId}
                    </span>

                    {/* Disbursement destination — always wallet now */}
                    <span className="text-[10px] font-mono text-[var(--color-stone)] bg-[var(--color-cream-2)] px-2 py-0.5 rounded-full shrink-0">
                      wallet
                    </span>

                    {/* Skip reason */}
                    {skip && (
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `color-mix(in srgb, ${skip.color} 10%, transparent)`, color: skip.color }}
                        title={skip.hint}
                      >
                        {skip.label}
                      </span>
                    )}
                    {skip && (
                      <span className="text-[10px] text-[var(--color-stone)] truncate hidden sm:block">{skip.hint}</span>
                    )}

                    {/* Amount */}
                    <span className={`ml-auto font-mono text-[13px] font-semibold shrink-0 ${line.eligible ? 'text-[var(--color-indigo)]' : 'text-[var(--color-stone-soft)] line-through'}`}>
                      {naira(line.amountKobo)}
                    </span>
                  </motion.div>
                )
              })}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-[var(--color-hairline)] bg-[var(--color-cream)]/60 flex items-center gap-3 flex-wrap">
          {pendingBatch ? (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="size-2 rounded-full bg-[var(--color-clay)] animate-pulse shrink-0" />
                <p className="text-[12px] text-[var(--color-clay)] font-medium">
                  A batch is awaiting your confirmation — you must be a different steward from the one who initiated it.
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => confirmBatch.mutate(pendingBatch)}
                disabled={confirmBatch.isPending}
                className="btn-primary h-10 px-5 text-sm shrink-0 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, var(--color-moss) 0%, #465543 100%)' }}
              >
                {confirmBatch.isPending ? 'Confirming…' : `Confirm batch`}
              </motion.button>
            </>
          ) : (
            <>
              {p && p.eligible === 0 ? (
                <div className="flex items-start gap-2.5 flex-1">
                  <span className="text-[var(--color-stone)] text-[13px] shrink-0">ℹ</span>
                  <div>
                    <p className="text-[12px] text-[var(--color-stone)]">No eligible recipients this week.</p>
                    <p className="text-[11px] text-[var(--color-stone)] mt-0.5">
                      Check attendance records or{' '}
                      <Link to="/steward/attendance" className="underline underline-offset-2 text-[var(--color-indigo)]">
                        upload this week's CSV
                      </Link>.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {!p || preview.isLoading ? (
                    <p className="text-[11px] text-[var(--color-stone)] flex-1">Calculating eligible recipients…</p>
                  ) : (p.lines ?? []).length === 0 ? (
                    <p className="text-[11px] text-[var(--color-stone)] flex-1">
                      No recipients to pay out yet. Approve applications on the{' '}
                      <Link to="/steward" className="underline underline-offset-2 text-[var(--color-indigo)]">Queue</Link>{' '}
                      first.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--color-stone)] flex-1">
                      This will create {p.eligible} payout record{p.eligible !== 1 ? 's' : ''} totalling {naira(p.totalKobo)}. A second steward must confirm before any money moves.
                    </p>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => initiateBatch.mutate()}
                    disabled={initiateBatch.isPending || !p || p.eligible === 0}
                    className="btn-primary h-10 px-5 text-sm shrink-0 disabled:opacity-40"
                  >
                    {initiateBatch.isPending ? 'Initiating…' : 'Initiate batch'}
                  </motion.button>
                </>
              )}
            </>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-[12px] text-[var(--color-coral)]"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Payout history feed */}
      <motion.div variants={fadeUp} transition={transition.default} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="label-cap">Payout history</div>
          {payouts.isFetching && <span className="size-1.5 rounded-full bg-[var(--color-moss)] animate-pulse" />}
        </div>

        {payouts.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card-base p-4 flex items-center gap-4 animate-pulse">
                <div className="size-2 rounded-full bg-[var(--color-cream-2)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/4 rounded bg-[var(--color-cream-2)]" />
                  <div className="h-2.5 w-1/3 rounded bg-[var(--color-cream-2)]" />
                </div>
                <div className="h-4 w-16 rounded bg-[var(--color-cream-2)]" />
              </div>
            ))
          : (payouts.data?.items ?? []).length === 0
            ? <div className="card-base p-8 text-center"><p className="text-[13px] text-[var(--color-stone)]">No payouts yet.</p></div>
            : payouts.data?.items.map((p, i) => {
                const s = STATUS_MAP[p.status]
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...transition.fast, delay: i * 0.03 }}
                    className="card-base overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <span className={`size-2 rounded-full shrink-0 ${s.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[13px] font-semibold text-[var(--color-indigo)]">
                            {/* We only have recipientId here — pseudonymous ID not in payout model */}
                            {p.recipientId.slice(0, 8)}…
                          </span>
                          {p.batchId && (
                            <span className="text-[9px] font-mono text-[var(--color-stone)] bg-[var(--color-cream-2)] px-1.5 py-0.5 rounded">
                              batch
                            </span>
                          )}
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: s.bg, color: s.fg }}
                          >
                            {s.label}
                          </span>
                        </div>
                        {p.failureReason && (
                          <p className="mt-0.5 text-[10px] text-[var(--color-coral)] leading-snug truncate">{p.failureReason}</p>
                        )}
                      </div>
                      <span className="font-mono text-[15px] font-semibold text-[var(--color-indigo)] shrink-0">
                        {naira(p.amountKobo)}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--color-stone-soft)] shrink-0 hidden sm:block">
                        {new Date(p.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </motion.div>
                )
              })
        }
      </motion.div>
    </motion.div>
  )
}
