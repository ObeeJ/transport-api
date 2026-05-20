package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/service"
)

type ReportHandler struct {
	svc *service.ReportService
}

func NewReportHandler(svc *service.ReportService) *ReportHandler {
	return &ReportHandler{svc: svc}
}

// GET /reports/monthly?month=2026-05 — public transparency report.
// Defaults to the current month if no query param provided.
func (h *ReportHandler) Monthly(c *fiber.Ctx) error {
	forDate := time.Now()
	if m := c.Query("month"); m != "" {
		if t, err := time.Parse("2006-01", m); err == nil {
			forDate = t
		}
	}
	report, err := h.svc.Generate(forDate)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "report_failed"})
	}
	return c.JSON(report)
}
