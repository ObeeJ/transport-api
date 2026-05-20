import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useTripSeats } from '@/lib/useSeats'
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
  // Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DriverHome() {
  const qc = useQueryClient()
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

  // Check driver verification status
  const driverProfile = useQuery<{ status: string } | null>({
    queryKey: ['driver', 'me'],
    queryFn: () => api.get<{ status: string }>('/driver/me').catch(() => null),
    staleTime: 5 * 60 * 1000,
  })
  const isApproved = driverProfile.data?.status === 'approved'
  const hasPending = driverProfile.data?.status === 'pending'

  return (
    <div className="pt-4">
      {!driverProfile.isLoading && !isApproved && !hasPending ? (
        <div className="card-base p-4 mb-4" style={{ borderColor: 'var(--color-clay-soft)' }}>
          <div className="label-cap text-[var(--color-clay)]">Driver verification</div>
          <p className="mt-1 text-[12px] text-[var(--color-stone)]">Apply to drive — two stewards verify your details before you can publish trips.</p>
          <Link to="/drive/apply" className="btn-primary mt-3 h-10 px-4 text-xs inline-flex">Apply to drive</Link>
        </div>
      ) : hasPending ? (
        <div className="card-base p-4 mb-4 bg-[var(--color-cream)]">
          <div className="label-cap">Verification pending</div>
          <p className="mt-1 text-[12px] text-[var(--color-stone)]">Two stewards are reviewing your application. You'll be notified when it's decided.</p>
        </div>
      ) : null}
      {liveTrip ? <ActiveDriverTrip trip={liveTrip} /> : null}

      {!showForm ? (
        <button
          onClick={() => {
            if (isApproved) setShowForm(true)
          }}
          disabled={!isApproved}
          className="mt-4 w-full h-[52px] rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-base leading-none">+</span> Publish a trip
        </button>
      ) : (
        <PublishTripForm
          hubs={hubs.data?.items ?? []}
          onCancel={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['drive', 'trips'] })
          }}
        />
      )}

      <Impact />
      <PastTrips trips={myTrips.data?.items ?? []} />
    </div>
  )
}

