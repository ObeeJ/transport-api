package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type GPSHandler struct {
	svc *service.GPSService
}

func NewGPSHandler(svc *service.GPSService) *GPSHandler {
	return &GPSHandler{svc: svc}
}

// POST /trips/:id/gps — driver records a GPS breadcrumb.
func (h *GPSHandler) Record(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Lat        float64 `json:"lat"`
		Lng        float64 `json:"lng"`
		Accuracy   float64 `json:"accuracy"`
		RecordedAt string  `json:"recordedAt"` // RFC3339
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	recordedAt := time.Now()
	if req.RecordedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.RecordedAt); err == nil {
			recordedAt = t
		}
	}
	if err := h.svc.Record(service.RecordPointInput{
		TripID:     tripID,
		UserID:     user.ID,
		Lat:        req.Lat,
		Lng:        req.Lng,
		Accuracy:   req.Accuracy,
		RecordedAt: recordedAt,
	}); err != nil {
		return fail(c, err, "record_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GET /trips/:id/gps — steward or driver retrieves the GPS track.
func (h *GPSHandler) Track(c *fiber.Ctx) error {
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	points, err := h.svc.TrackForTrip(tripID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": points})
}

// GET /trips/:id/gps/latest — latest single GPS point for live tracking.
func (h *GPSHandler) Latest(c *fiber.Ctx) error {
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	pt, err := h.svc.LatestForTrip(tripID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no_gps_data"})
	}
	return c.JSON(pt)
}
