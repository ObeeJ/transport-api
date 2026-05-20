package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// HealthHandler — two endpoints for two different consumers:
//
//   /healthz      — liveness, always returns 200 if the process is up.
//                   Load balancers / orchestrators use this to decide
//                   "is the pod alive at all".
//
//   /readyz       — readiness, returns 503 if Postgres or (when wired)
//                   Redis is unreachable. Load balancers use this to
//                   decide "should I route real traffic here".
//
// Keeping them separate prevents a flaky DB from killing healthy pods
// during a partial outage — we want them to stop receiving traffic, not
// be killed and restarted.
type HealthHandler struct {
	db    *gorm.DB
	redis *redis.Client
}

func NewHealthHandler(db *gorm.DB, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: rdb}
}

func (h *HealthHandler) Live(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

func (h *HealthHandler) Ready(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
	defer cancel()

	checks := fiber.Map{}
	ok := true

	// Postgres
	if sqlDB, err := h.db.DB(); err == nil {
		if pingErr := sqlDB.PingContext(ctx); pingErr == nil {
			checks["postgres"] = "ok"
		} else {
			checks["postgres"] = "down: " + pingErr.Error()
			ok = false
		}
	} else {
		checks["postgres"] = "down: db handle unavailable"
		ok = false
	}

	// Redis (optional — only checked when wired)
	if h.redis != nil {
		if pingErr := h.redis.Ping(ctx).Err(); pingErr == nil {
			checks["redis"] = "ok"
		} else {
			checks["redis"] = "down: " + pingErr.Error()
			ok = false
		}
	} else {
		checks["redis"] = "not-configured"
	}

	if !ok {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status": "down",
			"checks": checks,
		})
	}
	return c.JSON(fiber.Map{"status": "ok", "checks": checks})
}
