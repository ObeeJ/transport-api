package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type WalletHandler struct {
	svc *service.WalletService
}

func NewWalletHandler(svc *service.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

func (h *WalletHandler) Balance(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	wallet, err := h.svc.Balance(user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "wallet_unavailable"})
	}
	return c.JSON(wallet)
}

func (h *WalletHandler) Transactions(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	txs, err := h.svc.Transactions(user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": txs})
}

func (h *WalletHandler) Debit(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		AmountKobo  int64  `json:"amountKobo"`
		Description string `json:"description"`
	}
	if err := c.BodyParser(&req); err != nil || req.AmountKobo < 100 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if err := h.svc.Debit(user.ID, req.AmountKobo, req.Description, ""); err != nil {
		if errors.Is(err, service.ErrInsufficientBalance) {
			return c.Status(422).JSON(fiber.Map{"error": "insufficient_balance"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "debit_failed"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
