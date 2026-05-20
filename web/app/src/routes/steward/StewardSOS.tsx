import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type SOSAlert = {
  id: string
  tripId: string
  status: 'open' | 'acknowledged' | 'resolved'
  lat?: number
  lng?: number
  note?: string
  ackedAt?: string
  resolvedAt?: string
  createdAt: string
}

export function StewardSOS() {
  const qc = useQueryClient()
  const q = useQuery<{ items: SOSAlert[] }>({
    queryKey: ['steward', 'sos'],
    queryFn: () => api.get('/steward/sos'),
    refetchInterval: 5_000,
  })

  const ack = useMutation({
    mutationFn: (id: string) => api.post(`/steward/sos/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['steward', 'sos'] }),
  })
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/steward/sos/${id}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['steward', 'sos'] }),
  })

  const items = q.data?.items ?? []

  return (
    <div>
      <StewardSubnav />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">SOS Alerts</h1>
          <p className="mt-1 text-sm text-[var(--color-stone)]">Open alerts from active trips. Acknowledge first, then resolve.</p>
        </div>
        <span className="font-mono text-xs text-[var(--color-coral)]">{items.length} open</span>
      </div>

      <div className="mt-6 space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card-base p-8 text-center">
            <p className="text-sm text-[var(--color-stone)]">No open SOS alerts. Good.</p>
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="card-base p-4" style={{ borderColor: 'var(--color-coral)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[var(--color-coral)] animate-pulse" />
                  <span className="label-cap text-[var(--color-coral)]">{a.status.toUpperCase()}</span>
                </div>
                <span className="font-mono text-[10px] text-[var(--color-stone)]">
                  {new Date(a.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {a.note && <p className="mt-2 text-sm text-[var(--color-ink)]">"{a.note}"</p>}
              {a.lat && a.lng && (
                <p className="mt-1 font-mono text-[11px] text-[var(--color-stone)]">
                  {a.lat.toFixed(5)}, {a.lng.toFixed(5)}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {a.status === 'open' && (
                  <button
                    onClick={() => ack.mutate(a.id)}
                    disabled={ack.isPending}
                    className="flex-1 h-9 rounded-[12px] bg-[var(--color-clay)] text-[var(--color-paper)] text-xs font-medium"
                  >
                    Acknowledge
                  </button>
                )}
                {a.status === 'acknowledged' && (
                  <button
                    onClick={() => resolve.mutate(a.id)}
                    disabled={resolve.isPending}
                    className="flex-1 h-9 rounded-[12px] bg-[var(--color-moss)] text-[var(--color-paper)] text-xs font-medium"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
