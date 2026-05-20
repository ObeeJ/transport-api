package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type AttendanceHandler struct {
	svc *service.AttendanceService
}

func NewAttendanceHandler(svc *service.AttendanceService) *AttendanceHandler {
	return &AttendanceHandler{svc: svc}
}

// POST /steward/attendance — steward-only CSV upload.
// Accepts either:
//   - multipart form-data with a "file" field, OR
//   - raw text/csv body
func (h *AttendanceHandler) Upload(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)

	file, err := c.FormFile("file")
	var result *service.CSVUploadResult
	if err == nil && file != nil {
		f, ferr := file.Open()
		if ferr != nil {
			return c.Status(400).JSON(fiber.Map{"error": "open_failed"})
		}
		defer f.Close()
		result, err = h.svc.UploadCSV(steward.ID, f)
	} else {
		// Raw CSV body fallback.
		result, err = h.svc.UploadCSV(steward.ID, c.Request().BodyStream())
	}
	if err != nil {
		if errors.Is(err, service.ErrAttendanceCSVInvalid) {
			return c.Status(400).JSON(fiber.Map{"error": "invalid_csv"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "upload_failed", "detail": err.Error()})
	}
	return c.JSON(result)
}

// GET /attendance/me?weeks=8 — recipient's own attendance trend.
func (h *AttendanceHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	weeks := 8
	if n, err := strconv.Atoi(c.Query("weeks", "8")); err == nil && n > 0 && n <= 26 {
		weeks = n
	}
	cells, err := h.svc.ForUser(user.ID, weeks)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": cells})
}
