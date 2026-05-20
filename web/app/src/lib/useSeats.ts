import { useEffect, useRef, useState } from 'react'

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080')
  .replace(/^http/, 'ws')

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
    setSeats(initial)
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
