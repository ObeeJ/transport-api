package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/ws"
)

type WSHandler struct {
	hub *ws.Hub
}

func NewWSHandler(hub *ws.Hub) *WSHandler {
	return &WSHandler{hub: hub}
}

func (h *WSHandler) Upgrade(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// GET /ws/trips/:id/seats — server-push seat count updates.
func (h *WSHandler) TripSeats(c *websocket.Conn) {
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		_ = c.Close()
		return
	}

	ctx := context.Background()
	h.hub.Register(ctx, tripID, c)
	defer h.hub.Unregister(tripID, c)

	// Read loop — keeps connection alive, discards any client messages.
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			break
		}
	}
}
