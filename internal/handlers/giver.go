package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type GiverHandler struct {
	svc *service.DepositService
}

func NewGiverHandler(svc *service.DepositService) *GiverHandler {
	return &GiverHandler{svc: svc}
}

func (h *GiverHandler) InitializeDeposit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		AmountKobo int64  `json:"amountKobo"`
		Frequency  string `json:"frequency"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	result, err := h.svc.Initialize(c.Context(), service.InitializeDepositInput{
		UserID:     user.ID,
		UserEmail:  user.Email,
		AmountKobo: req.AmountKobo,
		Frequency:  req.Frequency,
	})
	if err != nil {
		return fail(c, err, "payments_initialize_failed")
	}
	return c.JSON(fiber.Map{"authorizationUrl": result.AuthorizationURL, "reference": result.Reference})
}

func (h *GiverHandler) Activity(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	matrix, err := h.svc.Activity(c.Context(), user.ID, 4)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "activity_failed"})
	}
	return c.JSON(fiber.Map{"weeks": matrix})
}

func (h *GiverHandler) GetDeposit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	deposit, err := h.svc.Poll(c.Context(), c.Params("reference"), user.ID)
	if err != nil {
		return fail(c, err, "lookup_failed")
	}
	return c.JSON(toDepositResponse(deposit))
}
