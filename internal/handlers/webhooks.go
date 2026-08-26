package handlers

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/outbox"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/service"
	"gorm.io/gorm"
)

type WebhookHandler struct {
	deposits  payments.DisbursementProvider
	depSvc    *service.DepositService
	payoutSvc *service.PayoutService
	db        *gorm.DB
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

	eventKey := evt.Event + ":" + evt.Data.Reference

	// Persist raw event to outbox + dedupe atomically.
	err := h.db.Transaction(func(tx *gorm.DB) error {
		we := &models.WebhookEvent{
			Source:     "paystack",
			EventID:    eventKey,
			EventType:  evt.Event,
			ReceivedAt: time.Now(),
		}
		if err := tx.Create(we).Error; err != nil {
			if isUniqueViolation(err) {
				return errDuplicate
			}
			return err
		}
		// Emit to outbox for async processing.
		return outbox.Emit(tx, uuid.New(), "webhook.paystack."+evt.Event, map[string]any{
			"reference": evt.Data.Reference,
			"status":    evt.Data.Status,
			"amount":    evt.Data.Amount,
			"event":     evt.Event,
		})
	})

	if errors.Is(err, errDuplicate) {
		audit.Record(h.db, "system", "webhook_duplicate", eventKey, nil)
		return c.JSON(fiber.Map{"ok": true, "duplicate": true})
	}
	if err != nil {
		audit.Record(h.db, "system", "webhook_outbox_failed", eventKey, map[string]any{"err": err.Error()})
		// Still ack to Paystack — we'll retry via outbox.
	}

	// Process synchronously as well (belt-and-suspenders until outbox handlers are wired).
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

var errDuplicate = errors.New("duplicate")

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
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
