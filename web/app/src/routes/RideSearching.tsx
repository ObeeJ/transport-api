import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api, type LadderStatus } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

const TIER_LABELS: Record<number, { label: string; sub: string; color: string }> = {
  1: { label: 'Searching nearby', sub: 'Looking for a peer driver within 10 km', color: 'var(--color-indigo)' },
  2: { label: 'Expanding search', sub: 'Reaching out to partner drivers', color: 'var(--color-clay)' },
  3: { label: 'Emergency grant', sub: 'Admin has been notified — a solution is being arranged', color: 'var(--color-coral)' },
}

export function RideSearching() {
  const { rideId } = useParams()
  const navigate = useNavigate()
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 600)
    return () => clearInterval(t)
  }, [])

  const status = useQuery<LadderStatus>({
    queryKey: ['rides', rideId, 'status'],
    queryFn: () => api.rides.status(rideId!),
    enabled: !!rideId,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'matched' || s === 'failed' ? false : 4000
    },
  })

  const s = status.data

  useEffect(() => {
    if (s?.status === 'matched') {
      setTimeout(() => navigate(`/trip/${rideId}`), 1200)
    }
  }, [s?.status, rideId, navigate])

  const tier = s?.tier ?? 1
  const info = TIER_LABELS[tier] ?? TIER_LABELS[1]

  return (
    <motion.div
      variants={stagger(0.08, 0.04)}
      initial="hidden"
      animate="show"
      className="min-h-[60dvh] flex flex-col items-center justify-center text-center px-6 space-y-6"
    >
      {/* Pulse ring */}
      <motion.div variants={fadeUp} transition={transition.default} className="relative">
        <div className="size-20 rounded-full border-2 border-[var(--color-indigo)]/20 flex items-center justify-center">
          <div
            className="size-12 rounded-full animate-ping absolute"
            style={{ background: `${info.color}18` }}
          />
          <div className="size-12 rounded-full relative" style={{ background: `${info.color}20` }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-4 rounded-full" style={{ background: info.color }} />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default}>
        <div className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)]">
          {s?.status === 'matched' ? 'Driver found!' : info.label + '.'.repeat(dots)}
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-stone)] max-w-xs mx-auto leading-relaxed">
          {s?.status === 'matched' ? 'Taking you to your trip…' : info.sub}
        </p>
      </motion.div>

      {/* Tier ladder */}
      <motion.div variants={fadeUp} transition={transition.default} className="w-full max-w-xs">
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((t) => (
            <div key={t} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full h-1.5 rounded-full transition-all duration-500"
                style={{ background: tier >= t ? info.color : 'var(--color-hairline)' }}
              />
              <span className="text-[9px] font-mono text-[var(--color-stone)] uppercase tracking-wider">
                {t === 1 ? 'Peer' : t === 2 ? 'Partner' : 'Grant'}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {s?.status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-base p-4 w-full max-w-xs text-center"
          >
            <p className="text-[13px] font-medium text-[var(--color-coral)]">No driver found</p>
            <p className="mt-1 text-[11px] text-[var(--color-stone)]">
              We couldn't find a driver this time. Your payment has not been charged.
            </p>
            <button
              onClick={() => navigate('/ride')}
              className="mt-3 btn-primary w-full h-9 text-sm"
            >
              Back to ride
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
