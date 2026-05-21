package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type PayoutHandler struct {
	svc *service.PayoutService
}

func NewPayoutHandler(svc *service.PayoutService) *PayoutHandler {
	return &PayoutHandler{svc: svc}
}

func (h *PayoutHandler) Preview(c *fiber.Ctx) error {
	preview, err := h.svc.Preview()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "preview_failed"})
	}
	return c.JSON(preview)
}

func (h *PayoutHandler) InitiateBatch(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	batchID, count, err := h.svc.InitiateBatch(steward.ID)
	if err != nil {
		return fail(c, err, "batch_failed")
	}
	return c.Status(201).JSON(fiber.Map{"batchId": batchID, "count": count})
}

func (h *PayoutHandler) ConfirmBatch(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	batchID, err := uuid.Parse(c.Params("batchId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_batch_id"})
	}
	succeeded, err := h.svc.ConfirmBatch(c.Context(), batchID, steward.ID)
	if err != nil {
		return fail(c, err, "confirm_batch_failed")
	}
	return c.JSON(fiber.Map{"succeeded": succeeded})
}

func (h *PayoutHandler) Initiate(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	var req struct {
		RecipientID string `json:"recipientId"`
		AmountKobo  int64  `json:"amountKobo"`
		Note        string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	rid, err := uuid.Parse(req.RecipientID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_recipient_id"})
	}
	payout, err := h.svc.Initiate(service.InitiatePayoutInput{
		StewardID:   steward.ID,
		RecipientID: rid,
		AmountKobo:  req.AmountKobo,
		Note:        req.Note,
	})
	if err != nil {
		return fail(c, err, "create_payout_failed")
	}
	return c.Status(201).JSON(payout)
}

func (h *PayoutHandler) Confirm(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	payout, err := h.svc.Confirm(c.Context(), id, steward.ID)
	if err != nil {
		return fail(c, err, "transfer_failed")
	}
	return c.JSON(payout)
}

func (h *PayoutHandler) List(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	cursorStr := c.Query("cursor")
	var cursor time.Time
	if cursorStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, cursorStr); err == nil {
			cursor = t
		}
	}
	items, err := h.svc.ListCursor(cursor, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	var nextCursor string
	if len(items) == limit {
		nextCursor = items[len(items)-1].CreatedAt.Format(time.RFC3339Nano)
	}
	return c.JSON(fiber.Map{"items": items, "nextCursor": nextCursor})
}

// Withdraw — recipient-initiated payout from wallet to bank.
// No steward in the path; the prior approval + the wallet balance are
// the trust signals. See PayoutService.Withdraw for the full rationale.
func (h *PayoutHandler) Withdraw(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		AmountKobo int64 `json:"amountKobo"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	payout, err := h.svc.Withdraw(c.Context(), user.ID, req.AmountKobo)
	if err != nil {
		return fail(c, err, "withdrawal_failed")
	}
	return c.Status(201).JSON(payout)
}

func (h *PayoutHandler) ApprovedRecipients(c *fiber.Ctx) error {
	items, err := h.svc.ApprovedRecipients()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	out := make([]approvedRecipientResponse, 0, len(items))
	for _, ar := range items {
		out = append(out, toApprovedRecipientResponse(ar))
	}
	return c.JSON(fiber.Map{"items": out})
}
