import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Recipient = {
  id: string
  pseudonymousId: string
  status: 'pending' | 'approved' | 'declined'
  disbursementMethod: 'wallet' | 'bank'
}

type Method = 'wallet' | 'bank'

export function RecipientApply() {
  const navigate = useNavigate()

  const roster = useQuery<{ verified: boolean }>({
    queryKey: ['roster', 'me'],
    queryFn: () => api.get('/roster/me'),
  })

  const [weeklyCost, setWeeklyCost] = useState('')
  const [situation, setSituation] = useState('')
  const [method, setMethod] = useState<Method>('wallet')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cost = parseInt(weeklyCost.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(cost) || cost < 100) {
      setError('Tell us your typical weekly transport cost (at least ₦100).')
      return
    }
    setSubmitting(true)
    try {
      await api.post<Recipient>('/recipients/apply', {
        weeklyCostKobo: cost * 100,
        situation,
        disbursementMethod: method,
      })
      navigate('/support/status', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit. Try again.')
      setSubmitting(false)
    }
  }

  if (roster.isLoading) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Loading…</p>
  }

  if (!roster.data?.verified) {
    navigate('/support/verify', { replace: true })
    return null
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      variants={stagger(0.08, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.h2
        variants={fadeUp}
        transition={transition.default}
        className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight"
      >
        Ask for support.
      </motion.h2>
      <motion.p
        variants={fadeUp}
        transition={transition.default}
        className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]"
      >
        Your name never appears in the steward queue — only a short code (e.g.{' '}
        <span className="font-mono text-[var(--color-ink)]">R‑7421</span>). Two stewards must agree before any decision. You can ask once.
      </motion.p>

      <motion.div variants={stagger(0.07, 0.15)} initial="hidden" animate="show" className="mt-6 space-y-4">
        <motion.label variants={fadeUp} transition={transition.default} className="block">
          <div className="label-cap mb-2">Typical weekly transport cost (₦)</div>
          <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">
            <div className="flex items-baseline gap-2">
              <span className="text-base text-[var(--color-stone)]">₦</span>
              <input
                inputMode="numeric"
                required
                value={weeklyCost}
                onChange={(e) => setWeeklyCost(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
                className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-stone-soft)]"
              />
            </div>
          </div>
        </motion.label>

        <motion.label variants={fadeUp} transition={transition.default} className="block">
          <div className="label-cap mb-2">Your situation</div>
          <div className="card-base px-4 py-3 bg-[var(--color-cream)]">
            <textarea
              required
              minLength={20}
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              rows={4}
              placeholder="A short note. Stewards read this with care."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)] resize-none"
            />
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-stone)]">
            Optional but helpful. Stewards see this; givers never do.
          </p>
        </motion.label>

        <motion.div variants={fadeUp} transition={transition.default} className="block">
          <div className="label-cap mb-2">How you'd like to receive</div>
          <div className="card-base p-1.5 flex">
            <MethodBtn active={method === 'wallet'} onClick={() => setMethod('wallet')}>Mobile wallet</MethodBtn>
            <MethodBtn active={method === 'bank'} onClick={() => setMethod('bank')}>Bank transfer</MethodBtn>
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-stone)]">
            You can change this later. Bank details are collected separately when stewards approve.
          </p>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {error ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition.fast}
            className="mt-4 text-[12px] text-[var(--color-coral)]"
            role="alert"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <motion.button
        variants={fadeUp}
        transition={transition.default}
        whileTap={{ scale: 0.98 }}
        type="submit"
        disabled={submitting}
        className="btn-primary w-full mt-8 h-[52px]"
      >
        {submitting ? 'Sending…' : 'Send to stewards'}
      </motion.button>
      <motion.p
        variants={fadeUp}
        transition={transition.slow}
        className="text-[11px] mt-3 text-center text-[var(--color-stone)]"
      >
        Two stewards must agree. You'll be told the outcome — never anyone else.
      </motion.p>
    </motion.form>
  )
}

function MethodBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={transition.fast}
      className={`flex-1 text-xs py-2.5 rounded-[12px] font-medium transition-colors duration-150 ${
        active ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]' : 'text-[var(--color-stone)]'
      }`}
    >
      {children}
    </motion.button>
  )
}
