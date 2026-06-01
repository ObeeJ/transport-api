package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type RatingHandler struct {
	svc *service.RatingService
}

func NewRatingHandler(svc *service.RatingService) *RatingHandler {
	return &RatingHandler{svc: svc}
}

// POST /trips/:id/ratings — rider rates driver or driver rates rider.
func (h *RatingHandler) Submit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		SubjectID string `json:"subjectId"`
		Role      string `json:"role"`
		Score     int    `json:"score"`
		Note      string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	subjectID, err := uuid.Parse(req.SubjectID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_subject_id"})
	}
	rating, err := h.svc.Submit(service.SubmitRatingInput{
		TripID:    tripID,
		RaterID:   user.ID,
		SubjectID: subjectID,
		Role:      req.Role,
		Score:     req.Score,
		Note:      req.Note,
	})
	if err != nil {
		return fail(c, err, "rating_failed")
	}
	return c.Status(201).JSON(rating)
}

// GET /driver/impact — driver's own impact credits.
func (h *RatingHandler) MyImpact(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	impact, err := h.svc.DriverImpact(user.ID)
	if err != nil {
		return c.JSON(fiber.Map{"seatsTotal": 0, "tripsTotal": 0, "kmTotal": 0.0})
	}
	return c.JSON(impact)
}

// GET /driver/average — driver's own average rating.
func (h *RatingHandler) MyAverage(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	avg, count, err := h.svc.DriverAverage(user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"average": avg, "count": count})
}
