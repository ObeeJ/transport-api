import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type DriverProfile = {
  id: string
  status: 'pending' | 'approved' | 'declined'
  vehicleType: string
  vehiclePlate: string
  licenseNumber: string
  note?: string
  createdAt: string
}

export function StewardDrivers() {
  const qc = useQueryClient()
  const q = useQuery<{ items: DriverProfile[] }>({
    queryKey: ['steward', 'drivers'],
    queryFn: () => api.get('/steward/drivers/queue'),
    refetchInterval: 15_000,
  })

  const [deciding, setDeciding] = useState<string | null>(null)
  const [decision, setDecision] = useState<'approve' | 'decline'>('approve')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note: string }) =>
      api.post(`/steward/drivers/${id}/decisions`, { decision, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steward', 'drivers'] })
      setDeciding(null)
      setNote('')
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed.'),
  })

  const items = q.data?.items ?? []

  return (
    <div>
      <StewardSubnav />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Driver Queue</h1>
          <p className="mt-1 text-sm text-[var(--color-stone)]">
            Pending driver applications. Two distinct stewards must sign off.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--color-stone)]">{items.length} pending</span>
      </div>

      <div className="mt-6 space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card-base p-8 text-center">
            <p className="text-sm text-[var(--color-stone)]">No pending driver applications.</p>
          </div>
        ) : (
          items.map((d) => (
            <div key={d.id} className="card-base p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-[var(--color-indigo)] uppercase">{d.vehiclePlate}</span>
                <span className="label-cap">{d.vehicleType}</span>
              </div>
              <div className="mt-2 text-[12px] text-[var(--color-stone)]">
                Licence: <span className="font-mono text-[var(--color-ink)]">{d.licenseNumber}</span>
              </div>
              {d.note && <p className="mt-2 text-[12px] text-[var(--color-stone)] italic">"{d.note}"</p>}

              {deciding === d.id ? (
                <div className="mt-3 space-y-2">
                  <div className="card-base p-1.5 flex">
                    {(['approve', 'decline'] as const).map((dec) => (
                      <button
                        key={dec}
                        type="button"
                        onClick={() => setDecision(dec)}
                        className={`flex-1 text-xs py-2 rounded-[10px] font-medium capitalize ${
                          decision === dec ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]' : 'text-[var(--color-stone)]'
                        }`}
                      >
                        {dec}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Note (optional)…"
                    className="w-full card-base px-3 py-2 text-sm bg-[var(--color-cream)] outline-none resize-none"
                  />
                  {error && <p className="text-[11px] text-[var(--color-coral)]">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setDeciding(null)} className="flex-1 h-9 rounded-[12px] border border-[var(--color-hairline)] text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={() => decide.mutate({ id: d.id, decision, note })}
                      disabled={decide.isPending}
                      className="flex-1 h-9 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
                    >
                      {decide.isPending ? '…' : 'Submit'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setDeciding(d.id); setError(null) }}
                  className="mt-3 w-full h-9 rounded-[12px] border border-[var(--color-hairline)] text-xs"
                >
                  Review →
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
