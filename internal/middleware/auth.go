package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

const UserContextKey = "user"

// HashToken returns the storage-side hash of a session token.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// RequireAuth loads the session from the cookie and rejects requests without one.
func RequireAuth(gdb *gorm.DB, cookieName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := c.Cookies(cookieName)
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not_authenticated"})
		}

		var session models.Session
		if err := gdb.Where("token_hash = ?", HashToken(token)).First(&session).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "session_invalid"})
		}
		if time.Now().After(session.ExpiresAt) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "session_expired"})
		}

		var user models.User
		if err := gdb.First(&user, "id = ?", session.UserID).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user_not_found"})
		}

		// Touch the session so we know it's alive (no need to update on every request — sample).
		_ = gdb.Model(&session).Update("last_seen_at", time.Now()).Error

		c.Locals(UserContextKey, &user)
		return c.Next()
	}
}

// CurrentUser returns the user attached to the request by RequireAuth, or nil.
func CurrentUser(c *fiber.Ctx) *models.User {
	u, _ := c.Locals(UserContextKey).(*models.User)
	return u
}

// RequireSteward gates a route to steward-or-admin users. Must run after RequireAuth.
func RequireSteward() fiber.Handler {
	return func(c *fiber.Ctx) error {
		u := CurrentUser(c)
		if u == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not_authenticated"})
		}
		if !u.IsSteward() {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "steward_required"})
		}
		return c.Next()
	}
}
