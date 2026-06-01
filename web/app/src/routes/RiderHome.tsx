import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { useToast } from '@/lib/toast'

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

// Peak travel slots derived from real /trips/demand data
const heatMapHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

type DemandRow = {
  hubId: string
  hubName: string
  hourSlot: number
  totalSeats: number
  bookedSeats: number
  tripCount: number
  fillRate: number
}

// fillRate 0-1 mapped to heat level 0-4
function fillToHeat(fillRate: number, tripCount: number): number {
  if (tripCount === 0) return 0
  if (fillRate >= 0.85) return 4
  if (fillRate >= 0.65) return 3
  if (fillRate >= 0.4) return 2
  if (fillRate > 0) return 1
  return 0
}

export function RiderHome() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [hubFilter, setHubFilter] = useState<string>('')
  const [activeCell, setActiveCell] = useState<{ hub: string; hour: number; val: number; row: DemandRow | null } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ hub: string; hour: number; val: number; row: DemandRow | null } | null>(null)
  const active = activeCell || selectedCell

  const demand = useQuery<{ items: DemandRow[] }>({
    queryKey: ['trips', 'demand'],
    queryFn: () => api.get('/trips/demand'),
    refetchInterval: (query) => {
      const hasData = (query.state.data as { items: DemandRow[] } | undefined)?.items?.length ?? 0
      return hasData > 0 ? 30_000 : 5 * 60_000
    },
  })

  // Build a lookup: hubName -> hourSlot -> DemandRow
  const demandMap = useMemo(() => {
    const m: Record<string, Record<number, DemandRow>> = {}
    demand.data?.items.forEach(row => {
      if (!m[row.hubName]) m[row.hubName] = {}
      m[row.hubName][row.hourSlot] = row
    })
    return m
  }, [demand.data])

  const hubs = useQuery<{ items: Hub[] }>({
    queryKey: ['hubs'],
    queryFn: () => api.get('/hubs'),
    staleTime: 10 * 60 * 1000,
  })

  // Derive hub names strictly from real demand data only — no fallback to hub list
  // so the grid never renders with hubs but no trip data
  const demandHubs = useMemo(() => {
    return [...new Set(demand.data?.items.map(r => r.hubName) ?? [])]
  }, [demand.data])
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

  const toast = useToast()

  const book = useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/bookings`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['ride', 'bookings'] })
      toast.show('Seat reserved! Check your inbox for trip details.', 'success')
    },
  })
  const cancelBooking = useMutation({
    mutationFn: (tripId: string) => api.delete(`/trips/${tripId}/bookings/me`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['ride', 'bookings'] })
      toast.show('Booking cancelled. Your seat has been released.', 'info')
    },
  })

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4 space-y-6"
    >
      <motion.p variants={fadeUp} transition={transition.fast} className="text-[13px] text-[var(--color-stone)] bg-white/40 px-4 py-2.5 rounded-xl border border-[var(--color-hairline)]">
        Good morning{user?.email ? `, ${user.email.split('@')[0]}` : ''}. You are in <span className="text-[var(--color-moss)] font-semibold uppercase text-xs tracking-wider">Commuter Rail</span>
      </motion.p>

      {/* Active Trip Tile */}
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

      <motion.section variants={fadeUp} className="card-base p-5 border border-[var(--color-hairline)] glow-moss">
        <div className="flex items-center justify-between">
          <div>
            <span className="label-cap text-[var(--color-moss)] font-bold">Commuter Peak Hours & Demand</span>
            <p className="text-[11px] text-[var(--color-stone)]">Live hub boarding demand — next 24 hours</p>
          </div>
          <span className="text-[10px] bg-[var(--color-moss)]/10 text-[var(--color-moss)] px-2 py-0.5 rounded font-mono font-bold tracking-wider">
            {demand.isFetching ? 'Syncing…' : 'Live'}
          </span>
        </div>

        {!demand.data ? (
          demand.isLoading ? (
            <div className="mt-5 grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[64px] rounded-lg bg-[var(--color-cream-2)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-5 py-6 text-center">
              <p className="text-[13px] font-medium text-[var(--color-indigo)]">No trips scheduled yet</p>
              <p className="mt-1 text-[11px] text-[var(--color-stone)]">
                This map fills up when drivers publish trips. Check back closer to peak hours.
              </p>
            </div>
          )
        ) : demandHubs.length === 0 ? (
          <div className="mt-5 py-6 text-center">
            <p className="text-[13px] font-medium text-[var(--color-indigo)]">No trips in the next 24 hours</p>
            <p className="mt-1 text-[11px] text-[var(--color-stone)]">Check back closer to peak hours or ask a driver to publish a ride.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {/* Header Row */}
            <div className="grid grid-cols-[72px_1fr] gap-2 items-center">
              <span className="text-[9px] font-mono text-[var(--color-stone)] font-bold uppercase tracking-wider">Hub</span>
              <div className="grid grid-cols-12 gap-1">
                {heatMapHours.map(hr => (
                  <div
                    key={hr}
                    className={`text-center text-[9px] font-mono font-semibold transition-colors duration-150 py-0.5 rounded ${
                      active?.hour === hr ? 'text-[var(--color-moss)] bg-[var(--color-moss)]/5' : 'text-[var(--color-stone)]'
                    }`}
                  >
                    {hr}h
                  </div>
                ))}
              </div>
            </div>

            {/* Hub Rows */}
            <div className="space-y-1.5">
              {demandHubs.map(hubName => (
                <div key={hubName} className="grid grid-cols-[72px_1fr] gap-2 items-center">
                  <span className={`text-[10px] font-medium transition-all duration-150 py-1 rounded truncate text-left ${
                    active?.hub === hubName
                      ? 'text-[var(--color-moss)] font-bold bg-[var(--color-moss)]/5 pl-1.5'
                      : 'text-[var(--color-indigo)] pl-1'
                  }`}>
                    {hubName}
                  </span>
                  <div className="grid grid-cols-12 gap-1">
                    {heatMapHours.map(hr => {
                      const row = demandMap[hubName]?.[hr] ?? null
                      const val = fillToHeat(row?.fillRate ?? 0, row?.tripCount ?? 0)
                      const isHovered = activeCell?.hub === hubName && activeCell?.hour === hr
                      const isSelected = selectedCell?.hub === hubName && selectedCell?.hour === hr
                      const isActive = isHovered || isSelected
                      return (
                        <motion.div
                          key={hr}
                          whileHover={{ scale: 1.04, translateY: -2 }}
                          onClick={() => {
                            if (isSelected) setSelectedCell(null)
                            else setSelectedCell({ hub: hubName, hour: hr, val, row })
                          }}
                          onMouseEnter={() => setActiveCell({ hub: hubName, hour: hr, val, row })}
                          onMouseLeave={() => setActiveCell(null)}
                          className={`h-[64px] flex flex-col justify-between items-center py-1.5 rounded-lg cursor-pointer border select-none transition-all duration-200 ${
                            isActive
                              ? 'border-[var(--color-moss)] ring-2 ring-[var(--color-moss)] ring-offset-1 bg-white shadow-md z-10'
                              : 'border-[var(--color-hairline)] bg-[var(--color-paper)]/60 hover:bg-white/90 hover:border-[var(--color-stone-soft)] shadow-sm'
                          } ${isSelected ? 'animate-pulse' : ''}`}
                        >
                          <span className="text-[8px] font-mono text-[var(--color-stone-soft)] leading-none">{hr}h</span>
                          <div className="w-1.5 h-5 bg-[var(--color-cream-2)]/60 rounded-full overflow-hidden relative">
                            <div
                              className={`absolute bottom-0 left-0 w-full rounded-full transition-all duration-300 heat-rider-${val}`}
                              style={{ height: row ? `${Math.max(row.fillRate * 100, 8)}%` : '8%' }}
                            />
                          </div>
                          <span className="text-[8px] font-mono font-bold text-[var(--color-indigo)] leading-none">
                            {row ? row.tripCount : '—'}
                          </span>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Telemetry Panel — only when grid is visible */}
        {demandHubs.length > 0 && (
          <div className="card-base p-3.5 mt-4 border border-[var(--color-hairline)] bg-[var(--color-paper)]/50 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {active ? (
                <motion.div
                  key={`${active.hub}-${active.hour}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 heat-rider-${active.val} ${active.val === 4 ? 'animate-pulse ring-2 ring-[var(--color-moss)]/30' : ''}`} />
                    <div>
                      <span className="text-xs font-semibold text-[var(--color-indigo)]">
                        {active.hub} at {active.hour}:00
                      </span>
                      {active.row ? (
                        <p className="text-[10px] text-[var(--color-stone)]">
                          {active.row.tripCount} trip{active.row.tripCount !== 1 ? 's' : ''} · {active.row.bookedSeats}/{active.row.totalSeats} seats booked · {Math.round(active.row.fillRate * 100)}% full
                        </p>
                      ) : (
                        <p className="text-[10px] text-[var(--color-stone)]">No trips scheduled at this hour.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--color-stone)] block">Seats left</span>
                      <span className="text-xs font-bold text-[var(--color-moss)] font-mono">
                        {active.row ? active.row.totalSeats - active.row.bookedSeats : '—'}
                      </span>
                    </div>
                    {selectedCell && (
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedCell(null) }}
                        className="text-[10px] text-[var(--color-stone)] hover:text-[var(--color-coral)] font-mono px-2 py-1 rounded bg-[var(--color-cream-2)] border border-[var(--color-hairline)] transition-colors cursor-pointer"
                      >
                        clear ×
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="text-[var(--color-stone)] text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 py-1 w-full text-center">
                  <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-[var(--color-stone-soft)]" />
                  <span>Tap or hover an hourly pillar to see live trip data</span>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Legend — only when grid is visible */}
        {demandHubs.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-[9px] text-[var(--color-stone)] font-mono">
            <span>Low demand</span>
            <div className="flex gap-1.5">
              {[0,1,2,3,4].map(v => <span key={v} className={`size-2.5 rounded-[2px] heat-rider-${v} ${v === 0 ? 'border border-[var(--color-hairline)]' : ''}`} />)}
            </div>
            <span>High demand</span>
          </div>
        )}
      </motion.section>

      {/* Find a ride header */}
      <motion.div variants={fadeUp} transition={transition.default} className="flex items-baseline justify-between pt-2">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-indigo)]">Find a ride</h2>
        <span className="font-mono text-xs text-[var(--color-stone)] bg-[var(--color-cream)] px-2 py-0.5 rounded-full">
          {trips.data?.items.length ?? 0} active trips
        </span>
      </motion.div>

      {/* Hub filter chips */}
      <motion.div variants={fadeUp} transition={transition.default} className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={hubFilter === ''} onClick={() => setHubFilter('')}>
          All hubs
        </Chip>
        {hubs.data?.items.map((h) => (
          <Chip key={h.id} active={hubFilter === h.id} onClick={() => setHubFilter(h.id)}>
            {h.name}
          </Chip>
        ))}
      </motion.div>

      {/* Trips list */}
      {trips.isLoading ? (
        <motion.p variants={fadeUp} transition={transition.default} className="text-sm text-[var(--color-stone)] text-center py-6">Loading upcoming routes…</motion.p>
      ) : trips.data && trips.data.items.length === 0 ? (
        <motion.div variants={fadeUp} transition={transition.default} className="card-base p-6 text-center">
          <p className="text-sm text-[var(--color-stone)] leading-relaxed">
            No active trips scheduled at this hub right now.<br />
            Ask in your group channels for drivers to publish a ride.
          </p>
        </motion.div>
      ) : (
        <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="space-y-3">
          {trips.data?.items.map((t) => {
            const myBooking = activeBookingByTrip[t.id]
            const isMine = t.driverId === user?.id
            return (
              <motion.article
                key={t.id}
                variants={fadeUp}
                transition={transition.default}
                whileHover={{ y: -1 }}
                className="card-base overflow-hidden border border-[var(--color-hairline)] flex flex-col"
              >
                {/* Card body */}
                <div className="p-4 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="size-8 rounded-full bg-[var(--color-moss-soft)]/20 inline-flex items-center justify-center text-sm font-semibold text-[var(--color-moss)] shrink-0">
                        {(t.driverName ?? '?').charAt(0)}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-[var(--color-indigo)] leading-tight">{t.driverName ?? 'Driver'}</div>
                        <div className="text-[10px] text-[var(--color-stone)] font-mono uppercase bg-[var(--color-cream)] px-1.5 py-0.5 rounded mt-0.5 inline-block">
                          {t.vehiclePlate || 'No Plate'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold tracking-tight text-[var(--color-indigo)]">{timeOnly(t.departureAt)}</div>
                      <div className="text-[10px] text-[var(--color-clay)] font-semibold uppercase tracking-wider mt-0.5">{minutesFromNow(t.departureAt)}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-indigo)]">
                      {t.hubName} <span className="text-[var(--color-clay)] font-bold">→</span> {t.destination}
                    </span>
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      t.seatsLeft === 0
                        ? 'bg-[var(--color-coral)]/10 text-[var(--color-coral)]'
                        : 'bg-[var(--color-moss)]/10 text-[var(--color-moss)]'
                    }`}>
                      {t.seatsLeft}/{t.totalSeats} seats
                    </span>
                  </div>
                </div>

                {/* Action strip — flush to bottom, full width, separated by top border */}
                <div className="border-t border-[var(--color-hairline)] flex">
                  {isMine ? (
                    <div className="flex-1 h-11 flex items-center justify-center text-xs text-[var(--color-stone)] bg-[var(--color-cream)] font-medium">
                      Your published trip
                    </div>
                  ) : myBooking ? (
                    <>
                      <Link
                        to={`/trip/${t.id}`}
                        className="flex-1 h-11 flex items-center justify-center text-xs font-semibold text-[var(--color-indigo)] hover:bg-[var(--color-cream-2)] transition-colors border-r border-[var(--color-hairline)]"
                      >
                        Open trip
                      </Link>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => cancelBooking.mutate(t.id)}
                        disabled={cancelBooking.isPending}
                        className="flex-1 h-11 flex items-center justify-center text-xs font-semibold text-[var(--color-coral)] hover:bg-[var(--color-coral)]/5 transition-colors cursor-pointer"
                      >
                        {cancelBooking.isPending ? '…' : 'Cancel'}
                      </motion.button>
                    </>
                  ) : t.seatsLeft <= 0 ? (
                    <div className="flex-1 h-11 flex items-center justify-center text-xs text-[var(--color-stone)] bg-[var(--color-cream)] font-medium">
                      Fully booked
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => book.mutate(t.id)}
                      disabled={book.isPending}
                      className="flex-1 h-11 flex items-center justify-center text-xs font-bold text-white bg-[var(--color-indigo)] hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      {book.isPending ? 'Reserving…' : 'Book a seat'}
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
                      className="text-[11px] text-[var(--color-coral)] bg-[var(--color-coral)]/10 px-4 py-2"
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
    <section className="mt-8 space-y-3">
      <div className="label-cap mb-1">Past travel logs</div>
      <div className="card-base divide-y divide-[var(--color-hairline)] border border-[var(--color-hairline)]">
        {past.slice(0, 8).map((b) => {
          const t = b.trip
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
                <div className="text-[var(--color-indigo)] font-semibold truncate text-[13px]">
                  {b.hubName ?? '—'} <span className="text-[var(--color-clay)]">→</span> {t?.destination ?? '—'}
                </div>
                <div className="text-[10px] text-[var(--color-stone)] mt-0.5 font-medium">
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
                className="font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
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
      {past.length > 8 ? (
        <p className="text-[10px] text-[var(--color-stone)] text-center">
          Recent logs displayed.
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
      className="card-base p-5 border border-[var(--color-hairline)] glow-moss"
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
              <span className="size-2 rounded-full bg-[var(--color-moss)] animate-pulse" />
              <span className="label-cap text-[var(--color-moss)] font-bold">Live · In Transit</span>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-[var(--color-clay)] animate-pulse" />
              <span className="label-cap text-[var(--color-clay)] font-bold">Reserved · Boarding soon</span>
            </>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--color-stone)] font-bold">
          {timeOnly(t.departureAt)}
        </span>
      </div>
      <div className="mt-3 text-[19px] leading-tight font-bold tracking-tight text-[var(--color-indigo)]">
        {booking.hubName ?? '—'} <span className="text-[var(--color-clay)]">→</span> {t.destination}
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--color-stone)] font-medium">
        Driver: <span className="text-[var(--color-indigo)] font-semibold">{booking.driverName ?? '—'}</span>
        {t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''}
      </div>
      <Link
        to={`/trip/${t.id}`}
        className="btn-primary mt-4 h-11 w-full text-xs font-semibold"
      >
        {isLive ? 'Track Live Ride' : 'Open Trip Details'}
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
      className={`inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase shrink-0 transition-colors duration-150 cursor-pointer ${
        active
          ? 'bg-[var(--color-indigo)] text-[var(--color-paper)] shadow-sm'
          : 'bg-[var(--color-cream-2)] text-[var(--color-indigo)] hover:bg-[var(--color-cream-2)]/80'
      }`}
    >
      {children}
    </motion.button>
  )
}
