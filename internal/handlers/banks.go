package handlers

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/payments"
)

type BanksHandler struct {
	provider payments.DisbursementProvider
	mu       sync.Mutex
	cache    []payments.Bank
	at       time.Time
}

func NewBanksHandler(p payments.DisbursementProvider) *BanksHandler {
	return &BanksHandler{provider: p}
}

const bankCacheTTL = 30 * time.Minute

func (h *BanksHandler) List(c *fiber.Ctx) error {
	if h.provider == nil {
		return c.Status(503).JSON(fiber.Map{"error": "payments_not_configured"})
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cache != nil && time.Since(h.at) < bankCacheTTL {
		return c.JSON(fiber.Map{"items": h.cache})
	}
	banks, err := h.provider.ListBanks(c.Context())
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "banks_fetch_failed", "detail": err.Error()})
	}
	h.cache = banks
	h.at = time.Now()
	return c.JSON(fiber.Map{"items": banks})
}
