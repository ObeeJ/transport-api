import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fadeUp, stagger, ease, transition } from '@/lib/motion'

type Frequency = 'once' | 'weekly' | 'monthly'

type PoolThisWeek = {
  totalKobo: number
  depositCount: number
  uniqueGivers: number
  hidden: boolean
  hiddenReason?: string
}

type InitializeResponse = {
  authorizationUrl: string
  reference: string
}

function formatNaira(kobo: number): string {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

export function GiverHome() {
  const { user, logout } = useAuth()
  const [amountNaira, setAmountNaira] = useState<string>('')
  const [frequency, setFrequency] = useState<Frequency>('once')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pool = useQuery<PoolThisWeek>({
    queryKey: ['pool', 'this-week'],
    queryFn: () => api.get<PoolThisWeek>('/pool/this-week'),
  })

  async function onContinue() {
    setError(null)
    const naira = parseInt(amountNaira.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(naira) || naira < 100) {
      setError('Enter an amount of at least ₦100.')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<InitializeResponse>('/giver/deposits/initialize', {
        amountKobo: naira * 100,
        frequency,
      })
      window.location.assign(res.authorizationUrl)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'payments_not_configured') {
        setError('Paystack isn't configured yet on the server.')
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Could not start the payment. Try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      variants={stagger(0.08, 0.05)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.p variants={fadeUp} transition={transition.fast} className="text-[13px] text-[var(--color-stone)]">
        Signed in as <span className="text-[var(--color-ink)]">{user?.email}</span>.{' '}
        <button
          type="button"
          onClick={() => logout()}
          className="underline underline-offset-[3px] text-[var(--color-stone)]"
        >
          sign out
        </button>
      </motion.p>

      {/* Pool card */}
      <motion.section
        variants={fadeUp}
        transition={transition.default}
        className="card-base mt-3 p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]"
      >
        <div className="label-cap">This week's pool</div>
        <div className="mt-2 text-[44px] font-medium tracking-tight text-[var(--color-indigo)] leading-none">
          {pool.isLoading ? (
            <span className="text-[var(--color-stone-soft)]">…</span>
          ) : pool.data?.hidden ? (
            <span className="text-[var(--color-stone-soft)]">— hidden —</span>
          ) : (
            <AnimatePresence mode="wait">
              <motion.span
                key={pool.data?.totalKobo}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={transition.default}
              >
                {formatNaira(pool.data?.totalKobo ?? 0)}
              </motion.span>
            </AnimatePresence>
          )}
        </div>
        <div className="my-4 h-px bg-[var(--color-hairline)]" />
        <motion.div
          variants={stagger(0.06, 0)}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 gap-2 text-xs"
        >
          <Stat n={String(pool.data?.depositCount ?? 0)} l="deposits · last 7d" />
          <Stat n={String(pool.data?.uniqueGivers ?? 0)} l="givers" />
          <Stat n="—" l="attendance lift" />
        </motion.div>
        {pool.data?.hidden ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-3 text-[10px] text-[var(--color-stone)]"
          >
            Total hidden until at least 3 givers have contributed this week — privacy by design.
          </motion.p>
        ) : null}
      </motion.section>

      {/* Give form */}
      <motion.h2
        variants={fadeUp}
        transition={transition.default}
        className="mt-6 text-2xl font-medium tracking-tight text-[var(--color-indigo)]"
      >
        Give to the pool
      </motion.h2>

      <motion.div variants={fadeUp} transition={transition.default} className="mt-3 card-base p-5">
        <div className="label-cap">Amount (₦)</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[38px] text-[var(--color-stone-soft)] font-medium">₦</span>
          <input
            inputMode="numeric"
            value={amountNaira}
            onChange={(e) => setAmountNaira(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            className="flex-1 bg-transparent text-[38px] font-medium tracking-tight outline-none placeholder:text-[var(--color-stone-soft)]"
          />
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-stone)]">
          No preset amounts. Whatever you choose is enough.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="mt-3 card-base p-1.5 flex">
        <FreqBtn active={frequency === 'once'} onClick={() => setFrequency('once')}>Once</FreqBtn>
        <FreqBtn active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</FreqBtn>
        <FreqBtn active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</FreqBtn>
      </motion.div>

      <AnimatePresence>
        {error ? (
          <motion.p
            key="error"
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
        type="button"
        onClick={onContinue}
        disabled={submitting}
        className="btn-primary mt-6 w-full h-[52px]"
      >
        {submitting ? 'Opening Paystack…' : 'Continue to Paystack'}
      </motion.button>

      <motion.p
        variants={fadeUp}
        transition={transition.default}
        className="text-[11px] mt-3 text-center text-[var(--color-stone)]"
      >
        100% goes to the pool. Operating cost is funded separately.
      </motion.p>

      <motion.div
        variants={fadeUp}
        transition={transition.slow}
        className="mt-6 card-base p-4 flex items-center justify-between"
      >
        <div>
          <div className="label-cap">Leave a note</div>
          <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">Anonymous encouragement for recipients.</p>
        </div>
        <Link to="/notes" className="text-xs font-medium text-[var(--color-indigo)] underline underline-offset-[3px]">
          Write one →
        </Link>
      </motion.div>
    </motion.div>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <motion.div variants={fadeUp}>
      <div className="text-xl font-medium text-[var(--color-ink)]">{n}</div>
      <div className="text-[var(--color-stone)]">{l}</div>
    </motion.div>
  )
}

function FreqBtn({
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
