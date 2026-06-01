import { useEffect, useRef, useState } from 'react'

const WS_BASE = deriveWsBase()

// When the REST API is served same-origin via a reverse proxy (e.g.
// VITE_API_URL="/api" behind a Vercel rewrite) the value is relative and can't
// become a ws:// URL — and Vercel doesn't proxy WebSockets anyway, so set
// VITE_WS_URL to the API host directly in that deployment. Otherwise we derive
// it from the API URL, falling back to the page origin (the seat hook then
// degrades to REST polling if that socket can't connect).
function deriveWsBase(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined
  if (fromEnv) return fromEnv
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'
  if (apiUrl.startsWith('http')) return apiUrl.replace(/^http/, 'ws')
  if (typeof window !== 'undefined') return window.location.origin.replace(/^http/, 'ws')
  return 'ws://localhost:8080'
}

export type SeatUpdate = {
  tripId: string
  seatsLeft: number
  bookedCount: number
  totalSeats: number
}

/**
 * useTripSeats — subscribes to live seat count updates for a trip via WebSocket.
 * Falls back gracefully if the WS connection fails (e.g. Redis is down).
 * The caller still gets the last known value from the REST query as the initial state.
 */
export function useTripSeats(tripId: string | undefined, initial: { seatsLeft: number; bookedCount: number }) {
  const [seats, setSeats] = useState(initial)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Sync initial values when the REST query updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeats(initial)
  // Intentionally keyed on primitives, not the object reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.seatsLeft, initial.bookedCount])

  useEffect(() => {
    if (!tripId) return
    const url = `${WS_BASE}/ws/trips/${tripId}/seats`
    const socket = new WebSocket(url)
    ws.current = socket

    socket.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data) as SeatUpdate
        setSeats({ seatsLeft: update.seatsLeft, bookedCount: update.bookedCount })
      } catch {
        // ignore malformed messages
      }
    }

    socket.onerror = () => {
      // Silently fall back to polling — the REST query in DriverHome
      // already refetches every 3s so the driver still gets updates.
    }

    return () => {
      socket.close()
      ws.current = null
    }
  }, [tripId])

  return seats
}
