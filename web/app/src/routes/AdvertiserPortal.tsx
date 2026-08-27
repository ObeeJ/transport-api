import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Ad = {
  id: string
  ctaUrl: string
  budgetKobo: number
  spentKobo: number
  status: string
  createdAt: string
}

function naira(kobo: number) {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

export function AdvertiserPortal() {
  const qc = useQueryClient()
  const toast = useToast()
  const [ctaUrl, setCtaUrl] = useState('')
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const ads = useQuery<{ items: Ad[] }>({
    queryKey: ['ads', 'mine'],
    queryFn: () => api.get('/ads/mine'),
  })

  const create = useMutation({
    mutationFn: () => api.post('/ads', { ctaUrl, budgetKobo: parseInt(budget) * 100 }),
    onSuccess: () => {
      toast.show('Ad submitted for review.', 'success')
      setCtaUrl('')
      setBudget('')
      setCreating(false)
      qc.invalidateQueries({ queryKey: ['ads', 'mine'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!ctaUrl.trim()) { setError('CTA URL is required.'); return }
    const b = parseInt(budget)
    if (!b || b < 1000) { setError('Minimum budget is ₦1,000.'); return }
    create.mutate()
  }

  const statusColor: Record<string, string> = {
    pending: 'var(--color-clay)',
    active: 'var(--color-moss)',
    paused: 'var(--color-stone)',
    exhausted: 'var(--color-coral)',
  }

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} transition={transition.default} className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">Ads</h2>
          <p className="mt-1 text-[12px] text-[var(--color-stone)]">
            Shown only to non-Circle members. Max 1 per 8 posts.
          </p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="shrink-0 h-9 px-4 rounded-[10px] bg-[var(--color-indigo)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {creating ? 'Cancel' : 'New ad'}
        </button>
      </motion.div>

      {creating && (
        <motion.form
          variants={fadeUp}
          transition={transition.default}
          onSubmit={onSubmit}
          className="card-base p-5 space-y-4"
        >
          <div>
            <label className="label-cap mb-2 block">CTA URL</label>
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full border border-[var(--color-hairline)] rounded-[10px] px-4 py-3 text-sm bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
            />
          </div>
          <div>
            <label className="label-cap mb-2 block">Budget (₦)</label>
            <input
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))}
              placeholder="1000"
              className="w-full border border-[var(--color-hairline)] rounded-[10px] px-4 py-3 text-sm font-mono bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
            />
          </div>
          {error && <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
          <button type="submit" disabled={create.isPending} className="btn-primary w-full h-10 text-sm disabled:opacity-50">
            {create.isPending ? 'Submitting…' : 'Submit for review'}
          </button>
        </motion.form>
      )}

      {ads.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="card-base h-16 animate-pulse" />)}
        </div>
      ) : (ads.data?.items ?? []).length === 0 ? (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base p-8 text-center">
          <p className="text-[13px] text-[var(--color-stone)]">No ads yet. Create your first one above.</p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base divide-y divide-[var(--color-hairline)]">
          {ads.data!.items.map((ad) => (
            <div key={ad.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-mono text-[var(--color-ink)] truncate">{ad.ctaUrl}</div>
                <div className="text-[10px] text-[var(--color-stone)] mt-0.5">
                  {naira(ad.spentKobo)} spent of {naira(ad.budgetKobo)}
                </div>
              </div>
              <span
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: `${statusColor[ad.status] ?? 'var(--color-stone)'}18`, color: statusColor[ad.status] ?? 'var(--color-stone)' }}
              >
                {ad.status}
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
