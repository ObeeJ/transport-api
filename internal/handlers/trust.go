package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/matcher"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/trust"
	"gorm.io/gorm"
)

type TrustHandler struct{ db *gorm.DB }

func NewTrustHandler(db *gorm.DB) *TrustHandler { return &TrustHandler{db: db} }

func (h *TrustHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	s, err := trust.Get(h.db, user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(s)
}

type MatcherHandler struct{ db *gorm.DB }

func NewMatcherHandler(db *gorm.DB) *MatcherHandler { return &MatcherHandler{db: db} }

func (h *MatcherHandler) RideStatus(c *fiber.Ctx) error {
	rideID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	return c.JSON(matcher.Status(h.db, rideID))
}

// RequestRide starts the guaranteed-ride ladder for a rider who couldn't find
// a seat among scheduled trips. Returns the new ride ID immediately — the
// frontend then polls RideStatus for ladder progress.
func (h *MatcherHandler) RequestRide(c *fiber.Ctx) error {
	if middleware.CurrentUser(c) == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	rideID, err := matcher.RequestRide(h.db)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "request_failed"})
	}
	return c.Status(201).JSON(fiber.Map{"rideId": rideID})
}

// EmergencyScan confirms the two-way QR handshake between a rider and an
// emergency-grant partner, closing out a tier-3 ride offer.
func (h *MatcherHandler) EmergencyScan(c *fiber.Ctx) error {
	if middleware.CurrentUser(c) == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	rideID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	if err := matcher.ConfirmEmergencyScan(h.db, rideID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "offer_not_found"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
