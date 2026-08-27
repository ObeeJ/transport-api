package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/pricing"
	"gorm.io/gorm"
)

type PricingHandler struct{ db *gorm.DB }

func NewPricingHandler(db *gorm.DB) *PricingHandler { return &PricingHandler{db: db} }

func (h *PricingHandler) Quote(c *fiber.Ctx) error {
	var req struct {
		VehicleCode string  `json:"vehicleCode"`
		DistanceKm  float64 `json:"distanceKm"`
	}
	if err := c.BodyParser(&req); err != nil || req.DistanceKm <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.VehicleCode == "" {
		req.VehicleCode = "sedan"
	}
	q, err := pricing.Calculate(h.db, req.VehicleCode, req.DistanceKm, time.Now())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "quote_failed"})
	}
	return c.JSON(q)
}
