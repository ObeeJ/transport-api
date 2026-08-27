import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { api, type RecurringSponsor } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Cadence = 'weekly' | 'monthly'

export function SponsorSetup() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [cadence, setCadence] = useState<Cadence>('weekly')
  const [authCode, setAuthCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const setup = useMutation({
    mutationFn: () =>
      api.sponsor.setupRecurring({
        amountKobo: parseInt(amount) * 100,
        cadence,
        authCode,
      }),
    onSuccess: (_data: RecurringSponsor) => {
      toast.show(`${cadence === 'weekly' ? 'Weekly' : 'Monthly'} giving set up.`, 'success')
      qc.invalidateQueries({ queryKey: ['sponsor'] })
      navigate('/give')
    },
    onError: (e: Error) => setError(e.message),
  })

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    const n = parseInt(amount)
    if (!n || n < 100) { setError('Minimum is ₦100.'); return }
    if (!authCode.trim()) { setError('Paystack auth code is required.'); return }
    setup.mutate()
  }

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={fadeUp} transition={transition.default}>
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Set up giving
        </h2>
        <p className="mt-2 text-[12px] text-[var(--color-stone)] leading-relaxed">
          Recurring gifts go directly into the community pool. Recipients never know who gave.
        </p>
      </motion.div>

      <motion.form variants={fadeUp} transition={transition.default} onSubmit={onSubmit} className="space-y-4">
        {/* Amount */}
        <div className="card-base p-5">
          <div className="label-cap mb-2">Amount (₦)</div>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-transparent text-[36px] font-medium tracking-tight outline-none placeholder:text-[var(--color-stone-soft)] text-[var(--color-indigo)]"
          />
        </div>

        {/* Cadence */}
        <div className="card-base p-1 flex">
          {(['weekly', 'monthly'] as Cadence[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium capitalize transition-colors duration-150 ${
                cadence === c
                  ? 'bg-[var(--color-clay)] text-white'
                  : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Auth code */}
        <div className="card-base p-5">
          <div className="label-cap mb-2">Paystack auth code</div>
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="AUTH_xxxxxxxxxx"
            className="w-full font-mono text-[13px] bg-transparent outline-none placeholder:text-[var(--color-stone-soft)] text-[var(--color-ink)]"
          />
          <p className="mt-2 text-[10px] text-[var(--color-stone)]">
            Complete a one-time Paystack charge first to get your auth code.
          </p>
        </div>

        {error && (
          <p className="text-[12px] text-[var(--color-coral)] px-1" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={setup.isPending}
          className="btn-primary w-full h-[52px] text-[14px] disabled:opacity-50"
        >
          {setup.isPending ? 'Setting up…' : `Start ${cadence} giving`}
        </button>
      </motion.form>
    </motion.div>
  )
}
