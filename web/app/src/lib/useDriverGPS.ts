import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'

// useDriverGPS — watches the device position and posts GPS breadcrumbs to the
// backend every SEND_INTERVAL_MS while the trip is in_transit. Stops cleanly
// on unmount or when status changes. Only runs in secure contexts (HTTPS or
// localhost) where geolocation is available.
//
// Privacy note: only the driver's device calls this. Riders are never tracked.

const SEND_INTERVAL_MS = 5000

export function useDriverGPS(tripId: string | undefined, active: boolean) {
  const lastSent = useRef<number>(0)
  const watchId = useRef<number | null>(null)
  const latestPos = useRef<GeolocationPosition | null>(null)
  const sendTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!active || !tripId || !navigator.geolocation) return

    // Watch position continuously — high accuracy for urban campus routes.
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => { latestPos.current = pos },
      () => { /* silent — no GPS available, map just won't update */ },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    )

    // Send on interval rather than on every position event to avoid flooding.
    sendTimer.current = window.setInterval(async () => {
      const pos = latestPos.current
      if (!pos) return
      const now = Date.now()
      if (now - lastSent.current < SEND_INTERVAL_MS - 200) return
      lastSent.current = now
      try {
        await api.post(`/trips/${tripId}/gps`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          recordedAt: new Date(pos.timestamp).toISOString(),
        })
      } catch {
        // Best-effort — a missed breadcrumb is not critical.
      }
    }, SEND_INTERVAL_MS)

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      if (sendTimer.current !== null) {
        window.clearInterval(sendTimer.current)
        sendTimer.current = null
      }
      latestPos.current = null
    }
  }, [tripId, active])
}
