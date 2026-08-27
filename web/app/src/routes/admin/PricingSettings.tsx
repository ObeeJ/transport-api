import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api, type PricingQuote } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

type PricingSettings = {
  fuelPriceNaira: number
  driverMarginPct: number
  platformFeePct: number
  platformFeeMin: number
  platformFeeMax: number
  surgeMorning: number
  surgeEvening: number
}

function naira(kobo: number) {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

export function PricingSettings() {
  const qc = useQueryClient()
  const toast = useToast()
  const [previewVehicle, setPreviewVehicle] = useState('sedan')
  const [previewDist, setPreviewDist] = useState('10')

  const settings = useQuery<PricingSettings>({
    queryKey: ['admin', 'pricing'],
    queryFn: () => api.get('/admin/pricing'),
  })

  const [draft, setDraft] = useState<Partial<PricingSettings>>({})
  const merged = { ...settings.data, ...draft } as PricingSettings

  const save = useMutation({
    mutationFn: () => api.admin.updatePricing(draft),
    onSuccess: () => {
      toast.show('Pricing updated.', 'success')
      setDraft({})
      qc.invalidateQueries({ queryKey: ['admin', 'pricing'] })
    },
    onError: () => toast.show('Could not save. Try again.', 'error'),
  })

  const preview = useQuery<PricingQuote>({
    queryKey: ['pricing', 'preview', previewVehicle, previewDist],
    queryFn: () => api.pricing.quote(previewVehicle, parseFloat(previewDist) || 10),
    enabled: !!settings.data,
  })

  function field(key: keyof PricingSettings, label: string, step = 1, suffix = '') {
    const val = merged[key] ?? 0
    return (
      <div className="flex items-center justify-between py-3 border-b border-[var(--color-hairline)] last:border-0">
        <label className="text-[13px] text-[var(--color-ink)]">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={step}
            value={val}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) }))}
            className="w-24 text-right font-mono text-[13px] border border-[var(--color-hairline)] rounded-[8px] px-2 py-1 bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
          />
          {suffix && <span className="text-[11px] text-[var(--color-stone)]">{suffix}</span>}
        </div>
      </div>
    )
  }

  return (
    <motion.div variants={stagger(0.06, 0.02)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">Pricing</h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">Physics-based fares. Changes apply to new quotes immediately.</p>
      </motion.div>

      {settings.isLoading ? (
        <div className="card-base p-5 animate-pulse h-48" />
      ) : (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
          {field('fuelPriceNaira', 'Fuel price', 10, '₦/L')}
          {field('driverMarginPct', 'Driver margin', 0.01, '%')}
          {field('platformFeePct', 'Platform fee', 0.01, '%')}
          {field('platformFeeMin', 'Fee minimum (kobo)', 100)}
          {field('platformFeeMax', 'Fee maximum (kobo)', 100)}
          {field('surgeMorning', 'Morning surge', 0.05, '×')}
          {field('surgeEvening', 'Evening surge', 0.05, '×')}

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || Object.keys(draft).length === 0}
              className="btn-primary h-9 px-5 text-sm disabled:opacity-40"
            >
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Live preview */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="label-cap mb-4">Fare preview</div>
        <div className="flex gap-3 mb-4">
          <select
            value={previewVehicle}
            onChange={(e) => setPreviewVehicle(e.target.value)}
            className="flex-1 border border-[var(--color-hairline)] rounded-[8px] px-3 py-2 text-sm bg-[var(--color-cream)] outline-none"
          >
            {['keke', 'small_car', 'sedan', 'big_suv', 'van', 'hiace', 'coaster'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={previewDist}
              onChange={(e) => setPreviewDist(e.target.value)}
              className="w-20 border border-[var(--color-hairline)] rounded-[8px] px-2 py-2 text-sm font-mono bg-[var(--color-cream)] outline-none"
            />
            <span className="text-[11px] text-[var(--color-stone)]">km</span>
          </div>
        </div>
        {preview.isLoading ? (
          <div className="h-16 animate-pulse bg-[var(--color-cream)] rounded-[10px]" />
        ) : preview.data ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-stone)]">Rider pays</div>
              <div className="text-[20px] font-medium text-[var(--color-indigo)]">{naira(preview.data.fareKobo)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-stone)]">Driver earns</div>
              <div className="text-[20px] font-medium text-[var(--color-moss)]">{naira(preview.data.driverEarnsKobo)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-stone)]">Platform fee</div>
              <div className="text-[20px] font-medium text-[var(--color-clay)]">{naira(preview.data.platformFeeKobo)}</div>
            </div>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}
