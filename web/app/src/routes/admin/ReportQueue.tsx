import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Report = {
  id: string
  reporterPseudonymId: string
  targetPseudonymId: string
  category: string
  body: string
  createdAt: string
}

const ACTIONS = ['warn', 'strike', 'suspend', 'dismiss'] as const
type Action = typeof ACTIONS[number]

export function ReportQueue() {
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<Record<string, Action>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const q = useQuery<{ items: Report[] }>({
    queryKey: ['admin', 'reports'],
    queryFn: () => api.get('/admin/reports'),
    refetchInterval: 20_000,
  })

  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note?: string }) =>
      api.post(`/admin/reports/${id}/action`, { action, note }),
    onSuccess: () => {
      toast.show('Action recorded.', 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'reports'] })
    },
    onError: () => toast.show('Action failed. Try again.', 'error'),
  })

  const actionColors: Record<Action, string> = {
    warn: 'var(--color-clay)',
    strike: 'var(--color-coral)',
    suspend: 'var(--color-coral)',
    dismiss: 'var(--color-stone)',
  }

  return (
    <motion.div variants={stagger(0.06, 0.02)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">Reports</h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">User-submitted reports awaiting admin action.</p>
      </motion.div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="card-base h-40 animate-pulse" />)}
        </div>
      ) : (q.data?.items ?? []).length === 0 ? (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base p-10 text-center">
          <p className="text-[13px] font-medium text-[var(--color-indigo)]">No open reports</p>
          <p className="mt-1 text-[11px] text-[var(--color-stone)]">All reports have been actioned.</p>
        </motion.div>
      ) : (
        <AnimatePresence>
          {q.data!.items.map((r) => (
            <motion.div
              key={r.id}
              variants={fadeUp}
              transition={transition.default}
              exit={{ opacity: 0, y: -8 }}
              className="card-base p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-coral)]/10 text-[var(--color-coral)]">
                    {r.category}
                  </span>
                  <p className="mt-2 text-[13px] text-[var(--color-ink)] leading-relaxed">{r.body}</p>
                </div>
                <div className="text-right shrink-0 text-[10px] text-[var(--color-stone)] font-mono">
                  {new Date(r.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                </div>
              </div>

              <div className="text-[11px] text-[var(--color-stone)]">
                Reporter: <span className="font-mono">{r.reporterPseudonymId}</span> →{' '}
                Target: <span className="font-mono">{r.targetPseudonymId}</span>
              </div>

              {/* Action selector */}
              <div className="flex gap-2 flex-wrap">
                {ACTIONS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setSelected((s) => ({ ...s, [r.id]: a }))}
                    className="h-8 px-3 rounded-[8px] text-[11px] font-medium capitalize border transition-all"
                    style={
                      selected[r.id] === a
                        ? { background: actionColors[a], color: 'white', borderColor: actionColors[a] }
                        : { borderColor: 'var(--color-hairline)', color: 'var(--color-stone)' }
                    }
                  >
                    {a}
                  </button>
                ))}
              </div>

              <textarea
                placeholder="Notes (optional)"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                rows={2}
                className="w-full border border-[var(--color-hairline)] rounded-[10px] px-3 py-2 text-[12px] bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] resize-none transition-colors"
              />

              <button
                onClick={() => act.mutate({ id: r.id, action: selected[r.id] ?? 'dismiss', note: notes[r.id] })}
                disabled={act.isPending}
                className="w-full h-9 rounded-[10px] text-sm font-medium bg-[var(--color-indigo)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {act.isPending ? 'Submitting…' : 'Submit action'}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
