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
