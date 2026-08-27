package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/circle"
	"github.com/obeej/akin/internal/middleware"
	"gorm.io/gorm"
)

type CircleHandler struct{ db *gorm.DB }

func NewCircleHandler(db *gorm.DB) *CircleHandler { return &CircleHandler{db: db} }

func (h *CircleHandler) Status(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	m, badge := circle.Status(h.db, user.ID)
	return c.JSON(fiber.Map{"membership": m, "badge": badge})
}

func (h *CircleHandler) Purchase(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	// Count existing members to determine founding status.
	var count int64
	h.db.Table("circle_memberships").Where("status = 'active'").Count(&count)
	founding := count < 500

	m, err := circle.Purchase(h.db, user.ID, 500_00, founding) // ₦500
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "purchase_failed"})
	}
	return c.Status(201).JSON(m)
}
