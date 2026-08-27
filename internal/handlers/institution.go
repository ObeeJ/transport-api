package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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

// Create onboards a new whitelabel Circle. The creator becomes its admin.
func (h *InstitutionHandler) Create(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Name   string `json:"name"`
		Slug   string `json:"slug"`
		Sector string `json:"sector"`
	}
	if err := c.BodyParser(&req); err != nil || req.Name == "" || req.Slug == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	id, err := institution.Create(h.db, user.ID, req.Name, req.Slug, req.Sector)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create_failed"})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// Switch sets the caller's active Circle context to an institution they admin.
func (h *InstitutionHandler) Switch(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	if err := institution.Switch(h.db, user.ID, id); err != nil {
		return c.Status(403).JSON(fiber.Map{"error": "switch_denied"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
