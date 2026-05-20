package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type RecipientHandler struct {
	svc *service.RecipientService
}

func NewRecipientHandler(svc *service.RecipientService) *RecipientHandler {
	return &RecipientHandler{svc: svc}
}

func (h *RecipientHandler) Apply(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	if !user.IsEmailVerified() {
		return c.Status(403).JSON(fiber.Map{"error": "email_not_verified"})
	}
	var req struct {
		WeeklyCostKobo     int64  `json:"weeklyCostKobo"`
		Situation          string `json:"situation"`
		DisbursementMethod string `json:"disbursementMethod"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	r, err := h.svc.Apply(service.ApplyInput{
		UserID:             user.ID,
		WeeklyCostKobo:     req.WeeklyCostKobo,
		Situation:          req.Situation,
		DisbursementMethod: req.DisbursementMethod,
	})
	if err != nil {
		return fail(c, err, "create_recipient_failed")
	}
	return c.Status(201).JSON(toRecipientResponse(r))
}

func (h *RecipientHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	r, err := h.svc.GetByUserID(user.ID)
	if err != nil {
		return fail(c, err, "lookup_failed")
	}
	return c.JSON(toRecipientResponse(r))
}

func (h *RecipientHandler) ResolveBank(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		BankCode      string `json:"bankCode"`
		AccountNumber string `json:"accountNumber"`
	}
	if err := c.BodyParser(&req); err != nil || req.BankCode == "" || req.AccountNumber == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	resolved, err := h.svc.ResolveBank(c.Context(), req.BankCode, req.AccountNumber)
	if err != nil {
		return fail(c, err, "could_not_resolve")
	}
	return c.JSON(resolved)
}

func (h *RecipientHandler) SaveBank(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		BankCode      string `json:"bankCode"`
		BankName      string `json:"bankName"`
		AccountNumber string `json:"accountNumber"`
	}
	if err := c.BodyParser(&req); err != nil || req.BankCode == "" || req.AccountNumber == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	bank, err := h.svc.SaveBank(c.Context(), service.SaveBankInput{
		UserID:        user.ID,
		BankCode:      req.BankCode,
		BankName:      req.BankName,
		AccountNumber: req.AccountNumber,
	})
	if err != nil {
		return fail(c, err, "save_bank_failed")
	}
	return c.JSON(bank)
}

func (h *RecipientHandler) GetBank(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	bank, err := h.svc.GetBank(user.ID)
	if err != nil {
		return fail(c, err, "lookup_failed")
	}
	return c.JSON(bank)
}
