package handlers

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/service"
	"gorm.io/gorm"
)

type WebhookHandler struct {
	deposits payments.DisbursementProvider
	depSvc   *service.DepositService
	payoutSvc *service.PayoutService
	db       *gorm.DB
}

func NewWebhookHandler(p payments.DisbursementProvider, depSvc *service.DepositService, payoutSvc *service.PayoutService, db *gorm.DB) *WebhookHandler {
	return &WebhookHandler{deposits: p, depSvc: depSvc, payoutSvc: payoutSvc, db: db}
}

type paystackEvent struct {
	Event string `json:"event"`
	Data  struct {
		Reference string `json:"reference"`
		Status    string `json:"status"`
		Amount    int64  `json:"amount"`
	} `json:"data"`
}

func (h *WebhookHandler) Paystack(c *fiber.Ctx) error {
	body := c.Body()
	if h.deposits == nil || !h.deposits.VerifyWebhookSignature(body, c.Get("x-paystack-signature")) {
		audit.Record(h.db, "system", "webhook_signature_failed", "paystack", nil)
		return c.Status(400).JSON(fiber.Map{"error": "invalid_signature"})
	}

	var evt paystackEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_payload"})
	}

	// Idempotency: Paystack doesn't ship a stable event UUID, but
	// (event, reference) is unique per delivery. Inserting with a unique
	// index gives us atomic dedupe — a duplicate event hits the constraint
	// and we 200 OK without re-running the side-effects.
	eventKey := evt.Event + ":" + evt.Data.Reference
	we := &models.WebhookEvent{
		Source:     "paystack",
		EventID:    eventKey,
		EventType:  evt.Event,
		ReceivedAt: time.Now(),
	}
	if err := h.db.Create(we).Error; err != nil {
		// Duplicate — we've already processed this exact delivery.
		// We *still* 200 OK so Paystack stops retrying.
		if isUniqueViolation(err) {
			audit.Record(h.db, "system", "webhook_duplicate", eventKey, nil)
			return c.JSON(fiber.Map{"ok": true, "duplicate": true})
		}
		// Other DB error — best-effort, log and continue. The side-effect
		// handlers below are themselves idempotent, so a missed dedupe
		// row is at worst a duplicate of an already-idempotent action.
		audit.Record(h.db, "system", "webhook_dedupe_record_failed", eventKey,
			map[string]any{"err": err.Error()})
	}

	switch evt.Event {
	case "charge.success":
		if err := h.depSvc.Settle(evt.Data.Reference); err != nil {
			audit.Record(h.db, "system", "webhook_deposit_unknown", evt.Data.Reference, nil)
		}
	case "transfer.success":
		_ = h.payoutSvc.SettleByReference(evt.Data.Reference)
	default:
		audit.Record(h.db, "system", "webhook_event_unhandled", evt.Event, nil)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// isUniqueViolation — best-effort detection across GORM error wrappers.
// Postgres returns SQLSTATE 23505 for unique constraint violations.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	// GORM wraps the pgx error; the SQLSTATE shows up in the string.
	msg := err.Error()
	return contains(msg, "23505") ||
		contains(msg, "duplicate key") ||
		contains(msg, "UNIQUE constraint") ||
		errors.Is(err, gorm.ErrDuplicatedKey)
}

func contains(haystack, needle string) bool {
	if len(needle) > len(haystack) {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
