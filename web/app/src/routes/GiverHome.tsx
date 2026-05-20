import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

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
  const naira = Math.round(kobo / 100)
  return '₦' + naira.toLocaleString('en-NG')
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
        setError('Paystack isn’t configured yet on the server. Add the test keys to .env and restart the API.')
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Could not start the payment. Try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="pt-4">
      <p className="text-[13px] text-[var(--color-stone)]">
        Signed in as <span className="text-[var(--color-ink)]">{user?.email}</span>.{' '}
        <button
          type="button"
          onClick={() => logout()}
          className="underline underline-offset-[3px] text-[var(--color-stone)]"
        >
          sign out
        </button>
      </p>

      <section className="card-base mt-3 p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]">
        <div className="label-cap">This week's pool</div>
        <div className="mt-2 text-[44px] font-medium tracking-tight text-[var(--color-indigo)] leading-none">
          {pool.isLoading
            ? '…'
            : pool.data?.hidden
              ? '— hidden —'
              : (
                <motion.span
                  key={pool.data?.totalKobo}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {formatNaira(pool.data?.totalKobo ?? 0)}
                </motion.span>
              )}
        </div>
        <div className="my-4 h-px bg-[var(--color-hairline)]" />
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat n={String(pool.data?.depositCount ?? 0)} l="deposits · last 7d" />
          <Stat n={String(pool.data?.uniqueGivers ?? 0)} l="givers" />
          <Stat n="—" l="attendance lift" />
        </div>
        {pool.data?.hidden ? (
          <p className="mt-3 text-[10px] text-[var(--color-stone)]">
            Total hidden until at least 3 givers have contributed this week — privacy by design.
          </p>
        ) : null}
      </section>

      <h2 className="mt-6 text-2xl font-medium tracking-tight text-[var(--color-indigo)]">
        Give to the pool
      </h2>

      <div className="mt-3 card-base p-5">
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
      </div>

      <div className="mt-3 card-base p-1.5 flex">
        <FreqBtn active={frequency === 'once'} onClick={() => setFrequency('once')}>Once</FreqBtn>
        <FreqBtn active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</FreqBtn>
        <FreqBtn active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</FreqBtn>
      </div>

      {error ? (
        <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        disabled={submitting}
        className="btn-primary mt-6 w-full h-[52px]"
      >
        {submitting ? 'Opening Paystack…' : 'Continue to Paystack'}
      </button>
      <p className="text-[11px] mt-3 text-center text-[var(--color-stone)]">
        100% goes to the pool. Operating cost is funded separately.
      </p>

      <div className="mt-6 card-base p-4 flex items-center justify-between">
        <div>
          <div className="label-cap">Leave a note</div>
          <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">Anonymous encouragement for recipients.</p>
        </div>
        <Link to="/notes" className="text-xs font-medium text-[var(--color-indigo)] underline underline-offset-[3px]">Write one →</Link>
      </div>
    </div>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-xl font-medium text-[var(--color-ink)]">{n}</div>
      <div className="text-[var(--color-stone)]">{l}</div>
    </div>
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
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-xs py-2.5 rounded-[12px] font-medium ${
        active ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]' : 'text-[var(--color-stone)]'
      }`}
    >
      {children}
    </button>
  )
}
