// Package idempotency provides a Fiber middleware that enforces
// Idempotency-Key semantics on money-mutating endpoints.
//
// Flow:
//  1. Read Idempotency-Key header (required on POST money endpoints).
//  2. If a settled record exists → return cached response immediately.
//  3. If a pending record exists → 409 (in-flight).
//  4. Otherwise → insert pending record, run handler, settle record.
package idempotency

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
)

// Middleware returns a Fiber handler that enforces idempotency.
// Pass the Store and whether the key is required (true for money endpoints).
func Middleware(store *Store, required bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := c.Get("Idempotency-Key")
		if key == "" {
			if required {
				return c.Status(400).JSON(fiber.Map{"error": "idempotency_key_required"})
			}
			return c.Next()
		}

		user := middleware.CurrentUser(c)
		if user == nil {
			return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
		}

		existing, err := store.Get(key)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "idempotency_check_failed"})
		}

		if existing != nil {
			if existing.ResponseCode != nil {
				// Settled — replay cached response.
				c.Set("Idempotency-Replay", "true")
				return c.Status(*existing.ResponseCode).JSON(existing.ResponseBody)
			}
			// In-flight (no response yet) — another request is processing.
			return c.Status(409).JSON(fiber.Map{"error": "idempotency_in_flight"})
		}

		requestHash := HashBody(c.Body())
		if err := store.Create(key, user.ID, c.Path(), requestHash); err != nil {
			// Unique violation = concurrent request just inserted it.
			return c.Status(409).JSON(fiber.Map{"error": "idempotency_in_flight"})
		}

		// Run the actual handler.
		if err := c.Next(); err != nil {
			return err
		}

		// Settle with whatever the handler wrote.
		_ = store.Settle(key, c.Response().StatusCode(), c.Response().Body())
		return nil
	}
}
