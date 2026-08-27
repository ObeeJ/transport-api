package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/wings"
	"gorm.io/gorm"
)

type WingsHandler struct{ db *gorm.DB }

func NewWingsHandler(db *gorm.DB) *WingsHandler { return &WingsHandler{db: db} }

func (h *WingsHandler) Balance(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	bal, err := wings.GetBalance(h.db, user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(bal)
}

func (h *WingsHandler) History(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	limit := c.QueryInt("limit", 50)
	items, err := wings.History(h.db, user.ID, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}
