package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/sponsor"
	"gorm.io/gorm"
)

type SponsorHandler struct{ db *gorm.DB }

func NewSponsorHandler(db *gorm.DB) *SponsorHandler { return &SponsorHandler{db: db} }

func (h *SponsorHandler) SetupRecurring(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		AmountKobo int64  `json:"amountKobo"`
		Cadence    string `json:"cadence"`
		AuthCode   string `json:"authCode"`
	}
	if err := c.BodyParser(&req); err != nil || req.AmountKobo < 100 || req.AuthCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	r, err := sponsor.Create(h.db, user.ID, req.AmountKobo, req.Cadence, req.AuthCode)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create_failed"})
	}
	return c.Status(201).JSON(r)
}

func (h *SponsorHandler) Cancel(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	return c.JSON(fiber.Map{"ok": sponsor.Cancel(h.db, id, user.ID) == nil})
}
