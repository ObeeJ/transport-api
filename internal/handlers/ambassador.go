package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/ambassador"
	"github.com/obeej/akin/internal/middleware"
	"gorm.io/gorm"
)

type AmbassadorHandler struct{ db *gorm.DB }

func NewAmbassadorHandler(db *gorm.DB) *AmbassadorHandler { return &AmbassadorHandler{db: db} }

func (h *AmbassadorHandler) Activate(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	a, err := ambassador.Activate(h.db, user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "activate_failed"})
	}
	return c.Status(201).JSON(a)
}

func (h *AmbassadorHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	a, err := ambassador.Get(h.db, user.ID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	return c.JSON(a)
}
