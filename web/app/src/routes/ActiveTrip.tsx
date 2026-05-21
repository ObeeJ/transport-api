import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

type TripDetail = {
  trip: {
    id: string
    driverId: string
    destination: string
    departureAt: string
    totalSeats: number
    status: string
    vehiclePlate?: string
    startedAt?: string
  }
  hubName: string
  bookedCount: number
  seatsLeft: number
  driverName?: string
  isDriver: boolean
  myBooking?: { id: string; status: string }
  riders?: { bookingId: string; commuterFirst: string }[]
}

export function ActiveTrip() {
  const { tripId } = useParams()
  const q = useQuery<TripDetail>({
    queryKey: ['trip', tripId],
    queryFn: () => api.get(`/trips/${tripId}`),
    refetchInterval: 5000,
    enabled: !!tripId,
    initialData: () => (tripId ? readCachedTrip(tripId) : undefined),
  })

  useEffect(() => {
    if (tripId && q.data) {
      cacheTrip(tripId, q.data)
    }
  }, [q.data, tripId])

  if (q.isLoading) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Loading…</p>
  }
  if (!q.data) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Trip not found.</p>
  }

  const { trip, hubName, bookedCount, driverName } = q.data
  const arriving = trip.startedAt
    ? new Date(new Date(trip.startedAt).getTime() + 15 * 60 * 1000)
    : new Date(trip.departureAt)

  return (
    <motion.div
      variants={stagger(0.08, 0.02)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        <div
          className="relative h-[280px]"
          style={{
            background:
              'radial-gradient(circle at 30% 70%, rgba(217,119,87,0.12) 0, transparent 35%), radial-gradient(circle at 75% 30%, rgba(94,114,89,0.10) 0, transparent 30%), linear-gradient(180deg, #EBE2D2 0%, #E0D6C2 100%)',
          }}
        >
          <svg viewBox="0 0 360 280" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <path d="M-20 220 Q 100 200, 180 160 T 380 60" stroke="rgba(27,42,78,0.18)" strokeWidth="22" fill="none" strokeLinecap="round" />
            <path d="M-20 220 Q 100 200, 180 160 T 380 60" stroke="#F5EFE6" strokeWidth="18" fill="none" strokeLinecap="round" />
            <path d="M40 220 Q 130 200, 180 160 T 320 80" stroke="#D97757" strokeWidth="3" strokeDasharray="2 6" fill="none" strokeLinecap="round" />
            <path d="M40 220 Q 110 205, 150 185" stroke="#1B2A4E" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="40" cy="220" r="9" fill="#F5EFE6" stroke="#1B2A4E" strokeWidth="2" />
            <circle cx="150" cy="185" r="13" fill="#1B2A4E" />
            <circle cx="150" cy="185" r="20" fill="none" stroke="#1B2A4E" strokeOpacity="0.25" strokeWidth="1.5" />
            <circle cx="320" cy="80" r="11" fill="#D97757" />
          </svg>

          <div className="absolute top-4 left-4 right-4 card-base p-3 flex items-center justify-between bg-[var(--color-paper)]/85 backdrop-blur">
            <div>
              <div className="font-mono text-[10px] text-[var(--color-stone)]">
                {trip.status === 'in_transit' ? 'ARRIVING' : 'DEPARTS'}
              </div>
              <div className="text-xl font-medium tracking-tight text-[var(--color-indigo)]">
                {arriving.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] text-[var(--color-stone)]">DRIVER</div>
              <div className="text-sm font-medium">
                {driverName} {trip.vehiclePlate ? <span className="text-[var(--color-stone)] font-mono">· {trip.vehiclePlate}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[22px] leading-none font-medium tracking-tight text-[var(--color-indigo)]">
                {labelFor(trip.status)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-stone)]">
                {hubName} → {trip.destination}
              </div>
            </div>
            <StatusPill status={trip.status} />
          </div>

          <div className="my-3 h-px bg-[var(--color-hairline)]" />

          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[var(--color-stone)]">
              {bookedCount} of {trip.totalSeats} commuters on board
            </span>
          </div>

          <SOSButton tripId={trip.id} />
        </div>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default}>
        <Link
          to={q.data.isDriver ? '/drive' : '/ride'}
          className="mt-4 block text-center text-[12px] text-[var(--color-stone)] underline underline-offset-[3px]"
        >
          Back
        </Link>
      </motion.div>
    </motion.div>
  )
}

