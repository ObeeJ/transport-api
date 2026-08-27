package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/kyc"
	"github.com/obeej/akin/internal/middleware"
	"gorm.io/gorm"
)

type KYCHandler struct{ db *gorm.DB }

func NewKYCHandler(db *gorm.DB) *KYCHandler { return &KYCHandler{db: db} }

func (h *KYCHandler) SubmitNIN(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		NIN string `json:"nin"`
	}
	if err := c.BodyParser(&req); err != nil || len(req.NIN) < 11 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_nin"})
	}
	jobID, err := kyc.Submit(h.db, user.ID, "nin", map[string]any{"nin": req.NIN})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "submit_failed"})
	}
	return c.Status(202).JSON(fiber.Map{"jobId": jobID})
}

func (h *KYCHandler) Status(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	jobID, err := uuid.Parse(c.Params("jobId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_job_id"})
	}
	job, err := kyc.GetJob(h.db, jobID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "job_not_found"})
	}
	return c.JSON(fiber.Map{"status": job.Status, "jobId": job.ID})
}
