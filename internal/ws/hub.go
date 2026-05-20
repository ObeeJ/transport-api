package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Hub manages WebSocket connections grouped by trip ID.
// When a booking or cancellation happens, the ride service calls
// hub.Publish(tripID, SeatUpdate{...}) which fans out to all connected
// clients watching that trip — the driver's open trip card and any
// rider browsing the trip list.
//
// Feynman: think of it as a radio station per trip. The driver and
// riders tune in to the same frequency (trip ID). When a seat is
// booked, the station broadcasts "seats left: 2" to everyone listening.
// Redis is the transmitter — it means the broadcast works even if the
// API runs on multiple servers.
type Hub struct {
	rdb *redis.Client

	mu      sync.RWMutex
	clients map[uuid.UUID]map[*websocket.Conn]struct{} // tripID → set of conns
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		rdb:     rdb,
		clients: make(map[uuid.UUID]map[*websocket.Conn]struct{}),
	}
}

// SeatUpdate is the message broadcast to all watchers of a trip.
type SeatUpdate struct {
	TripID      string `json:"tripId"`
	SeatsLeft   int    `json:"seatsLeft"`
	BookedCount int    `json:"bookedCount"`
	TotalSeats  int    `json:"totalSeats"`
}

// tripChannel returns the Redis pub/sub channel name for a trip.
func tripChannel(tripID uuid.UUID) string {
	return fmt.Sprintf("trip:seats:%s", tripID)
}

// Publish sends a seat update via Redis so all API instances receive it.
func (h *Hub) Publish(ctx context.Context, update SeatUpdate) {
	b, err := json.Marshal(update)
	if err != nil {
		return
	}
	tripID, _ := uuid.Parse(update.TripID)
	if err := h.rdb.Publish(ctx, tripChannel(tripID), b).Err(); err != nil {
		slog.Warn("ws publish failed", "tripId", update.TripID, "err", err)
	}
}

// Subscribe starts a Redis subscription for a trip and fans out to all
// local WebSocket connections watching that trip.
// Called once per unique trip when the first client connects.
func (h *Hub) subscribe(ctx context.Context, tripID uuid.UUID) {
	sub := h.rdb.Subscribe(ctx, tripChannel(tripID))
	ch := sub.Channel()
	go func() {
		defer sub.Close()
		for msg := range ch {
			h.broadcast(tripID, []byte(msg.Payload))
		}
	}()
}

// broadcast sends raw bytes to all local connections watching tripID.
func (h *Hub) broadcast(tripID uuid.UUID, msg []byte) {
	h.mu.RLock()
	conns := h.clients[tripID]
	h.mu.RUnlock()
	for conn := range conns {
		_ = conn.WriteMessage(websocket.TextMessage, msg)
	}
}

// Register adds a WebSocket connection to the trip's watcher set.
// If this is the first watcher for the trip, starts the Redis subscription.
func (h *Hub) Register(ctx context.Context, tripID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	if _, ok := h.clients[tripID]; !ok {
		h.clients[tripID] = make(map[*websocket.Conn]struct{})
		go h.subscribe(ctx, tripID)
	}
	h.clients[tripID][conn] = struct{}{}
	h.mu.Unlock()
}

// Unregister removes a connection. Cleans up the trip entry when empty.
func (h *Hub) Unregister(tripID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.clients[tripID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.clients, tripID)
		}
	}
}
