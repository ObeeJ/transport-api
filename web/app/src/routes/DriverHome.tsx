import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useTripSeats } from '@/lib/useSeats'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { useAuth } from '@/lib/auth'

type Hub = { id: string; name: string }
type TripCard = {
  id: string
  driverId: string
  originHubId: string
  destination: string
  departureAt: string
  totalSeats: number
  status: 'published' | 'boarding' | 'in_transit' | 'completed' | 'cancelled'
  vehiclePlate?: string
  hubName: string
  bookedCount: number
  seatsLeft: number
}

function defaultDepartureLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Fallback axes used while /driver/opportunities is loading and when the
// query returns no data yet. The API returns the same shape.
const fallbackHours = ['07:30', '09:00', '11:00', '13:00', '15:00', '17:00']
const fallbackHubs = ['Main Gate', 'Sub Gate', 'Tech Hub', 'Health Science']
const fallbackMatrix: number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
]

export function DriverHome() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [activeCell, setActiveCell] = useState<{ hub: string; hour: string; val: number } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ hub: string; hour: string; val: number } | null>(null)
  const active = activeCell || selectedCell

  const hubs = useQuery<{ items: Hub[] }>({
    queryKey: ['hubs'],
    queryFn: () => api.get('/hubs'),
    staleTime: 10 * 60 * 1000,
  })
  const myTrips = useQuery<{ items: TripCard[] }>({
    queryKey: ['drive', 'trips'],
    queryFn: () => api.get('/drive/trips'),
    refetchInterval: 5000,
  })

  const liveTrip = useMemo(
    () => myTrips.data?.items.find((t) => t.status === 'published' || t.status === 'boarding' || t.status === 'in_transit'),
    [myTrips.data],
  )

  const [showForm, setShowForm] = useState(false)

  const driverProfile = useQuery<{ status: string } | null>({
    queryKey: ['driver', 'me'],
    queryFn: () => api.get<{ status: string }>('/driver/me').catch(() => null),
    staleTime: 5 * 60 * 1000,
  })
  const isApproved = driverProfile.data?.status === 'approved'
  const hasPending = driverProfile.data?.status === 'pending'

  const opportunity = useQuery<{ hubs: string[]; hours: string[]; matrix: number[][] }>({
    queryKey: ['driver', 'opportunities'],
    queryFn: () => api.get('/driver/opportunities'),
    enabled: !!user,
    staleTime: 60 * 1000,
  })
  const opportunityHubs = opportunity.data?.hubs ?? fallbackHubs
  const opportunityHours = opportunity.data?.hours ?? fallbackHours
  const shortageMatrix = opportunity.data?.matrix ?? fallbackMatrix

  return (
    <motion.div
      variants={stagger(0.08, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4 space-y-6"
    >
      {/* Personalized Welcome Banner */}
      <motion.p
        variants={fadeUp}
        transition={transition.fast}
        className="text-[13px] text-[var(--color-stone)] bg-white/40 px-4 py-2.5 rounded-xl border border-[var(--color-hairline)]"
      >
        Good morning{user?.email ? `, ${user.email.split('@')[0]}` : ''}. You are active in <span className="text-[var(--color-clay)] font-semibold uppercase text-xs tracking-wider">Driver Rail</span>
      </motion.p>

      {/* Driver application banners */}
      <AnimatePresence>
        {!driverProfile.isLoading && !isApproved && !hasPending ? (
          <motion.div
            key="apply-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={transition.default}
            className="card-base p-5 glow-clay border-l-4 border-l-[var(--color-clay)]"
          >
            <div className="label-cap text-[var(--color-clay)] font-bold">Driver verification required</div>
            <p className="mt-1.5 text-xs text-[var(--color-stone)] leading-relaxed">
              To guarantee community safety, two active stewards review driver profiles before you can publish empty seats.
            </p>
            <Link to="/drive/apply" className="btn-primary mt-3 h-10 px-5 text-xs inline-flex">
              Apply to drive
            </Link>
          </motion.div>
        ) : hasPending ? (
          <motion.div
            key="pending-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition.default}
            className="card-base p-5 border-l-4 border-l-[var(--color-stone)]"
          >
            <div className="label-cap font-bold text-[var(--color-stone)]">Verification in progress</div>
            <p className="mt-1.5 text-xs text-[var(--color-stone)] leading-relaxed">
              Two stewards are currently verifying your credentials. You will receive an alert as soon as they authorize your profile.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Hub Seat Shortage & Opportunity Pillars */}
      <motion.section
        variants={fadeUp}
        className="card-base p-5 border border-[var(--color-hairline)] glow-clay"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="label-cap text-[var(--color-clay)] font-bold">Seat Shortage Opportunity Map</span>
            <p className="text-[11px] text-[var(--color-stone)]">Locate hubs with high boarding wait queues needing drivers</p>
          </div>
          <span className="text-[10px] bg-[var(--color-clay)]/10 text-[var(--color-clay)] px-2 py-0.5 rounded font-mono font-bold tracking-wider">Live</span>
        </div>

        {/* Activity Pillar Track Layout */}
        <div className="mt-5 space-y-3">
          {/* Header Row */}
          <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
            <span className="text-[9px] font-mono text-[var(--color-stone)] font-bold uppercase tracking-wider">Hub Location</span>
            <div className="grid grid-cols-6 gap-1.5 text-center text-[9px] font-mono text-[var(--color-stone)] font-semibold">
              {opportunityHours.map((hr, idx) => (
                <div
                  key={idx}
                  className={`transition-colors duration-150 py-0.5 rounded ${
                    active?.hour === hr ? 'text-[var(--color-clay)] font-bold bg-[var(--color-clay)]/5 scale-105' : ''
                  }`}
                >
                  {hr}
                </div>
              ))}
            </div>
          </div>

          {/* Hub Rows */}
          <div className="space-y-2">
            {opportunityHubs.map((hubName, hubIdx) => (
              <div key={hubIdx} className="grid grid-cols-[80px_1fr] gap-3 items-center">
                {/* Row Header (Hub Name) */}
                <span
                  className={`text-[10px] font-medium transition-all duration-150 py-1 rounded truncate text-left ${
                    active && active.hub === hubName
                      ? 'text-[var(--color-clay)] font-bold bg-[var(--color-clay)]/5 pl-1.5'
                      : 'text-[var(--color-indigo)] pl-1'
                  }`}
                >
                  {hubName}
                </span>

                {/* Hourly Pillars */}
                <div className="grid grid-cols-6 gap-1.5">
                  {shortageMatrix[hubIdx].map((val, cellIdx) => {
                    const isHovered = activeCell && activeCell.hub === hubName && activeCell.hour === opportunityHours[cellIdx];
                    const isSelected = selectedCell && selectedCell.hub === hubName && selectedCell.hour === opportunityHours[cellIdx];
                    const isActive = isHovered || isSelected;

                    return (
                      <motion.div
                        key={cellIdx}
                        whileHover={{ scale: 1.04, translateY: -2 }}
                        onClick={() => {
                          if (selectedCell && selectedCell.hub === hubName && selectedCell.hour === opportunityHours[cellIdx]) {
                            setSelectedCell(null);
                          } else {
                            setSelectedCell({ hub: hubName, hour: opportunityHours[cellIdx], val });
                          }
                        }}
                        onMouseEnter={() => setActiveCell({ hub: hubName, hour: opportunityHours[cellIdx], val })}
                        onMouseLeave={() => setActiveCell(null)}
                        className={`h-[72px] flex flex-col justify-between items-center py-2 rounded-lg cursor-pointer border select-none transition-all duration-200 ${
                          isActive
                            ? 'border-[var(--color-clay)] ring-2 ring-[var(--color-clay)] ring-offset-1 bg-white shadow-md z-10'
                            : 'border-[var(--color-hairline)] bg-[var(--color-paper)]/60 hover:bg-white/90 hover:border-[var(--color-stone-soft)] shadow-sm'
                        } ${isSelected ? 'animate-pulse' : ''}`}
                      >
                        {/* Tiny hour indicator */}
                        <span className="text-[8px] font-mono text-[var(--color-stone-soft)] leading-none">
                          {opportunityHours[cellIdx]}
                        </span>

                        {/* Vertical Gauge Bar */}
                        <div className="w-1.5 h-6 bg-[var(--color-cream-2)]/60 rounded-full overflow-hidden relative">
                          <div
                            className={`absolute bottom-0 left-0 w-full rounded-full transition-all duration-300 heat-driver-${val}`}
                            style={{ height: `${Math.max(val * 25, 8)}%` }}
                          />
                        </div>

                        {/* Direct count text */}
                        <span className="text-[9px] font-mono font-bold text-[var(--color-indigo)] leading-none">
                          {val === 0 ? 'Met' : `+${val * 3}`}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Telemetry Panel */}
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
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 heat-driver-${active.val} ${active.val === 4 ? 'animate-pulse ring-2 ring-[var(--color-clay)]/30' : ''}`} />
                  <div>
                    <span className="text-xs font-semibold text-[var(--color-indigo)]">
                      {active.hub} at {active.hour}
                    </span>
                    <p className="text-[10px] text-[var(--color-stone)]">
                      {active.val === 0 && "Demand fully met: no passengers stranded, perfect seat availability"}
                      {active.val === 1 && "Light shortage: minor transit delay, average wait time 3 minutes"}
                      {active.val === 2 && "Moderate seat shortage: publication of new trips recommended"}
                      {active.val === 3 && "High demand gap: severe wait queue, publish trip immediately"}
                      {active.val === 4 && "Critical shortage: surging passenger backlog, maximum earnings opportunity"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--color-stone)] block">Commuter Backlog</span>
                    <span className="text-xs font-bold text-[var(--color-clay)] font-mono">{active.val === 0 ? '0 stranded' : `+${active.val * 3} stranded`}</span>
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
                <span>Tap or hover an hourly pillar to inspect departure opportunities</span>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-between text-[9px] text-[var(--color-stone)] font-mono">
          <span>Met demand</span>
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-[2px] heat-driver-0 border border-[var(--color-hairline)]" />
            <span className="size-2.5 rounded-[2px] heat-driver-1" />
            <span className="size-2.5 rounded-[2px] heat-driver-2" />
            <span className="size-2.5 rounded-[2px] heat-driver-3" />
            <span className="size-2.5 rounded-[2px] heat-driver-4" />
          </div>
          <span>Shortage (High queue)</span>
        </div>
      </motion.section>

      {/* Live active trip */}
      <AnimatePresence>
        {liveTrip ? (
          <motion.div
            key="live-trip"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={transition.default}
          >
            <ActiveDriverTrip trip={liveTrip} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!showForm ? (
          <motion.button
            key="publish-btn"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -6 }}
            transition={transition.default}
            whileHover={{ scale: 1.02, translateY: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { if (isApproved) setShowForm(true) }}
            disabled={!isApproved}
            className="w-full h-[52px] rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(217,119,87,0.06)] hover:shadow-[0_6px_16px_rgba(217,119,87,0.12)] transition-all duration-200 cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19" stroke="var(--color-indigo)" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M5 12H19" stroke="var(--color-clay)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span className="font-semibold text-[var(--color-indigo)]">Publish a new trip</span>
          </motion.button>
        ) : (
          <motion.div
            key="publish-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition.default}
          >
            <PublishTripForm
              hubs={hubs.data?.items ?? []}
              onCancel={() => setShowForm(false)}
              onDone={() => {
                setShowForm(false)
                qc.invalidateQueries({ queryKey: ['drive', 'trips'] })
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Impact />
      <PastTrips trips={myTrips.data?.items ?? []} />
    </motion.div>
  )
}

function PublishTripForm({ hubs, onCancel, onDone }: { hubs: Hub[]; onCancel: () => void; onDone: () => void }) {
  const [originHubId, setOriginHubId] = useState(hubs[0]?.id ?? '')
  const [destination, setDestination] = useState('Faculty of Engineering')
  const [departureLocal, setDepartureLocal] = useState(defaultDepartureLocal())
  const [totalSeats, setTotalSeats] = useState(4)
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const publish = useMutation({
    mutationFn: () =>
      api.post('/trips', {
        originHubId,
        destination,
        departureAt: new Date(departureLocal).toISOString(),
        totalSeats,
        vehiclePlate,
      }),
    onSuccess: () => onDone(),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'driver_not_approved') {
        setError('Your driver profile needs steward approval before publishing trips.')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Could not publish.')
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        if (!originHubId) { setError('Pick a hub.'); return }
        publish.mutate()
      }}
      className="card-base p-6 glow-clay border-[var(--color-clay-soft)]"
    >
      <div className="label-cap text-[var(--color-clay)] font-bold">Publish an active trip</div>
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] text-[var(--color-stone)] font-semibold uppercase tracking-wider">Origin hub</label>
          <select
            value={originHubId}
            onChange={(e) => setOriginHubId(e.target.value)}
            className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm focus:outline-none focus:border-[var(--color-clay)] focus:ring-1 focus:ring-[var(--color-clay)] transition-all duration-200 shadow-sm"
          >
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[var(--color-stone)] font-semibold uppercase tracking-wider">Destination</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            maxLength={120}
            className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm focus:outline-none focus:border-[var(--color-clay)] focus:ring-1 focus:ring-[var(--color-clay)] transition-all duration-200 shadow-sm"
            placeholder="Faculty of Engineering"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--color-stone)] font-semibold uppercase tracking-wider">Depart time</label>
            <input
              type="datetime-local"
              value={departureLocal}
              onChange={(e) => setDepartureLocal(e.target.value)}
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm focus:outline-none focus:border-[var(--color-clay)] focus:ring-1 focus:ring-[var(--color-clay)] transition-all duration-200 shadow-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--color-stone)] font-semibold uppercase tracking-wider">Empty seats</label>
            <input
              type="number"
              min={1}
              max={8}
              value={totalSeats}
              onChange={(e) => setTotalSeats(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm font-mono focus:outline-none focus:border-[var(--color-clay)] focus:ring-1 focus:ring-[var(--color-clay)] transition-all duration-200 shadow-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-[var(--color-stone)] font-semibold uppercase tracking-wider">
            Vehicle plate <span className="text-[var(--color-stone-soft)] font-normal">· optional</span>
          </label>
          <input
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm font-mono uppercase focus:outline-none focus:border-[var(--color-clay)] focus:ring-1 focus:ring-[var(--color-clay)] transition-all duration-200 shadow-sm"
            placeholder="ABJ-432-KJA"
          />
        </div>
      </div>

      <AnimatePresence>
        {error ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition.fast}
            className="mt-3 text-[12px] text-[var(--color-coral)] font-medium"
            role="alert"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="mt-5 flex gap-3">
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onCancel}
          className="btn-secondary flex-1 h-11 text-sm font-medium"
        >
          Cancel
        </motion.button>
        <motion.button
          type="submit"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          disabled={publish.isPending}
          className="btn-primary flex-1 h-11 text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--color-clay) 0%, #B85A3C 100%)', boxShadow: '0 4px 14px -4px rgba(217, 119, 87, 0.4)' }}
        >
          {publish.isPending ? 'Publishing…' : 'Publish Trip'}
        </motion.button>
      </div>
    </form>
  )
}

function ActiveDriverTrip({ trip }: { trip: TripCard }) {
  const qc = useQueryClient()
  const detail = useQuery<{
    trip: TripCard
    hubName: string
    bookedCount: number
    seatsLeft: number
    riders?: { bookingId: string; commuterFirst: string; bookedAt: string }[]
  }>({
    queryKey: ['trip', trip.id],
    queryFn: () => api.get(`/trips/${trip.id}`),
    refetchInterval: 3000,
  })

  const start = useMutation({
    mutationFn: () => api.post(`/trips/${trip.id}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive', 'trips'] }),
  })
  const complete = useMutation({
    mutationFn: () => api.post(`/trips/${trip.id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive', 'trips'] }),
  })
  const cancel = useMutation({
    mutationFn: () => api.post(`/trips/${trip.id}/cancel`, { reason: 'Driver cancelled' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive', 'trips'] }),
  })

  const seatsLive = useTripSeats(trip.id, {
    seatsLeft: detail.data?.seatsLeft ?? trip.seatsLeft,
    bookedCount: detail.data?.bookedCount ?? trip.bookedCount,
  })
  const seatsLeft = seatsLive.seatsLeft
  const bookedCount = seatsLive.bookedCount
  const riders = detail.data?.riders ?? []
  const isLive = trip.status === 'published' || trip.status === 'boarding'

  return (
    <section
      className="card-base p-6 border-[var(--color-clay-soft)] glow-clay"
      style={{
        background: 'linear-gradient(180deg, var(--color-paper) 0%, #FDF7F2 100%)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <span className="relative inline-flex items-center justify-center size-2.5">
                <span className="absolute size-2 rounded-full bg-[var(--color-coral)] animate-ping opacity-75" />
                <span className="relative size-1.5 rounded-full bg-[var(--color-coral)]" />
              </span>
              <span className="label-cap text-[var(--color-coral)] font-bold">Live · booking active</span>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--color-stone)]" />
              <span className="label-cap text-[var(--color-stone)] font-bold uppercase">{trip.status}</span>
            </div>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--color-stone)] bg-[var(--color-cream-2)]/60 px-2 py-0.5 rounded font-bold">
          DEPARTS AT {new Date(trip.departureAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="mt-4 text-[24px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]">
        {trip.hubName}
        <span className="inline-flex items-center mx-2.5 align-middle">
          <svg width="20" height="14" viewBox="0 0 20 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 7H19" stroke="var(--color-indigo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13 1L19 7L13 13" stroke="var(--color-clay)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span className="text-[var(--color-clay)]">{trip.destination}</span>
      </div>

      <div className="mt-5 rounded-[16px] p-4 bg-[var(--color-cream)] border border-[var(--color-hairline)] shadow-[inset_0_2px_4px_rgba(27,42,78,0.02)]">
        <div className="flex items-baseline justify-between">
          <span className="label-cap text-[var(--color-indigo)] font-bold">Boarding status</span>
          <span className="font-mono text-[9px] text-[var(--color-stone)] tracking-wider">LIVE TELEMETRY</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <motion.span
            key={bookedCount}
            initial={{ scale: 1.25, color: 'var(--color-clay)' }}
            animate={{ scale: 1, color: 'var(--color-indigo)' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-[44px] font-semibold tracking-tight"
          >
            {bookedCount}
          </motion.span>
          <span className="text-2xl font-medium text-[var(--color-stone-soft)]">/ {trip.totalSeats} seats filled</span>
        </div>

        {trip.totalSeats > 0 ? (
          <div className="mt-3 flex gap-2">
            <AnimatePresence>
              {riders.map((r) => (
                <motion.div
                  key={r.bookingId}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0 flex-1 rounded-lg px-2 py-2.5 text-center text-[10px] font-bold bg-[var(--color-indigo)] text-[var(--color-paper)] truncate shadow-sm flex flex-col items-center justify-center"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-0.5 text-[var(--color-clay-soft)]">
                    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12Z" stroke="currentColor" strokeWidth="2.5" fill="currentColor"/>
                    <path d="M6 20C6 17 9 16 12 16C15 16 18 17 18 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <span>{r.commuterFirst}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {Array.from({ length: Math.max(seatsLeft, 0) }).map((_, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 rounded-lg py-2 flex flex-col items-center justify-center text-[9px] border border-dashed border-[var(--color-stone-soft)] text-[var(--color-stone)] bg-white/40"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-40 mb-0.5">
                  <path d="M12 2C9.79 2 8 3.79 8 6V14C8 16.21 9.79 18 12 18C14.21 18 16 16.21 16 14V6C16 3.79 14.21 2 12 2Z" stroke="currentColor" strokeWidth="2.5"/>
                  <path d="M6 18H18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <span className="font-semibold">open</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex gap-3">
        {trip.status === 'published' ? (
          <>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => cancel.mutate()}
              className="btn-secondary flex-1 h-11 text-xs font-semibold"
            >
              Cancel trip
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => start.mutate()}
              className="btn-primary flex-1 h-11 text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, var(--color-clay) 0%, #B85A3C 100%)', boxShadow: '0 4px 12px -4px rgba(217, 119, 87, 0.4)' }}
            >
              Start trip
            </motion.button>
          </>
        ) : trip.status === 'in_transit' ? (
          <>
            <Link
              to={`/trip/${trip.id}`}
              className="btn-secondary flex-1 h-11 text-xs font-semibold flex items-center justify-center"
            >
              Open trip view
            </Link>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => complete.mutate()}
              className="btn-primary flex-1 h-11 text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, var(--color-moss) 0%, #465543 100%)', boxShadow: '0 4px 12px -4px rgba(94, 114, 89, 0.4)' }}
            >
              Complete trip
            </motion.button>
          </>
        ) : null}
      </div>
    </section>
  )
}

function Impact() {
  const q = useQuery<{ seatsTotal: number; tripsTotal: number; kmTotal: number }>({
    queryKey: ['driver', 'impact'],
    queryFn: () => api.get('/driver/impact'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  })
  if (!q.data) return null
  const { seatsTotal, tripsTotal } = q.data
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...transition.slow, delay: 0.2 }}
      className="mt-6"
    >
      <div className="label-cap mb-2.5 text-[var(--color-indigo)] font-bold">Your cumulative impact</div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: seatsTotal, label: 'seats shared', color: 'var(--color-clay)' },
          { value: tripsTotal, label: 'trips completed', color: 'var(--color-moss)' },
        ].map(({ value, label, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transition.default, delay: 0.25 + i * 0.08 }}
            className="card-base p-4 glow-clay"
          >
            <div className="text-[34px] font-semibold tracking-tight" style={{ color }}>{value}</div>
            <div className="label-cap mt-1 text-[var(--color-stone)]">{label}</div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

function PastTrips({ trips }: { trips: TripCard[] }) {
  const past = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled')
  if (past.length === 0) return null
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...transition.slow, delay: 0.35 }}
      className="mt-6"
    >
      <div className="label-cap mb-2.5 text-[var(--color-indigo)] font-bold">Recent passenger history</div>
      <div className="card-base divide-y divide-[var(--color-hairline)] overflow-hidden shadow-sm">
        {past.slice(0, 8).map((t) => (
          <div key={t.id} className="px-4 py-3.5 flex items-center justify-between text-sm hover:bg-[var(--color-cream-2)]/25 transition-colors duration-150">
            <div>
              <div className="text-[var(--color-ink)] font-medium flex items-center">
                <span>{t.hubName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-1.5 opacity-60">
                  <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[var(--color-clay)]">{t.destination}</span>
              </div>
              <div className="text-[10px] text-[var(--color-stone)] mt-1 font-medium font-mono uppercase">
                {new Date(t.departureAt).toLocaleString('en-NG', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-[var(--color-indigo)] text-sm">{t.bookedCount}/{t.totalSeats}</div>
              <div
                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-block ${
                  t.status === 'completed' ? 'bg-[var(--color-moss)]/10 text-[var(--color-moss)]' : 'bg-[var(--color-coral)]/10 text-[var(--color-coral)]'
                }`}
              >
                {t.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  )
}
