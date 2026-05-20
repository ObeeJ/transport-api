package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/service"
)

type PoolHandler struct {
	svc *service.PoolService
}

func NewPoolHandler(svc *service.PoolService) *PoolHandler {
	return &PoolHandler{svc: svc}
}

func (h *PoolHandler) ThisWeek(c *fiber.Ctx) error {
	result, err := h.svc.ThisWeek()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{
		"totalKobo":    result.TotalKobo,
		"depositCount": result.DepositCount,
		"uniqueGivers": result.UniqueGivers,
		"hidden":       result.Hidden,
		"hiddenReason": result.HiddenReason,
	})
}
