package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/sanitize"
	"github.com/obeej/akin/internal/service"
)

type AppealHandler struct {
	svc *service.AppealService
}

func NewAppealHandler(svc *service.AppealService) *AppealHandler {
	return &AppealHandler{svc: svc}
}

// POST /recipients/me/appeal — recipient files an appeal.
func (h *AppealHandler) Submit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil || req.Reason == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	reason, err := sanitize.Text(req.Reason, sanitize.MaxReason)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "reason_invalid"})
	}
	appeal, err := h.svc.Submit(user.ID, reason)
	if err != nil {
		return fail(c, err, "submit_failed")
	}
	return c.Status(201).JSON(appeal)
}

// GET /steward/appeals — open appeals queue.
func (h *AppealHandler) Queue(c *fiber.Ctx) error {
	items, err := h.svc.ListOpen()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}

// POST /steward/appeals/:id/review — steward picks up an appeal.
func (h *AppealHandler) Review(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	appeal, err := h.svc.Review(id, steward.ID)
	if err != nil {
		return fail(c, err, "review_failed")
	}
	return c.JSON(appeal)
}

// POST /steward/appeals/:id/decide — steward resolves: upheld | dismissed.
func (h *AppealHandler) Decide(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Outcome string `json:"outcome"`
		Note    string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	appeal, err := h.svc.Decide(id, steward.ID, req.Outcome, req.Note)
	if err != nil {
		return fail(c, err, "decide_failed")
	}
	return c.JSON(appeal)
}
