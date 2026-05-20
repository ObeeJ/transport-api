package middleware

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
)

func Logger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		dur := time.Since(start)
		slog.Info("request",
			"method", c.Method(),
			"path", c.Path(),
			"status", c.Response().StatusCode(),
			"dur_ms", dur.Milliseconds(),
			"ip", c.IP(),
			"request_id", GetRequestID(c),
		)
		return err
	}
}
