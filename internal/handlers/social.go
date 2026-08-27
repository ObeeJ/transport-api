package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/social"
	"github.com/obeej/akin/internal/transparency"
	"gorm.io/gorm"
)

type SocialHandler struct{ db *gorm.DB }

func NewSocialHandler(db *gorm.DB) *SocialHandler { return &SocialHandler{db: db} }

func (h *SocialHandler) CreatePost(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Kind       string         `json:"kind"`
		Body       string         `json:"body"`
		Visibility string         `json:"visibility"`
		Refs       map[string]any `json:"refs"`
	}
	if err := c.BodyParser(&req); err != nil || req.Body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.Visibility == "" {
		req.Visibility = "public"
	}
	if req.Kind == "" {
		req.Kind = "general"
	}
	post, err := social.CreatePost(h.db, user.ID, req.Kind, req.Body, req.Visibility, req.Refs)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create_failed"})
	}
	// Release transparency hold if this is a thank-you post.
	if req.Kind == "thank_you" || req.Kind == "sponsor_ack" {
		_ = transparency.Release(h.db, user.ID)
		_ = social.IncrementStreak(h.db, user.ID, "posting")
	}
	return c.Status(201).JSON(post)
}

func (h *SocialHandler) Feed(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	tab := c.Query("tab", "foryou")
	limit := c.QueryInt("limit", 20)
	posts, err := social.Feed(h.db, user.ID, tab, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": posts})
}

func (h *SocialHandler) Clap(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Count int `json:"count"`
	}
	_ = c.BodyParser(&req)
	if req.Count == 0 {
		req.Count = 1
	}
	return c.JSON(fiber.Map{"ok": social.Clap(h.db, postID, user.ID, req.Count) == nil})
}

func (h *SocialHandler) ToggleFollow(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	followeeID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	following, err := social.ToggleFollow(h.db, user.ID, followeeID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "toggle_failed"})
	}
	return c.JSON(fiber.Map{"following": following})
}

func (h *SocialHandler) Streaks(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	streaks, err := social.GetStreaks(h.db, user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": streaks})
}

func (h *SocialHandler) TransparencyHolds(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	hold, _ := transparency.GetHold(h.db, user.ID)
	if hold == nil {
		return c.JSON(fiber.Map{"items": []any{}})
	}
	return c.JSON(fiber.Map{"items": []any{hold}})
}
