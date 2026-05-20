package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type NoteHandler struct {
	svc *service.NoteService
}

func NewNoteHandler(svc *service.NoteService) *NoteHandler {
	return &NoteHandler{svc: svc}
}

// POST /notes — giver submits an anonymous encouragement note.
func (h *NoteHandler) Submit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	note, err := h.svc.Submit(user.ID, req.Body)
	if err != nil {
		return fail(c, err, "submit_failed")
	}
	// Return only the safe view — GiverID is never in the response.
	return c.Status(201).JSON(fiber.Map{"id": note.ID, "body": note.Body})
}

// GET /notes — recipient reads the anonymous encouragement feed.
func (h *NoteHandler) Feed(c *fiber.Ctx) error {
	feed, err := h.svc.Feed()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": feed})
}
