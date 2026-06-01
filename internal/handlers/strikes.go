package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/sanitize"
	"github.com/obeej/akin/internal/service"
)

type StrikeHandler struct {
	svc *service.IntegrityService
}

func NewStrikeHandler(svc *service.IntegrityService) *StrikeHandler {
	return &StrikeHandler{svc: svc}
}

// List returns the active strike queue for stewards (un-cleared, recent first).
func (h *StrikeHandler) List(c *fiber.Ctx) error {
	strikes, err := h.svc.ListActive()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "strikes_failed"})
	}
	return c.JSON(fiber.Map{"strikes": strikes})
}

// Clear resolves a strike — used when a steward overturns it (e.g. after a
// successful appeal or a driver-marking mistake).
func (h *StrikeHandler) Clear(c *fiber.Ctx) error {
	u := middleware.CurrentUser(c)
	if u == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	reason, err := sanitize.Optional(req.Reason, 280)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "reason_invalid"})
	}
	if err := h.svc.Clear(id, u.ID, reason); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "clear_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
