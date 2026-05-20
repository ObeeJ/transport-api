package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type RosterHandler struct {
	svc *service.RosterService
}

func NewRosterHandler(svc *service.RosterService) *RosterHandler {
	return &RosterHandler{svc: svc}
}

// POST /roster/verify — auth required. Submits a student ID for hashing
// and one-student-one-account enforcement. The raw ID is never stored.
func (h *RosterHandler) Verify(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		StudentID string `json:"studentId"`
	}
	if err := c.BodyParser(&req); err != nil || req.StudentID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	entry, err := h.svc.Verify(user.ID, req.StudentID)
	if err != nil {
		return fail(c, err, "verify_failed")
	}
	return c.JSON(fiber.Map{"verified": entry.Verified, "id": entry.ID})
}

// GET /roster/me — returns whether the current user has verified their student ID.
func (h *RosterHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	return c.JSON(fiber.Map{"verified": h.svc.IsVerified(user.ID)})
}

// POST /steward/roster/import — steward-only bulk CSV upload of
// `email,studentId` rows. Pre-verifies users so they don't need to enter
// their student ID themselves. Idempotent per user.
func (h *RosterHandler) Import(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	file, err := c.FormFile("file")
	var result *service.BulkImportResult
	if err == nil && file != nil {
		f, ferr := file.Open()
		if ferr != nil {
			return c.Status(400).JSON(fiber.Map{"error": "open_failed"})
		}
		defer f.Close()
		result, err = h.svc.BulkImportCSV(steward.ID, f)
	} else {
		result, err = h.svc.BulkImportCSV(steward.ID, c.Request().BodyStream())
	}
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_csv", "detail": err.Error()})
	}
	return c.JSON(result)
}

// GET /steward/roster/stats — quick "how many users verified" counter.
func (h *RosterHandler) Stats(c *fiber.Ctx) error {
	stats, err := h.svc.Stats()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(stats)
}
