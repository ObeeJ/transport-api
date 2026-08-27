package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/admin"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/pricing"
	"gorm.io/gorm"
)

type AdminHandler struct{ db *gorm.DB }

func NewAdminHandler(db *gorm.DB) *AdminHandler { return &AdminHandler{db: db} }

func (h *AdminHandler) Metrics(c *fiber.Ctx) error {
	m, err := admin.GetMetrics(h.db)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(m)
}

func (h *AdminHandler) UpdatePricing(c *fiber.Ctx) error {
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	patch["updated_at"] = time.Now()
	if u := middleware.CurrentUser(c); u != nil {
		patch["updated_by"] = u.ID
	}
	if err := h.db.Table("pricing_settings").Where("id = 1").Updates(patch).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update_failed"})
	}
	pricing.InvalidateCache()
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AdminHandler) ReviewDriver(c *fiber.Ctx) error {
	adminUser := middleware.CurrentUser(c)
	userID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_user_id"})
	}
	var req struct {
		Decision string `json:"decision"`
		Notes    string `json:"notes"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if err := h.db.Table("driver_profiles").Where("user_id = ?", userID).
		Update("status", req.Decision).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update_failed"})
	}
	_ = admin.LogAction(h.db, adminUser.ID, &userID, nil, "driver_review_"+req.Decision, req.Notes, nil)
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AdminHandler) ReviewEvidence(c *fiber.Ctx) error {
	adminUser := middleware.CurrentUser(c)
	evidenceID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Decision string `json:"decision"`
		Notes    string `json:"notes"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if err := h.db.Table("evidence_uploads").Where("id = ?", evidenceID).Updates(map[string]any{
		"review_status": req.Decision,
		"review_notes":  req.Notes,
		"reviewed_by":   adminUser.ID,
	}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AdminHandler) Reports(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"items": []any{}})
}

func (h *AdminHandler) GetPricing(c *fiber.Ctx) error {
	var s pricing.Settings
	if err := h.db.First(&s).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(s)
}

func (h *AdminHandler) PendingDrivers(c *fiber.Ctx) error {
	type Row struct {
		UserID      string `json:"userId"`
		FirstName   string `json:"firstName"`
		LastName    string `json:"lastName"`
		Email       string `json:"email"`
		VehiclePlate string `json:"vehiclePlate"`
		VehicleType string `json:"vehicleType"`
		SubmittedAt string `json:"submittedAt"`
	}
	var rows []Row
	h.db.Raw(`SELECT dp.user_id, u.first_name, u.last_name, u.email,
		dp.vehicle_plate, dp.vehicle_type, dp.created_at AS submitted_at
		FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
		WHERE dp.status = 'pending' ORDER BY dp.created_at ASC`).Scan(&rows)
	return c.JSON(fiber.Map{"items": rows})
}
