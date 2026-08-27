import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function CirclePurchase() {
  const toast = useToast()
  const status = useQuery({ queryKey: ['circle', 'status'], queryFn: () => api.circle.status() })

  const purchase = useMutation({
    mutationFn: () => api.circle.purchase(),
    onSuccess: () => { status.refetch(); toast.show('Welcome to Akin Circle', 'success') },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  const m = status.data?.membership
  const badge = status.data?.badge

  if (m?.status === 'active') {
    return (
      <div className="pt-8 text-center">
        <div className="text-4xl mb-3">⭕</div>
        <h2 className="text-xl font-medium text-[var(--color-indigo)]">You're in the Circle</h2>
        {m.foundingMember && (
          <p className="mt-2 text-sm text-[var(--color-stone)]">Founding member — free for life.</p>
        )}
        {badge && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-[var(--color-cream)] text-[11px] font-medium capitalize">
            {badge} badge
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pt-4 max-w-sm mx-auto">
      <h2 className="text-2xl font-medium tracking-tight text-[var(--color-indigo)]">Akin Circle</h2>
      <p className="mt-2 text-sm text-[var(--color-stone)]">
        No ads. Verified badge. Priority support. ₦500/month — cancel anytime.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-[var(--color-ink)]">
        {['Ad-free experience', 'Verified tick on your profile', 'Priority support', 'Early access to new features'].map(f => (
          <li key={f} className="flex items-center gap-2">
            <span className="text-[var(--color-moss)]">✓</span> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => purchase.mutate()}
        disabled={purchase.isPending || status.isLoading}
        className="mt-6 w-full bg-[var(--color-indigo)] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40"
      >
        {purchase.isPending ? 'Processing…' : 'Join for ₦500/month'}
      </button>
    </div>
  )
}