function labelFor(status: string): string {
  switch (status) {
    case 'in_transit':
      return 'In transit'
    case 'published':
      return 'Boarding soon'
    case 'boarding':
      return 'Boarding'
    case 'completed':
      return 'Trip complete'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    in_transit: { bg: 'rgba(94,114,89,0.15)', fg: 'var(--color-moss)' },
    published: { bg: 'rgba(217,119,87,0.15)', fg: 'var(--color-clay)' },
    boarding: { bg: 'rgba(217,119,87,0.15)', fg: 'var(--color-clay)' },
    completed: { bg: 'rgba(27,42,78,0.10)', fg: 'var(--color-indigo)' },
    cancelled: { bg: 'rgba(200,75,58,0.15)', fg: 'var(--color-coral)' },
  }
  const c = colors[status] ?? { bg: 'rgba(0,0,0,0.05)', fg: 'var(--color-stone)' }
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full"
      style={{ background: c.bg, color: c.fg }}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

// Hold-to-trigger SOS button. Holds for ~2s; releases or moves cancels.
function SOSButton({ tripId }: { tripId: string }) {
  const [progress, setProgress] = useState(0)
  const [fired, setFired] = useState(false)
  const [queued, setQueued] = useState(false)
  const timer = useRef<number | null>(null)
  const HOLD_MS = 2000

  useEffect(() => {
    flushQueuedSOS()
    function onOnline() {
      flushQueuedSOS()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  function start() {
    if (fired) return
    const startedAt = Date.now()
    timer.current = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - startedAt) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        stop()
        fire()
      }
    }, 50)
  }
  function stop() {
    if (timer.current) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    if (!fired) setProgress(0)
  }
  function fire() {
    setFired(true)
    setProgress(1)
    api.post(`/trips/${tripId}/sos`, { note: 'SOS triggered from trip view' }).catch(() => {
      queueSOS(tripId)
      setQueued(true)
    })
  }

  useEffect(() => () => stop(), [])

  return (
    <div className="mt-4">
      <button
        onMouseDown={start}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchEnd={stop}
        disabled={fired}
        className="relative w-full min-h-[72px] rounded-[22px] font-semibold text-lg text-white overflow-hidden select-none"
        style={{
          background: fired
            ? 'linear-gradient(180deg, #5E7259 0%, #4A5A47 100%)'
            : 'linear-gradient(180deg, #D45A48 0%, #B83D2D 100%)',
          boxShadow:
            '0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 24px -10px rgba(200,75,58,0.55), 0 0 0 1px rgba(200,75,58,0.4)',
        }}
      >
        <span
          className="absolute inset-y-0 left-0 bg-white/15"
          style={{ width: `${progress * 100}%`, transition: 'width 50ms linear' }}
        />
        <span className="relative">
          {fired ? (queued ? 'SOS queued offline' : 'Help has been notified') : 'Hold for help'}
        </span>
      </button>
      <p className="text-[10px] mt-2 text-center text-[var(--color-stone)]">
        {fired && queued
          ? 'No network right now. This alert is saved and will send automatically when connection returns.'
          : fired
            ? 'A steward has been told. Stay on the trip view.'
            : 'Hold 2 seconds. The alert is saved locally if your data drops.'}
      </p>
    </div>
  )
}

function tripCacheKey(tripId: string) {
  return `akin:trip:${tripId}`
}

function readCachedTrip(tripId: string): TripDetail | undefined {
  try {
    const raw = localStorage.getItem(tripCacheKey(tripId))
    return raw ? (JSON.parse(raw) as TripDetail) : undefined
  } catch {
    return undefined
  }
}

function cacheTrip(tripId: string, trip: TripDetail) {
  try {
    localStorage.setItem(tripCacheKey(tripId), JSON.stringify(trip))
  } catch {
    // Storage can fail in private mode; the live network path still works.
  }
}

type QueuedSOS = { tripId: string; note: string; createdAt: string }

function readSOSQueue(): QueuedSOS[] {
  try {
    const raw = localStorage.getItem('akin:sos-queue')
    return raw ? (JSON.parse(raw) as QueuedSOS[]) : []
  } catch {
    return []
  }
}

function writeSOSQueue(items: QueuedSOS[]) {
  try {
    localStorage.setItem('akin:sos-queue', JSON.stringify(items))
  } catch {
    // Nothing useful to do here; the user still sees that network failed.
  }
}

function queueSOS(tripId: string) {
  const items = readSOSQueue()
  if (items.some((item) => item.tripId === tripId)) return
  writeSOSQueue([
    ...items,
    { tripId, note: 'SOS triggered from trip view while offline', createdAt: new Date().toISOString() },
  ])
}

async function flushQueuedSOS() {
  if (!navigator.onLine) return
  const items = readSOSQueue()
  if (items.length === 0) return

  const remaining: QueuedSOS[] = []
  for (const item of items) {
    try {
      await api.post(`/trips/${item.tripId}/sos`, { note: item.note, createdAt: item.createdAt })
    } catch {
      remaining.push(item)
    }
  }
  writeSOSQueue(remaining)
}
