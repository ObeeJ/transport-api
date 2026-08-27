import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

type DriverApplication = {
  userId: string
  firstName: string
  lastName: string
  email: string
  vehiclePlate: string
  vehicleType: string
  trustScore?: number
  evidenceIds: string[]
  submittedAt: string
}

export function DriverQueue() {
  const qc = useQueryClient()
  const toast = useToast()
  const [notes, setNotes] = useState<Record<string, string>>({})

  const q = useQuery<{ items: DriverApplication[] }>({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.get('/admin/drivers/pending'),
    refetchInterval: 15_000,
  })

  const decide = useMutation({
    mutationFn: ({ userId, decision, note }: { userId: string; decision: string; note?: string }) =>
      api.admin.reviewDriver(userId, decision, note),
    onSuccess: (_, { decision }) => {
      toast.show(decision === 'approved' ? 'Driver approved.' : 'Driver rejected.', 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] })
    },
    onError: () => toast.show('Action failed. Try again.', 'error'),
  })

  return (
    <motion.div variants={stagger(0.06, 0.02)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">Driver queue</h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">
          Review evidence and approve or reject driver applications.
        </p>
      </motion.div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card-base h-32 animate-pulse" />)}
        </div>
      ) : (q.data?.items ?? []).length === 0 ? (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base p-10 text-center">
          <p className="text-[13px] font-medium text-[var(--color-indigo)]">Queue clear</p>
          <p className="mt-1 text-[11px] text-[var(--color-stone)]">No pending driver applications.</p>
        </motion.div>
      ) : (
        <AnimatePresence>
          {q.data!.items.map((d) => (
            <motion.div
              key={d.userId}
              variants={fadeUp}
              transition={transition.default}
              exit={{ opacity: 0, y: -8 }}
              className="card-base p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium text-[var(--color-ink)]">
                    {d.firstName} {d.lastName}
                  </div>
                  <div className="text-[11px] text-[var(--color-stone)] mt-0.5">{d.email}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[11px] text-[var(--color-stone)] uppercase tracking-wider">{d.vehicleType}</div>
                  <div className="font-mono text-[13px] font-medium text-[var(--color-indigo)]">{d.vehiclePlate}</div>
                </div>
              </div>

              {d.trustScore != null && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-stone)]">Trust score</span>
                  <span
                    className="font-mono text-[12px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: d.trustScore >= 70 ? 'rgba(94,114,89,0.12)' : 'rgba(217,119,87,0.12)',
                      color: d.trustScore >= 70 ? 'var(--color-moss)' : 'var(--color-clay)',
                    }}
                  >
                    {d.trustScore}
                  </span>
                </div>
              )}

              <div className="text-[11px] text-[var(--color-stone)]">
                {d.evidenceIds.length} evidence file{d.evidenceIds.length !== 1 ? 's' : ''} submitted ·{' '}
                {new Date(d.submittedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>

              <textarea
                placeholder="Notes (optional)"
                value={notes[d.userId] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [d.userId]: e.target.value }))}
                rows={2}
                className="w-full border border-[var(--color-hairline)] rounded-[10px] px-3 py-2 text-[12px] bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] resize-none transition-colors"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => decide.mutate({ userId: d.userId, decision: 'approved', note: notes[d.userId] })}
                  disabled={decide.isPending}
                  className="flex-1 h-9 rounded-[10px] text-sm font-medium bg-[var(--color-moss)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide.mutate({ userId: d.userId, decision: 'rejected', note: notes[d.userId] })}
                  disabled={decide.isPending}
                  className="flex-1 h-9 rounded-[10px] text-sm font-medium border border-[var(--color-coral)]/40 text-[var(--color-coral)] hover:bg-[rgba(200,75,58,0.06)] transition-colors disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
