import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fadeUp, stagger, ease, transition } from '@/lib/motion'

type Hub = { id: string; name: string }
type TripCard = {
  id: string
  driverId: string
  originHubId: string
  destination: string
  departureAt: string
  totalSeats: number
  status: string
  vehiclePlate?: string
  hubName: string
  bookedCount: number
  seatsLeft: number
  driverName?: string
}

type Booking = {
  id: string
  tripId: string
  status: 'booked' | 'cancelled' | 'boarded' | 'no_show' | 'completed'
  createdAt: string
  trip?: {
    id: string
    destination: string
    departureAt: string
    totalSeats: number
    status: string
    vehiclePlate?: string
    startedAt?: string
  }
  hubName?: string
  driverName?: string
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
}

function minutesFromNow(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000
  if (diff < -1) return 'departed'
  if (diff < 1) return 'now'
  if (diff < 60) return `in ${Math.round(diff)} min`
  return `in ${Math.round(diff / 60)} h`
}

export function RiderHome() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [hubFilter, setHubFilter] = useState<string>('')

  const hubs = useQuery<{ items: Hub[] }>({
    queryKey: ['hubs'],
    queryFn: () => api.get('/hubs'),
    staleTime: 10 * 60 * 1000,
  })
  const trips = useQuery<{ items: TripCard[] }>({
    queryKey: ['trips', hubFilter],
    queryFn: () => api.get(`/trips${hubFilter ? `?hubId=${hubFilter}` : ''}`),
    refetchInterval: 5000,
  })
  const myBookings = useQuery<{ items: Booking[] }>({
    queryKey: ['ride', 'bookings'],
    queryFn: () => api.get('/ride/bookings'),
    refetchInterval: 5000,
  })

  const activeBookingByTrip = useMemo(() => {
    const m: Record<string, Booking> = {}
    myBookings.data?.items.forEach((b) => {
      if (b.status === 'booked') m[b.tripId] = b
    })
    return m
  }, [myBookings.data])

  // The single "active" trip a rider should see at the top of the page:
  // a `booked` booking whose underlying trip is published / boarding / in_transit.
  // Prefer in_transit (most urgent) over not-yet-started.
  const activeBooking = useMemo(() => {
    const candidates = (myBookings.data?.items ?? []).filter(
      (b) =>
        b.status === 'booked' &&
        b.trip &&
        ['published', 'boarding', 'in_transit'].includes(b.trip.status),
    )
    if (candidates.length === 0) return null
    const inTransit = candidates.find((b) => b.trip?.status === 'in_transit')
    return inTransit ?? candidates[0]
  }, [myBookings.data])

  const book = useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/bookings`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['ride', 'bookings'] })
    },
  })
  const cancelBooking = useMutation({
    mutationFn: (tripId: string) => api.delete(`/trips/${tripId}/bookings/me`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['ride', 'bookings'] })
    },
  })

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.p variants={fadeUp} transition={transition.fast} className="text-[13px] text-[var(--color-stone)]">
        Good morning{user?.email ? `, ${user.email.split('@')[0]}` : ''}.
      </motion.p>

      <AnimatePresence>
        {activeBooking ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition.default}
          >
            <ActiveTripTile booking={activeBooking} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div variants={fadeUp} transition={transition.default} className="mt-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-medium tracking-tight text-[var(--color-indigo)]">Find a ride</h2>
        <span className="font-mono text-[10px] text-[var(--color-stone)]">
          {trips.data?.items.length ?? 0} upcoming
        </span>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="mt-3 flex gap-2 overflow-x-auto">
        <Chip active={hubFilter === ''} onClick={() => setHubFilter('')}>
          All hubs
        </Chip>
        {hubs.data?.items.map((h) => (
          <Chip key={h.id} active={hubFilter === h.id} onClick={() => setHubFilter(h.id)}>
            {h.name}
          </Chip>
        ))}
      </motion.div>

      {trips.isLoading ? (
        <motion.p variants={fadeUp} transition={transition.default} className="mt-6 text-sm text-[var(--color-stone)]">Loading trips…</motion.p>
      ) : trips.data && trips.data.items.length === 0 ? (
        <motion.div variants={fadeUp} transition={transition.default} className="mt-6 card-base p-5 text-center">
          <p className="text-sm text-[var(--color-stone)]">
            No upcoming trips right now. Check back soon — or ask in class for someone to publish one.
          </p>
        </motion.div>
      ) : (
        <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show">
          {trips.data?.items.map((t) => {
            const myBooking = activeBookingByTrip[t.id]
            const isMine = t.driverId === user?.id
            return (
              <motion.article
                key={t.id}
                variants={fadeUp}
                transition={transition.default}
                className="card-base mt-3 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="size-7 rounded-full bg-[var(--color-cream-2)] inline-flex items-center justify-center text-[13px] font-medium text-[var(--color-indigo)]">
                      {(t.driverName ?? '?').charAt(0)}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{t.driverName ?? 'Driver'}</div>
                      <div className="text-[11px] text-[var(--color-stone)] font-mono uppercase">
                        {t.vehiclePlate || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-medium tracking-tight text-[var(--color-indigo)]">{timeOnly(t.departureAt)}</div>
                    <div className="text-[10px] text-[var(--color-stone)]">{minutesFromNow(t.departureAt)}</div>
                  </div>
                </div>
                <div className="my-3 h-px bg-[var(--color-hairline)]" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-stone)]">
                    {t.hubName} <span className="text-[var(--color-clay)]">→</span> {t.destination}
                  </span>
                  <span className={`font-mono ${t.seatsLeft === 0 ? 'text-[var(--color-stone)]' : 'text-[var(--color-moss)]'}`}>
                    {t.seatsLeft} / {t.totalSeats} seats
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  {isMine ? (
                    <div className="flex-1 h-10 rounded-[12px] flex items-center justify-center text-xs text-[var(--color-stone)] border border-[var(--color-hairline)]">
                      Your trip
                    </div>
                  ) : myBooking ? (
                    <>
                      <Link
                        to={`/trip/${t.id}`}
                        className="flex-1 h-10 rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-xs flex items-center justify-center"
                      >
                        View trip
                      </Link>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => cancelBooking.mutate(t.id)}
                        disabled={cancelBooking.isPending}
                        className="flex-1 h-10 rounded-[12px] border border-[var(--color-coral)]/30 text-[var(--color-coral)] text-xs"
                      >
                        {cancelBooking.isPending ? '…' : 'Cancel seat'}
                      </motion.button>
                    </>
                  ) : t.seatsLeft <= 0 ? (
                    <div className="flex-1 h-10 rounded-[12px] flex items-center justify-center text-xs text-[var(--color-stone)] border border-[var(--color-hairline)]">
                      Full
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => book.mutate(t.id)}
                      disabled={book.isPending}
                      className="flex-1 h-10 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
                    >
                      {book.isPending ? '…' : 'Book a seat'}
                    </motion.button>
                  )}
                </div>
                <AnimatePresence>
                  {book.error && book.variables === t.id ? (
                    <motion.p
                      key="err"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={transition.fast}
                      className="mt-2 text-[11px] text-[var(--color-coral)]"
                      role="alert"
                    >
                      {book.error instanceof ApiError ? book.error.message : 'Could not book.'}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            )
          })}
        </motion.div>
      )}

      <PastRides bookings={myBookings.data?.items ?? []} />
    </motion.div>
  )
}

function PastRides({ bookings }: { bookings: Booking[] }) {
  // "Past" = the booking or its trip has reached a terminal state.
  // Sorted newest first by the trip's departure (falls back to booking time).
  const past = bookings
    .filter((b) => {
      if (b.status === 'cancelled' || b.status === 'completed' || b.status === 'no_show') return true
      if (b.trip && (b.trip.status === 'completed' || b.trip.status === 'cancelled')) return true
      return false
    })
    .sort((a, b) => {
      const ta = a.trip?.departureAt ?? a.createdAt
      const tb = b.trip?.departureAt ?? b.createdAt
      return new Date(tb).getTime() - new Date(ta).getTime()
    })

  if (past.length === 0) return null

  return (
    <section className="mt-8">
      <div className="label-cap mb-2">Past rides</div>
      <div className="card-base divide-y divide-[var(--color-hairline)]">
        {past.slice(0, 12).map((b) => {
          const t = b.trip
          // Outcome label is driven by the most truthful signal we have:
          // a cancelled booking trumps a completed trip ("the rider cancelled, regardless of what happened to the trip").
          const outcome =
            b.status === 'cancelled'
              ? { label: 'cancelled', tone: 'coral' as const }
              : b.status === 'no_show'
                ? { label: 'no-show', tone: 'coral' as const }
                : t?.status === 'cancelled'
                  ? { label: 'driver cancelled', tone: 'coral' as const }
                  : { label: 'completed', tone: 'moss' as const }
          return (
            <div key={b.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0 pr-3">
                <div className="text-[var(--color-ink)] truncate">
                  {b.hubName ?? '—'} <span className="text-[var(--color-clay)]">→</span> {t?.destination ?? '—'}
                </div>
                <div className="text-[10px] text-[var(--color-stone)] mt-0.5">
                  {b.driverName ? `${b.driverName} · ` : ''}
                  {t?.departureAt
                    ? new Date(t.departureAt).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : new Date(b.createdAt).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                      })}
                </div>
              </div>
              <span
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
                style={{
                  background:
                    outcome.tone === 'moss'
                      ? 'rgba(94,114,89,0.15)'
                      : 'rgba(200,75,58,0.15)',
                  color:
                    outcome.tone === 'moss' ? 'var(--color-moss)' : 'var(--color-coral)',
                }}
              >
                {outcome.label}
              </span>
            </div>
          )
        })}
      </div>
      {past.length > 12 ? (
        <p className="mt-2 text-[10px] text-[var(--color-stone)] text-center">
          Showing the most recent 12.
        </p>
      ) : null}
    </section>
  )
}

function ActiveTripTile({ booking }: { booking: Booking }) {
  if (!booking.trip) return null
  const t = booking.trip
  const isLive = t.status === 'in_transit'
  return (
    <section
      className="mt-4 card-base p-5"
      style={{
        background: isLive
          ? 'linear-gradient(180deg, var(--color-paper) 0%, #EEF3EC 100%)'
          : 'linear-gradient(180deg, var(--color-paper) 0%, #FBF1E7 100%)',
        borderColor: isLive ? 'var(--color-moss-soft)' : 'var(--color-clay-soft)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <span className="size-2 rounded-full bg-[var(--color-moss)]" />
              <span className="label-cap text-[var(--color-moss)]">In transit · your trip</span>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-[var(--color-clay)]" />
              <span className="label-cap text-[var(--color-clay)]">Booked · {t.status}</span>
            </>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--color-stone)]">
          {timeOnly(t.departureAt)}
        </span>
      </div>
      <div className="mt-2 text-[18px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]">
        {booking.hubName ?? '—'} <span className="text-[var(--color-clay)]">→</span> {t.destination}
      </div>
      <div className="mt-1 text-[12px] text-[var(--color-stone)]">
        Driver: {booking.driverName ?? '—'}
        {t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''}
      </div>
      <Link
        to={`/trip/${t.id}`}
        className="btn-primary mt-4 h-11 w-full text-sm"
      >
        {isLive ? 'Open trip view' : 'View details'}
      </Link>
    </section>
  )
}

function Chip({
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
      whileTap={{ scale: 0.94 }}
      transition={transition.fast}
      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase shrink-0 transition-colors duration-150 ${
        active
          ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
          : 'bg-[var(--color-cream-2)] text-[var(--color-ink)]'
      }`}
    >
      {children}
    </motion.button>
  )
}
