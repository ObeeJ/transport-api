package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/circle"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/payments"
	"gorm.io/gorm"
)

type CircleHandler struct {
	db       *gorm.DB
	provider payments.DisbursementProvider
}

func NewCircleHandler(db *gorm.DB, provider payments.DisbursementProvider) *CircleHandler {
	return &CircleHandler{db: db, provider: provider}
}

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

// Webhook receives Paystack's async confirmation for a Circle purchase.
// Purchase() above already activates membership synchronously (mirroring the
// simplified checkout flow already in place for it), so this endpoint's job
// is purely to acknowledge the callback so Paystack stops retrying — signature
// verification still guards it the same way /webhooks/paystack does.
func (h *CircleHandler) Webhook(c *fiber.Ctx) error {
	body := c.Body()
	if h.provider == nil || !h.provider.VerifyWebhookSignature(body, c.Get("x-paystack-signature")) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_signature"})
	}
	return c.SendStatus(200)
}
