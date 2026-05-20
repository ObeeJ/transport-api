package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gofiber/fiber/v2"
	svix "github.com/svix/svix-webhooks/go"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

type ResendWebhookHandler struct {
	wh        *svix.Webhook // nil if secret not configured
	userRepo  *repository.UserRepo
	notifyRepo *repository.NotificationRepo
	db        *gorm.DB
}

func NewResendWebhookHandler(secret string, userRepo *repository.UserRepo, notifyRepo *repository.NotificationRepo, db *gorm.DB) *ResendWebhookHandler {
	var wh *svix.Webhook
	if secret != "" && secret != "whsec_replace_me" {
		var err error
		wh, err = svix.NewWebhook(secret)
		if err != nil {
			slog.Warn("resend webhook secret invalid — signature verification disabled", "err", err)
		} else {
			slog.Info("resend webhook signature verification enabled")
		}
	} else {
		slog.Warn("RESEND_WEBHOOK_SECRET not set — resend webhooks will not verify signatures")
	}
	return &ResendWebhookHandler{wh: wh, userRepo: userRepo, notifyRepo: notifyRepo, db: db}
}

// resendEvent mirrors the Resend webhook payload shape.
// https://resend.com/docs/dashboard/webhooks/event-types
type resendEvent struct {
	Type string `json:"type"`
	Data struct {
		EmailID   string   `json:"email_id"`
		From      string   `json:"from"`
		To        []string `json:"to"`
		Subject   string   `json:"subject"`
		CreatedAt string   `json:"created_at"`
		// bounce-specific
		BounceType    string `json:"bounce_type"`    // hard | soft
		BounceMessage string `json:"bounce_message"`
	} `json:"data"`
}

// POST /webhooks/resend
func (h *ResendWebhookHandler) Handle(c *fiber.Ctx) error {
	body := c.Body()

	// Verify svix signature if secret is configured.
	if h.wh != nil {
		headers := make(http.Header)
		c.Request().Header.VisitAll(func(k, v []byte) {
			headers.Set(string(k), string(v))
		})
		if err := h.wh.Verify(body, headers); err != nil {
			audit.Record(h.db, "system", "resend_webhook_signature_failed", "resend", nil)
			return c.Status(400).JSON(fiber.Map{"error": "invalid_signature"})
		}
	}

	var evt resendEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_payload"})
	}

	// All events have at least one recipient.
	toEmail := ""
	if len(evt.Data.To) > 0 {
		toEmail = evt.Data.To[0]
	}

	switch evt.Type {

	case "email.delivered":
		// Email confirmed delivered — nothing to act on, just audit.
		audit.Record(h.db, "system", "email_delivered", evt.Data.EmailID, map[string]any{
			"to":      toEmail,
			"subject": evt.Data.Subject,
		})

	case "email.bounced":
		// Hard bounce — the address doesn't exist. Mark the user's email
		// as unverified and notify them so they can update it.
		audit.Record(h.db, "system", "email_bounced", evt.Data.EmailID, map[string]any{
			"to":          toEmail,
			"bounceType":  evt.Data.BounceType,
			"subject":     evt.Data.Subject,
		})
		if toEmail != "" && evt.Data.BounceType == "hard" {
			h.handleHardBounce(toEmail)
		}

	case "email.complained":
		// Spam complaint — audit and notify stewards.
		audit.Record(h.db, "system", "email_complained", evt.Data.EmailID, map[string]any{
			"to":      toEmail,
			"subject": evt.Data.Subject,
		})
		slog.Warn("resend spam complaint received", "to", toEmail, "emailId", evt.Data.EmailID)

	case "email.opened":
		// Engagement signal — audit only, no action needed.
		audit.Record(h.db, "system", "email_opened", evt.Data.EmailID, map[string]any{
			"to": toEmail,
		})

	default:
		audit.Record(h.db, "system", "resend_webhook_unhandled", evt.Type, nil)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// handleHardBounce clears email_verified_at so the user is prompted
// to update their email address on next login.
func (h *ResendWebhookHandler) handleHardBounce(email string) {
	user, err := h.userRepo.FindByEmail(email)
	if err != nil {
		return
	}

	_ = h.db.Model(user).Updates(map[string]any{
		"email_verified_at":  nil,
		"email_verify_token": "",
	}).Error

	_ = h.notifyRepo.Create(&models.Notification{
		UserID:  user.ID,
		Channel: "in_app",
		Event:   "email_bounced",
		Title:   "Email delivery failed",
		Body:    "We couldn't deliver to " + email + ". Please update your email address.",
	})

	audit.Record(h.db, "system", "email_hard_bounce_cleared", user.ID.String(), map[string]any{
		"email": email,
	})
}
