import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function AmbassadorDashboard() {
  const toast = useToast()
  const me = useQuery({ queryKey: ['ambassador', 'me'], queryFn: () => api.ambassador.me() })

  const activate = useMutation({
    mutationFn: () => api.ambassador.activate(),
    onSuccess: () => me.refetch(),
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  if (me.isLoading) return <p className="pt-8 text-sm text-[var(--color-stone)]">Loading…</p>

  if (!me.data) {
    return (
      <div className="pt-4 max-w-sm mx-auto text-center">
        <h2 className="text-2xl font-medium text-[var(--color-indigo)]">Become an Ambassador</h2>
        <p className="mt-2 text-sm text-[var(--color-stone)]">
          Share your referral code. Earn Wings and cash when people you refer complete their first ride.
        </p>
        <button
          onClick={() => activate.mutate()}
          disabled={activate.isPending}
          className="mt-6 w-full bg-[var(--color-indigo)] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40"
        >
          {activate.isPending ? 'Activating…' : 'Activate'}
        </button>
      </div>
    )
  }

  const a = me.data
  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">Ambassador</h2>
      <div className="mt-1 inline-block px-2 py-0.5 rounded-full bg-[var(--color-cream)] text-[10px] font-medium uppercase tracking-wider text-[var(--color-stone)] capitalize">
        {a.tier}
      </div>

      <div className="mt-5 card-base p-5">
        <div className="label-cap">Your referral code</div>
        <div className="mt-1 font-mono text-2xl font-medium text-[var(--color-indigo)]">{a.referralCode}</div>
        <button
          onClick={() => { navigator.clipboard.writeText(a.referralCode); toast.show('Copied!', 'success') }}
          className="mt-2 text-[11px] underline text-[var(--color-stone)]"
        >
          Copy
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="card-base p-4">
          <div className="label-cap">Wings earned</div>
          <div className="mt-1 text-2xl font-medium text-[var(--color-indigo)]">{a.earnedWings}W</div>
        </div>
        <div className="card-base p-4">
          <div className="label-cap">Cash earned</div>
          <div className="mt-1 text-2xl font-medium text-[var(--color-indigo)]">
            ₦{Math.round(a.earnedNaira / 100).toLocaleString('en-NG')}
          </div>
        </div>
      </div>
    </div>
  )
}
