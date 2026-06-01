import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
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
  hubLat?: number
  hubLng?: number
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

  return (
    <motion.div
      variants={stagger(0.08, 0.02)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        <TripMap
          tripId={trip.id}
          status={trip.status}
          hubName={hubName}
          hubLat={q.data.hubLat}
          hubLng={q.data.hubLng}
          destination={trip.destination}
          departureAt={trip.departureAt}
          startedAt={trip.startedAt}
          driverName={driverName}
          vehiclePlate={trip.vehiclePlate}
        />

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

type GPSPoint = { lat: number; lng: number; recordedAt: string }

// Fetch ETA + distance from OSRM public demo API.
// Called once when we have both the hub coords and a live GPS point.
async function fetchOSRMRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<{ durationMin: number; distanceKm: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { routes?: { duration: number; distance: number }[] }
    const route = data.routes?.[0]
    if (!route) return null
    return {
      durationMin: Math.round(route.duration / 60),
      distanceKm: Math.round(route.distance / 100) / 10,
    }
  } catch {
    return null
  }
}

function TripMap({
  tripId, status, hubName: _hubName, destination: _destination, hubLat, hubLng, departureAt, startedAt, driverName, vehiclePlate,
}: {
  tripId: string
  status: string
  hubName: string
  destination: string
  hubLat?: number
  hubLng?: number
  departureAt: string
  startedAt?: string
  driverName?: string
  vehiclePlate?: string
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const isLive = status === 'in_transit'
  const etaFetched = useRef(false)
  const [eta, setEta] = useState<{ durationMin: number; distanceKm: number } | null>(null)

  const arriving = startedAt
    ? new Date(new Date(startedAt).getTime() + (eta?.durationMin ?? 15) * 60 * 1000)
    : new Date(departureAt)

  // Poll latest GPS point every 6s only when in_transit
  const latest = useQuery<GPSPoint>({
    queryKey: ['trip', tripId, 'gps', 'latest'],
    queryFn: () => api.get(`/trips/${tripId}/gps/latest`),
    refetchInterval: isLive ? 6000 : false,
    enabled: isLive,
    retry: false,
  })

  // Full track for the polyline — fetched once when live
  const track = useQuery<{ items: GPSPoint[] }>({
    queryKey: ['trip', tripId, 'gps'],
    queryFn: () => api.get(`/trips/${tripId}/gps`),
    enabled: isLive,
    staleTime: 10_000,
    retry: false,
  })

  // Initialise map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      zoom: 14,
      center: [3.3792, 6.5244], // Lagos default until GPS arrives
      attributionControl: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Draw polyline track when data arrives
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !track.data?.items.length) return
    const coords = track.data.items.map(p => [p.lng, p.lat] as [number, number])
    const onLoad = () => {
      if (map.getSource('track')) {
        (map.getSource('track') as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        })
      } else {
        map.addSource('track', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        })
        map.addLayer({
          id: 'track-line',
          type: 'line',
          source: 'track',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#1B2A4E', 'line-width': 3, 'line-opacity': 0.6 },
        })
      }
    }
    if (map.isStyleLoaded()) onLoad()
    else map.once('load', onLoad)
  }, [track.data])

  // Fetch OSRM ETA once when first GPS point arrives and hub coords are known.
  useEffect(() => {
    if (!latest.data || !hubLat || !hubLng || etaFetched.current) return
    etaFetched.current = true
    fetchOSRMRoute(latest.data.lat, latest.data.lng, hubLat, hubLng)
      .then((result) => { if (result) setEta(result) })
  }, [latest.data, hubLat, hubLng])

  // Move driver marker to latest point
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !latest.data) return
    const { lat, lng } = latest.data
    const lngLat: maplibregl.LngLatLike = [lng, lat]
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat)
    } else {
      const el = document.createElement('div')
      el.className = 'trip-map-driver-dot'
      el.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:50%',
        'background:#1B2A4E', 'border:3px solid #FBF8F2',
        'box-shadow:0 0 0 4px rgba(27,42,78,0.25)',
        'animation:trip-map-pulse 1.8s ease-in-out infinite',
      ].join(';')
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map)
    }
    map.easeTo({ center: lngLat, duration: 800 })
  }, [latest.data])

  return (
    <div className="relative">
      {/* Map container */}
      <div ref={mapRef} className="w-full h-[260px]" />

      {/* Overlay info strip */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
        <div className="card-base px-3 py-2 bg-[var(--color-paper)]/90 backdrop-blur flex items-center gap-2">
          {isLive && <span className="size-2 rounded-full bg-[var(--color-moss)] animate-pulse shrink-0" />}
          <div>
            <div className="font-mono text-[10px] text-[var(--color-stone)]">
              {isLive ? (eta ? 'ETA' : 'ARRIVING') : 'DEPARTS'}
            </div>
            <div className="text-[15px] font-semibold tracking-tight text-[var(--color-indigo)] leading-tight">
              {eta && isLive
                ? `~${eta.durationMin} min`
                : arriving.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {eta && isLive && (
              <div className="font-mono text-[9px] text-[var(--color-stone)]">{eta.distanceKm} km</div>
            )}
          </div>
        </div>
        <div className="card-base px-3 py-2 bg-[var(--color-paper)]/90 backdrop-blur text-right">
          <div className="font-mono text-[10px] text-[var(--color-stone)]">DRIVER</div>
          <div className="text-[13px] font-semibold text-[var(--color-indigo)] leading-tight">
            {driverName ?? '—'}
            {vehiclePlate ? <span className="text-[var(--color-stone)] font-mono text-[11px]"> · {vehiclePlate}</span> : null}
          </div>
        </div>
      </div>

      {/* No GPS yet notice */}
      {isLive && !latest.data && !latest.isLoading && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 card-base px-3 py-1.5 bg-[var(--color-paper)]/90 backdrop-blur">
          <p className="text-[10px] text-[var(--color-stone)] whitespace-nowrap">Waiting for driver location…</p>
        </div>
      )}

      {/* Pre-transit placeholder */}
      {!isLive && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
          <div className="card-base px-4 py-2 bg-[var(--color-paper)]/90 backdrop-blur">
            <p className="text-[11px] text-[var(--color-stone)]">Live tracking starts when the trip is in transit</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes trip-map-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(27,42,78,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(27,42,78,0.08); }
        }
      `}</style>
    </div>
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
