package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type SOSHandler struct {
	svc *service.SOSService
}

func NewSOSHandler(svc *service.SOSService) *SOSHandler {
	return &SOSHandler{svc: svc}
}

// POST /trips/:id/sos — rider triggers SOS during active trip.
func (h *SOSHandler) Trigger(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
		Note string  `json:"note"`
	}
	_ = c.BodyParser(&req)

	alert, err := h.svc.Trigger(service.TriggerSOSInput{
		TripID: tripID,
		UserID: user.ID,
		Lat:    req.Lat,
		Lng:    req.Lng,
		Note:   req.Note,
	})
	if err != nil {
		return fail(c, err, "sos_failed")
	}
	return c.Status(201).JSON(alert)
}

// GET /steward/sos — open SOS alerts queue.
func (h *SOSHandler) Queue(c *fiber.Ctx) error {
	items, err := h.svc.ListOpen()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}

// POST /steward/sos/:id/acknowledge
func (h *SOSHandler) Acknowledge(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	alert, err := h.svc.Acknowledge(id, steward.ID)
	if err != nil {
		return fail(c, err, "ack_failed")
	}
	return c.JSON(alert)
}

// POST /steward/sos/:id/resolve
func (h *SOSHandler) Resolve(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	alert, err := h.svc.Resolve(id, steward.ID)
	if err != nil {
		return fail(c, err, "resolve_failed")
	}
	return c.JSON(alert)
}
