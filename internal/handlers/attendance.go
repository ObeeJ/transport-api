package handlers

import (
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/service"
)

type AttendanceHandler struct {
	svc *service.AttendanceService
}

func NewAttendanceHandler(svc *service.AttendanceService) *AttendanceHandler {
	return &AttendanceHandler{svc: svc}
}

var unsupportedFormats = map[string]string{
	".pdf":  "pdf",
	".docx": "docx",
	".doc":  "doc",
	".xlsx": "xlsx",
	".xls":  "xls",
}

// POST /steward/attendance — steward-only CSV upload.
func (h *AttendanceHandler) Upload(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)

	file, err := c.FormFile("file")
	var result *service.CSVUploadResult
	if err == nil && file != nil {
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if _, bad := unsupportedFormats[ext]; bad {
			return c.Status(400).JSON(fiber.Map{
				"error":  "unsupported_format",
				"detail": "We only accept CSV files. Open your " + ext[1:] + " file in Google Sheets or Excel, then File → Download → CSV and re-upload.",
			})
		}
		f, ferr := file.Open()
		if ferr != nil {
			return c.Status(400).JSON(fiber.Map{"error": "open_failed"})
		}
		defer f.Close()
		result, err = h.svc.UploadCSV(steward.ID, f)
	} else {
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

// POST /steward/attendance/manual — mark a single recipient attended/absent.
type manualOverrideInput struct {
	PseudonymousID string `json:"pseudonymousId"`
	WeekDate       string `json:"weekDate"` // any date in the target week, YYYY-MM-DD
	Attended       bool   `json:"attended"`
	Reason         string `json:"reason"`
}

func (h *AttendanceHandler) Manual(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	var in manualOverrideInput
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	date, err := time.Parse("2006-01-02", in.WeekDate)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_date", "detail": "weekDate must be YYYY-MM-DD"})
	}
	weekStart := models.WeekStartOf(date)
	if err := h.svc.ManualOverride(steward.ID, in.PseudonymousID, weekStart, in.Attended, in.Reason); err != nil {
		switch {
		case errors.Is(err, service.ErrRecipientNotFound):
			return c.Status(404).JSON(fiber.Map{"error": "recipient_not_found"})
		case errors.Is(err, service.ErrManualOverrideNeedsNote):
			return c.Status(400).JSON(fiber.Map{"error": "reason_required"})
		default:
			return c.Status(500).JSON(fiber.Map{"error": "override_failed"})
		}
	}
	return c.JSON(fiber.Map{"ok": true, "weekStart": weekStart.Format("2006-01-02")})
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
