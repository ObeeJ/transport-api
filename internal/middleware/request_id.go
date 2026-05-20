package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const RequestIDHeader = "X-Request-ID"
const RequestIDLocal = "request_id"

// RequestID — attaches a UUID to every request, echoing back via the
// X-Request-ID header so clients can quote it when reporting bugs.
// Honors an incoming X-Request-ID (e.g., from an upstream load balancer)
// rather than minting a new one.
func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rid := c.Get(RequestIDHeader)
		if rid == "" {
			rid = uuid.NewString()
		}
		c.Locals(RequestIDLocal, rid)
		c.Set(RequestIDHeader, rid)
		return c.Next()
	}
}

// GetRequestID — used by the logger and handlers when emitting structured logs.
func GetRequestID(c *fiber.Ctx) string {
	if v, ok := c.Locals(RequestIDLocal).(string); ok {
		return v
	}
	return ""
}
