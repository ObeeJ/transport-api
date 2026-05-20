import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type Appeal = {
  id: string
  recipientId: string
  reason: string
  status: 'open' | 'under_review' | 'upheld' | 'dismissed'
  reviewNote?: string
  createdAt: string
  resolvedAt?: string
}

export function StewardAppeals() {
  const qc = useQueryClient()
  const q = useQuery<{ items: Appeal[] }>({
    queryKey: ['steward', 'appeals'],
    queryFn: () => api.get('/steward/appeals'),
    refetchInterval: 15_000,
  })

  const review = useMutation({
    mutationFn: (id: string) => api.post(`/steward/appeals/${id}/review`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['steward', 'appeals'] }),
  })

  const [deciding, setDeciding] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'upheld' | 'dismissed'>('upheld')
  const [note, setNote] = useState('')
  const [decideError, setDecideError] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: string; note: string }) =>
      api.post(`/steward/appeals/${id}/decide`, { outcome, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'appeals'] })
      setDeciding(null)
      setNote('')
    },
    onError: (err) => setDecideError(err instanceof ApiError ? err.message : 'Failed.'),
  })

  const items = q.data?.items ?? []

  return (
    <div>
      <StewardSubnav />
      <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Appeals</h1>
      <p className="mt-1 text-sm text-[var(--color-stone)]">
        Recipients challenging a decision. You must not have been involved in the original decision.
      </p>

      <div className="mt-6 space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card-base p-8 text-center">
            <p className="text-sm text-[var(--color-stone)]">No open appeals.</p>
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="card-base p-4">
              <div className="flex items-center justify-between">
                <span className="label-cap">{a.status.replace('_', ' ')}</span>
                <span className="font-mono text-[10px] text-[var(--color-stone)]">
                  {new Date(a.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink)] leading-relaxed">"{a.reason}"</p>

              {deciding === a.id ? (
                <div className="mt-3 space-y-2">
                  <div className="card-base p-1.5 flex">
                    {(['upheld', 'dismissed'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOutcome(o)}
                        className={`flex-1 text-xs py-2 rounded-[10px] font-medium capitalize ${
                          outcome === o ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]' : 'text-[var(--color-stone)]'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Note for the record…"
                    className="w-full card-base px-3 py-2 text-sm bg-[var(--color-cream)] outline-none resize-none"
                  />
                  {decideError && <p className="text-[11px] text-[var(--color-coral)]">{decideError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeciding(null)}
                      className="flex-1 h-9 rounded-[12px] border border-[var(--color-hairline)] text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => decide.mutate({ id: a.id, outcome, note })}
                      disabled={decide.isPending}
                      className="flex-1 h-9 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
                    >
                      {decide.isPending ? '…' : 'Submit decision'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  {a.status === 'open' && (
                    <button
                      onClick={() => review.mutate(a.id)}
                      disabled={review.isPending}
                      className="flex-1 h-9 rounded-[12px] border border-[var(--color-hairline)] text-xs"
                    >
                      Take for review
                    </button>
                  )}
                  {a.status === 'under_review' && (
                    <button
                      onClick={() => { setDeciding(a.id); setDecideError(null) }}
                      className="flex-1 h-9 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
                    >
                      Decide
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
