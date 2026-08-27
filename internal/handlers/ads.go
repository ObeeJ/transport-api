package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/ads"
	"github.com/obeej/akin/internal/middleware"
	"gorm.io/gorm"
)

type AdsHandler struct{ db *gorm.DB }

func NewAdsHandler(db *gorm.DB) *AdsHandler { return &AdsHandler{db: db} }

// Create submits a new ad. Any authenticated user can be an advertiser —
// there's no separate advertiser role; the ad starts 'pending' either way.
func (h *AdsHandler) Create(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		CreativeKey string         `json:"creativeKey"`
		CTAURL      string         `json:"ctaUrl"`
		BudgetKobo  int64          `json:"budgetKobo"`
		Target      map[string]any `json:"target"`
	}
	if err := c.BodyParser(&req); err != nil || req.CreativeKey == "" || req.CTAURL == "" || req.BudgetKobo < 100 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	ad, err := ads.Create(h.db, user.ID, req.CreativeKey, req.CTAURL, req.BudgetKobo, req.Target)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create_failed"})
	}
	return c.Status(201).JSON(ad)
}

// Mine lists the current user's own ads.
func (h *AdsHandler) Mine(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	items, err := ads.ListMine(h.db, user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}

// Pause lets an advertiser stop serving their own ad early.
func (h *AdsHandler) Pause(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	if err := ads.Pause(h.db, id, user.ID); err != nil {
		if err == ads.ErrNotOwner {
			return c.Status(403).JSON(fiber.Map{"error": "not_owner"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "pause_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// Review is the admin decision on a pending ad — approve or reject.
func (h *AdsHandler) Review(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Decision string `json:"decision"` // approve | reject
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if err := ads.Approve(h.db, id, req.Decision == "approve"); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "review_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