function PublishTripForm({
  hubs,
  onCancel,
  onDone,
}: {
  hubs: Hub[]
  onCancel: () => void
  onDone: () => void
}) {
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
        if (!originHubId) {
          setError('Pick a hub.')
          return
        }
        publish.mutate()
      }}
      className="mt-4 card-base p-5"
    >
      <div className="label-cap">Publish a trip</div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[11px] text-[var(--color-stone)]">From hub</label>
          <select
            value={originHubId}
            onChange={(e) => setOriginHubId(e.target.value)}
            className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm"
          >
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] text-[var(--color-stone)]">To</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm"
            placeholder="Faculty of Engineering"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--color-stone)]">Depart</label>
            <input
              type="datetime-local"
              value={departureLocal}
              onChange={(e) => setDepartureLocal(e.target.value)}
              className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--color-stone)]">Seats</label>
            <input
              type="number"
              min={1}
              max={7}
              value={totalSeats}
              onChange={(e) => setTotalSeats(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[var(--color-stone)]">
            Vehicle plate <span className="text-[var(--color-stone-soft)]">· optional</span>
          </label>
          <input
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            className="mt-1 w-full bg-[var(--color-cream)] border border-[var(--color-hairline)] rounded-[12px] px-3 h-11 text-sm font-mono uppercase"
            placeholder="ABJ-432-KJA"
          />
        </div>
      </div>

      {error ? <p className="mt-3 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={publish.isPending}
          className="flex-1 h-11 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-sm font-medium"
        >
          {publish.isPending ? 'Publishing…' : 'Publish'}
        </button>
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
    riders?: { bookingId: string; riderFirst: string; bookedAt: string }[]
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
      className="card-base p-5"
      style={{
        background: 'linear-gradient(180deg, var(--color-paper) 0%, #FBF1E7 100%)',
        borderColor: 'var(--color-clay-soft)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <span className="relative inline-flex">
                <span className="size-2 rounded-full bg-[var(--color-coral)] animate-pulse" />
              </span>
              <span className="label-cap text-[var(--color-coral)]">Live · booking open</span>
            </>
          ) : (
            <span className="label-cap text-[var(--color-stone)]">{trip.status}</span>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--color-stone)]">
          {new Date(trip.departureAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="mt-3 text-[26px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]">
        {trip.hubName} <span className="text-[var(--color-clay)]">→</span>
        <br />
        {trip.destination}
      </div>

      <div className="mt-5 rounded-[16px] p-4 bg-[var(--color-cream)] border border-[var(--color-hairline)]">
        <div className="flex items-baseline justify-between">
          <span className="label-cap">Seats booked</span>
          <span className="font-mono text-[10px] text-[var(--color-stone)]">UPDATES LIVE</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <motion.span
            key={bookedCount}
            initial={{ scale: 1.15, color: 'var(--color-clay)' }}
            animate={{ scale: 1, color: 'var(--color-indigo)' }}
            transition={{ duration: 0.25 }}
            className="text-[44px] font-medium tracking-tight"
          >
            {bookedCount}
          </motion.span>
          <span className="text-2xl text-[var(--color-stone-soft)]">/ {trip.totalSeats}</span>
        </div>
        {trip.totalSeats > 0 ? (
          <div className="mt-2 flex gap-2">
            {riders.map((r) => (
              <div
                key={r.bookingId}
                className="min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-[10px] font-medium bg-[var(--color-indigo)] text-[var(--color-paper)] truncate"
              >
                {r.riderFirst}
              </div>
            ))}
            {Array.from({ length: Math.max(seatsLeft, 0) }).map((_, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 rounded-lg py-2 text-center text-[10px] border border-dashed border-[var(--color-stone-soft)] text-[var(--color-stone)]"
              >
                open
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        {trip.status === 'published' ? (
          <>
            <button
              onClick={() => cancel.mutate()}
              className="flex-1 h-10 text-xs rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-paper)]"
            >
              Cancel trip
            </button>
            <button
              onClick={() => start.mutate()}
              className="flex-1 h-10 text-xs rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)]"
            >
              Start trip
            </button>
          </>
        ) : trip.status === 'in_transit' ? (
          <>
            <Link
              to={`/trip/${trip.id}`}
              className="flex-1 h-10 text-xs rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-paper)] flex items-center justify-center"
            >
              Open trip view
            </Link>
            <button
              onClick={() => complete.mutate()}
              className="flex-1 h-10 text-xs rounded-[12px] bg-[var(--color-moss)] text-[var(--color-paper)]"
            >
              Complete trip
            </button>
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
    <section className="mt-6">
      <div className="label-cap mb-2">Your impact</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="card-base p-4">
          <div className="text-[32px] font-medium tracking-tight text-[var(--color-indigo)]">{seatsTotal}</div>
          <div className="label-cap mt-1">seats donated</div>
        </div>
        <div className="card-base p-4">
          <div className="text-[32px] font-medium tracking-tight text-[var(--color-indigo)]">{tripsTotal}</div>
          <div className="label-cap mt-1">trips completed</div>
        </div>
      </div>
    </section>
  )
}

function PastTrips({ trips }: { trips: TripCard[] }) {
  const past = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled')
  if (past.length === 0) return null
  return (
    <section className="mt-6">
      <div className="label-cap mb-2">Recent trips</div>
      <div className="card-base divide-y divide-[var(--color-hairline)]">
        {past.slice(0, 8).map((t) => (
          <div key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <div>
              <div className="text-[var(--color-ink)]">
                {t.hubName} <span className="text-[var(--color-clay)]">→</span> {t.destination}
              </div>
              <div className="text-[10px] text-[var(--color-stone)] mt-0.5">
                {new Date(t.departureAt).toLocaleString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-mono text-[var(--color-indigo)]">
                {t.bookedCount}/{t.totalSeats}
              </div>
              <div className="text-[10px] text-[var(--color-stone)] uppercase tracking-wider">{t.status}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
