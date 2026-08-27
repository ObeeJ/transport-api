package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/storage"
	"gorm.io/gorm"
)

type EvidenceHandler struct {
	db *gorm.DB
	r2 *storage.R2Client
}

func NewEvidenceHandler(db *gorm.DB, r2 *storage.R2Client) *EvidenceHandler {
	return &EvidenceHandler{db: db, r2: r2}
}

func (h *EvidenceHandler) UploadURL(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Kind        string `json:"kind"`
		ContentType string `json:"contentType"`
	}
	if err := c.BodyParser(&req); err != nil || req.Kind == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	key := "evidence/" + user.ID.String() + "/" + req.Kind + "/" + uuid.New().String()

	var uploadURL string
	var err error
	if h.r2 != nil {
		uploadURL, err = h.r2.PresignedUploadURL(key, req.ContentType)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "presign_failed"})
		}
	} else {
		uploadURL = "https://r2.example.com/" + key + "?mock=true"
	}

	// Record the upload intent.
	type EvidenceUpload struct {
		ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
		UserID      uuid.UUID `gorm:"type:uuid;not null"`
		Kind        string    `gorm:"not null"`
		R2Key       string    `gorm:"not null"`
		R2Bucket    string    `gorm:"not null"`
		ContentType string
		UploadedAt  time.Time
	}
	record := EvidenceUpload{
		ID:          uuid.New(),
		UserID:      user.ID,
		Kind:        req.Kind,
		R2Key:       key,
		R2Bucket:    "evidence",
		ContentType: req.ContentType,
		UploadedAt:  time.Now(),
	}
	h.db.Table("evidence_uploads").Create(&record)

	return c.JSON(fiber.Map{"uploadUrl": uploadURL, "key": key, "evidenceId": record.ID})
}

func (h *EvidenceHandler) List(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var items []map[string]any
	h.db.Table("evidence_uploads").Where("user_id = ?", user.ID).Find(&items)
	return c.JSON(fiber.Map{"items": items})
}
