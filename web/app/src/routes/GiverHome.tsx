import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { useAuth } from '@/lib/auth'

type Frequency = 'once' | 'weekly' | 'monthly'

type PoolThisWeek = {
  totalKobo: number
  depositCount: number
  uniqueGivers: number
  hidden: boolean
}

type InitializeResponse = {
  authorizationUrl: string
  reference: string
}

function formatNaira(kobo: number): string {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

// Empty 4×7 fallback for when the activity query is still loading or the
// user has no deposits yet. Same shape the API returns.
const emptyMatrix: number[][] = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
]

export function GiverHome() {
  const { user } = useAuth()
  const [amountNaira, setAmountNaira] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('once')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recipient = useQuery<{ status: string } | null>({
    queryKey: ['recipient', 'me'],
    queryFn: () => api.get<{ status: string }>('/recipients/me').catch(() => null),
    enabled: !!user,
  })
  const isActiveRecipient = recipient.data?.status === 'approved'

  const [activeCell, setActiveCell] = useState<{ weekIdx: number; dayIdx: number; val: number } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ weekIdx: number; dayIdx: number; val: number } | null>(null)
  const active = activeCell || selectedCell

  const pool = useQuery<PoolThisWeek>({
    queryKey: ['pool', 'this-week'],
    queryFn: () => api.get<PoolThisWeek>('/pool/this-week'),
  })

  const activity = useQuery<{ weeks: number[][] }>({
    queryKey: ['giver', 'activity'],
    queryFn: () => api.get<{ weeks: number[][] }>('/giver/activity'),
    enabled: !!user,
    staleTime: 60 * 1000,
  })
  const donationMatrix = activity.data?.weeks ?? emptyMatrix

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
        setError('Payments are not configured on the server yet.')
      } else if (err instanceof ApiError && err.code === 'active_recipient_cannot_give') {
        setError('Giving is paused while you have an active recipient status.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not start the payment. Try again.')
      }
      setSubmitting(false)
    }
  }

  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {/* ── Pool balance ── */}
      <motion.section
        variants={fadeUp}
        transition={transition.default}
        className="card-base p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]"
      >
        <div className="label-cap">This week's pool</div>
        <div className="mt-2 leading-none">
          {pool.isLoading ? (
            <span className="text-[40px] font-medium text-[var(--color-stone-soft)]">…</span>
          ) : pool.data?.hidden ? (
            <span className="text-[22px] font-medium text-[var(--color-stone)]">Hidden until 3 givers contribute</span>
          ) : (
            <AnimatePresence mode="wait">
              <motion.span
                key={pool.data?.totalKobo}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={transition.default}
                className="text-[44px] font-medium tracking-tight text-[var(--color-indigo)]"
              >
                {formatNaira(pool.data?.totalKobo ?? 0)}
              </motion.span>
            </AnimatePresence>
          )}
        </div>

        <div className="mt-4 h-px bg-[var(--color-hairline)]" />

        <div className="mt-4 grid grid-cols-3 gap-3">
          <PoolStat value={String(pool.data?.depositCount ?? 0)} label="deposits" />
          <PoolStat value={String(pool.data?.uniqueGivers ?? 0)} label="givers" />
          <PoolStat value="+24%" label="attendance" tone="moss" />
        </div>
      </motion.section>

      {/* Donation Activity Pillars */}
      <motion.section variants={fadeUp} className="card-base p-5 border border-[var(--color-hairline)] glow-indigo">
        <div className="flex items-center justify-between">
          <div>
            <span className="label-cap text-[var(--color-indigo)] font-bold">Donation Activity & Momentum</span>
            <p className="text-[11px] text-[var(--color-stone)]">Community deposit frequency across 4-week window</p>
          </div>
          <span className="text-[10px] bg-[var(--color-indigo)]/10 text-[var(--color-indigo)] px-2 py-0.5 rounded font-mono font-bold tracking-wider">Live</span>
        </div>

        <div className="mt-5 space-y-3">
          {/* Header Row (Days) */}
          <div className="grid grid-cols-[60px_1fr] gap-3 items-center">
            <span className="text-[9px] font-mono text-[var(--color-stone)] font-bold uppercase tracking-wider">Window</span>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-mono text-[var(--color-stone)] font-semibold">
              {dayNames.map((day, idx) => (
                <div
                  key={idx}
                  className={`transition-colors duration-150 py-0.5 rounded ${
                    active?.dayIdx === idx ? 'text-[var(--color-indigo)] font-bold bg-[var(--color-indigo)]/5 scale-105' : ''
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Week Rows */}
          <div className="space-y-2">
            {[1, 2, 3, 4].map((weekNum, weekIdx) => {
              const weekLabel = `Week ${weekNum}`;
              const weekData = donationMatrix[weekIdx];
              return (
                <div key={weekNum} className="grid grid-cols-[60px_1fr] gap-3 items-center">
                  <span
                    className={`text-[10px] font-medium transition-all duration-150 py-1 rounded truncate text-left ${
                      active && active.weekIdx === weekIdx
                        ? 'text-[var(--color-indigo)] font-bold bg-[var(--color-indigo)]/5 pl-1.5'
                        : 'text-[var(--color-stone)] pl-1'
                    }`}
                  >
                    {weekLabel}
                  </span>

                  <div className="grid grid-cols-7 gap-1.5">
                    {weekData.map((val, dayIdx) => {
                      const dayName = dayNames[dayIdx];
                      const isHovered = activeCell && activeCell.weekIdx === weekIdx && activeCell.dayIdx === dayIdx;
                      const isSelected = selectedCell && selectedCell.weekIdx === weekIdx && selectedCell.dayIdx === dayIdx;
                      const isActive = isHovered || isSelected;

                      return (
                        <motion.div
                          key={dayIdx}
                          whileHover={{ scale: 1.04, translateY: -2 }}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCell(null);
                            } else {
                              setSelectedCell({ weekIdx, dayIdx, val });
                            }
                          }}
                          onMouseEnter={() => setActiveCell({ weekIdx, dayIdx, val })}
                          onMouseLeave={() => setActiveCell(null)}
                          className={`h-[72px] flex flex-col justify-between items-center py-2 rounded-lg cursor-pointer border select-none transition-all duration-200 ${
                            isActive
                              ? 'border-[var(--color-indigo)] ring-2 ring-[var(--color-indigo)] ring-offset-1 bg-white shadow-md z-10'
                              : 'border-[var(--color-hairline)] bg-[var(--color-paper)]/60 hover:bg-white/90 hover:border-[var(--color-stone-soft)] shadow-sm'
                          } ${isSelected ? 'animate-pulse' : ''}`}
                        >
                          <span className="text-[8px] font-mono text-[var(--color-stone-soft)] leading-none">
                            {dayName}
                          </span>

                          <div className="w-1.5 h-6 bg-[var(--color-cream-2)]/60 rounded-full overflow-hidden relative">
                            <div
                              className={`absolute bottom-0 left-0 w-full rounded-full transition-all duration-300 heat-giver-${val}`}
                              style={{ height: `${Math.max(val * 25, 8)}%` }}
                            />
                          </div>

                          <span className="text-[9px] font-mono font-bold text-[var(--color-indigo)] leading-none">
                            {val}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Telemetry Panel */}
        <div className="card-base p-3.5 mt-4 border border-[var(--color-hairline)] bg-[var(--color-paper)]/50 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={`${active.weekIdx}-${active.dayIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 heat-giver-${active.val} ${active.val === 4 ? 'animate-pulse ring-2 ring-[var(--color-indigo)]/30' : ''}`} />
                  <div>
                    <span className="text-xs font-semibold text-[var(--color-indigo)]">
                      Week {active.weekIdx + 1}, {fullDayNames[active.dayIdx]}
                    </span>
                    <p className="text-[10px] text-[var(--color-stone)]">
                      {active.val === 0 && "Quiet day: no community deposits recorded yet."}
                      {active.val === 1 && "Low momentum: a few community givers contributed."}
                      {active.val === 2 && "Moderate activity: steady pool contributions flowing."}
                      {active.val === 3 && "High momentum: strong community support detected."}
                      {active.val === 4 && "Surge activity: exceptional community giving volume!"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--color-stone)] block">Daily Deposits</span>
                    <span className="text-xs font-bold text-[var(--color-indigo)] font-mono">{active.val} contributions</span>
                  </div>
                  {selectedCell && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCell(null);
                      }}
                      className="text-[10px] text-[var(--color-stone)] hover:text-[var(--color-coral)] font-mono px-2 py-1 rounded bg-[var(--color-cream-2)] border border-[var(--color-hairline)] hover:border-[var(--color-stone-soft)] transition-colors cursor-pointer"
                    >
                      clear ×
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="text-[var(--color-stone)] text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 py-1 w-full text-center">
                <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-[var(--color-stone-soft)]" />
                <span>Hover or tap a pillar to inspect donation history</span>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ── Give form ── */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <h2 className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)] mb-3">Give to the pool</h2>

        {isActiveRecipient && (
          <div className="card-base p-4 mb-3 border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5">
            <p className="text-[13px] text-[var(--color-clay)] font-medium">You're currently receiving support</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-stone)]">Giving is paused while you have an active recipient status. You can give again once your support period ends.</p>
          </div>
        )}

        <div className="card-base p-5">
          <div className="label-cap mb-2">Amount</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[36px] font-medium text-[var(--color-stone-soft)]">₦</span>
            <input
              inputMode="numeric"
              value={amountNaira}
              onChange={(e) => setAmountNaira(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              disabled={isActiveRecipient}
              className="flex-1 bg-transparent text-[36px] font-medium tracking-tight outline-none placeholder:text-[var(--color-stone-soft)] text-[var(--color-indigo)] disabled:opacity-40"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--color-stone)]">No preset amounts. Whatever you choose is enough.</p>
        </div>

        {/* Frequency */}
        <div className="mt-2 card-base p-1 flex">
          {(['once', 'weekly', 'monthly'] as Frequency[]).map((freq) => (
            <motion.button
              key={freq}
              type="button"
              onClick={() => setFrequency(freq)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex-1 py-2.5 rounded-[10px] text-xs font-medium capitalize relative transition-colors duration-150',
                frequency === freq ? 'text-[var(--color-paper)]' : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
              )}
            >
              {frequency === freq && (
                <motion.div
                  layoutId="freq-bg"
                  className="absolute inset-0 bg-[var(--color-clay)] rounded-[10px]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{freq}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition.fast}
            className="text-[12px] text-[var(--color-coral)] px-1"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* CTA */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <motion.button
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={onContinue}
          disabled={submitting || isActiveRecipient}
          className="btn-primary w-full h-[52px] text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Opening Paystack…' : 'Continue to Paystack'}
        </motion.button>
      </motion.div>

      {/* Notes CTA */}
      <motion.div
        variants={fadeUp}
        transition={transition.slow}
        className="card-base p-4 flex items-center justify-between"
      >
        <div>
          <div className="label-cap text-[var(--color-clay)]">Leave a note</div>
          <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">Anonymous encouragement for recipients.</p>
        </div>
        <Link
          to="/notes"
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-xs font-semibold bg-[var(--color-clay)] text-white hover:opacity-90 transition-opacity"
        >
          Write one
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5h7M6.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </motion.div>
    </motion.div>
  )
}

function PoolStat({ value, label, tone }: { value: string; label: string; tone?: 'moss' }) {
  return (
    <motion.div variants={fadeUp}>
      <div
        className="text-[22px] font-medium tracking-tight leading-none"
        style={{ color: tone === 'moss' ? 'var(--color-moss)' : 'var(--color-indigo)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-[var(--color-stone)] uppercase tracking-wider">{label}</div>
    </motion.div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
