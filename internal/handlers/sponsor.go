package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/sponsor"
	"gorm.io/gorm"
)

type SponsorHandler struct {
	db       *gorm.DB
	provider payments.DisbursementProvider
	mock     bool
}

func NewSponsorHandler(db *gorm.DB, provider payments.DisbursementProvider, mock bool) *SponsorHandler {
	return &SponsorHandler{db: db, provider: provider, mock: mock}
}

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

// Retry charges a sponsor immediately instead of waiting for the next
// scheduled cycle — e.g. after the cardholder fixes a failed card.
func (h *SponsorHandler) Retry(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	if err := sponsor.ChargeByID(c.Context(), h.db, h.provider, h.mock, id, user.ID); err != nil {
		return c.Status(422).JSON(fiber.Map{"error": "charge_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
