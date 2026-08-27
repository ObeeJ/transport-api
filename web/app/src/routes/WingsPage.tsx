import { useQuery } from '@tanstack/react-query'
import { api, type WingsGrant } from '@/lib/api'

function naira(kobo: number) { return '₦' + Math.round(kobo / 100).toLocaleString('en-NG') }
function wings(w: number) { return `${w}W (~${naira(w * 100)})` }

function countdown(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d left` : `${h}h left`
}

export function WingsPage() {
  const balance = useQuery({ queryKey: ['wings', 'balance'], queryFn: () => api.wings.balance() })
  const history = useQuery({ queryKey: ['wings', 'history'], queryFn: () => api.wings.history() })
  const holds = useQuery({ queryKey: ['transparency', 'holds'], queryFn: () => api.transparency.myHolds() })

  const b = balance.data
  const locked = holds.data?.items[0]

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">Wings</h2>
      <p className="mt-1 text-[12px] text-[var(--color-stone)]">Ride credits. Not cash. Expire in 7 days.</p>

      <div className="mt-5 card-base p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]">
        <div className="label-cap">Available</div>
        <div className="mt-1 text-[44px] font-medium tracking-tight text-[var(--color-indigo)] leading-none">
          {balance.isLoading ? '…' : `${b?.available ?? 0}W`}
        </div>
        {b && b.expiring_soon > 0 && (
          <p className="mt-2 text-[11px] text-[var(--color-coral)]">
            {b.expiring_soon}W expiring within 24 hours — book a ride soon.
          </p>
        )}
        {b && b.locked > 0 && (
          <p className="mt-1 text-[11px] text-[var(--color-stone)]">
            {b.locked}W locked — post to unlock.
          </p>
        )}
      </div>

      {locked && (
        <div className="mt-4 card-base p-4 border border-[var(--color-amber)] bg-amber-50">
          <p className="text-sm font-medium text-[var(--color-ink)]">Post to unlock your credits</p>
          <p className="mt-1 text-[11px] text-[var(--color-stone)]">
            {locked.wingsLocked}W are locked. Share a thank-you post to release them.
          </p>
          <a href="/posts/new?kind=thank_you" className="mt-2 inline-block text-[11px] underline text-[var(--color-indigo)]">
            Write a post →
          </a>
        </div>
      )}

      <div className="mt-6">
        <div className="label-cap mb-3">History</div>
        {history.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : (history.data?.items ?? []).length === 0 ? (
          <div className="card-base p-5 text-center">
            <p className="text-sm text-[var(--color-stone)]">No wings yet.</p>
          </div>
        ) : (
          <div className="card-base divide-y divide-[var(--color-hairline)]">
            {(history.data?.items as WingsGrant[]).map(g => (
              <div key={g.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-[var(--color-ink)]">{g.purpose}</div>
                  <div className="text-[10px] text-[var(--color-stone)] mt-0.5">
                    {g.status === 'active' ? countdown(g.expiresAt) : g.status}
                  </div>
                </div>
                <div className="font-mono text-sm font-medium text-[var(--color-indigo)]">
                  {wings(g.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
