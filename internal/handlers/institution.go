package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/institution"
	"github.com/obeej/akin/internal/middleware"
	"gorm.io/gorm"
)

type InstitutionHandler struct{ db *gorm.DB }

func NewInstitutionHandler(db *gorm.DB) *InstitutionHandler { return &InstitutionHandler{db: db} }

func (h *InstitutionHandler) Mine(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var inst map[string]any
	h.db.Table("institutions").Where("id = ?", user.InstitutionID).Scan(&inst)
	return c.JSON(inst)
}

func (h *InstitutionHandler) Join(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	token := c.Params("token")
	if err := institution.JoinByToken(h.db, token, user.ID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_token"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *InstitutionHandler) GenerateInvite(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	token, err := institution.GenerateInviteToken(h.db, user.InstitutionID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "generate_failed"})
	}
	return c.JSON(fiber.Map{"token": token})
}
