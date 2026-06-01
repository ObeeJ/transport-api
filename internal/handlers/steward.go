package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type StewardHandler struct {
	svc *service.StewardService
}

func NewStewardHandler(svc *service.StewardService) *StewardHandler {
	return &StewardHandler{svc: svc}
}

func (h *StewardHandler) Queue(c *fiber.Ctx) error {
	items, err := h.svc.Queue(middleware.CurrentInstitution(c))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	out := make([]recipientResponse, 0, len(items))
	for _, r := range items {
		out = append(out, toRecipientResponse(&r))
	}
	return c.JSON(fiber.Map{"items": out})
}

func (h *StewardHandler) Workload(c *fiber.Ctx) error {
	out, err := h.svc.Workload()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "workload_failed"})
	}
	return c.JSON(out)
}

func (h *StewardHandler) Application(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	detail, err := h.svc.GetApplication(id, steward.ID)
	if err != nil {
		return fail(c, err, "query_failed")
	}
	return c.JSON(fiber.Map{
		"recipient":    toRecipientResponse(&detail.Recipient),
		"actions":      detail.Actions,
		"yourDecision": detail.YourDecision,
	})
}

func (h *StewardHandler) Decide(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Decision      string `json:"decision"`
		WeeklyCapKobo int64  `json:"weeklyCapKobo"`
		Note          string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	result, err := h.svc.Decide(service.DecideInput{
		RecipientID:   id,
		StewardID:     steward.ID,
		Decision:      req.Decision,
		WeeklyCapKobo: req.WeeklyCapKobo,
		Note:          req.Note,
	})
	if err != nil {
		return fail(c, err, "decide_failed")
	}
	return c.JSON(fiber.Map{
		"action":        result.Action,
		"transitioned":  result.Transitioned,
		"signoffsSoFar": result.SignoffsSoFar,
		"recipient":     toRecipientResponse(&result.Recipient),
	})
}

func (h *StewardHandler) Audit(c *fiber.Ctx) error {
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
	entries, err := h.svc.ListAuditCursor(cursor, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	var nextCursor string
	if len(entries) == limit {
		nextCursor = entries[len(entries)-1].CreatedAt.Format(time.RFC3339Nano)
	}
	return c.JSON(fiber.Map{"items": entries, "nextCursor": nextCursor})
}
