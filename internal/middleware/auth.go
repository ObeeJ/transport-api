package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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

// CurrentInstitution returns the institution the authed user belongs to. This
// is the single source of tenant identity for request scoping: it comes from
// the server-side user record loaded by RequireAuth, never from client input,
// so a caller cannot spoof another tenant. Returns uuid.Nil if unauthenticated
// (callers treat Nil as "no tenant scope" and must reject rather than widen).
func CurrentInstitution(c *fiber.Ctx) uuid.UUID {
	if u := CurrentUser(c); u != nil {
		return u.InstitutionID
	}
	return uuid.Nil
}

// RequireVerifiedEmailForWrites gates state-changing requests (POST/PUT/PATCH/
// DELETE) behind email verification, while letting reads through so unverified
// users can still browse the app. A small allowlist of path suffixes lets
// safety-critical or self-service writes through unconditionally — e.g. the SOS
// button and the email-verification endpoints themselves. Must run after
// RequireAuth.
func RequireVerifiedEmailForWrites(allowPathSuffixes ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		switch c.Method() {
		case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
			return c.Next()
		}
		path := c.Path()
		for _, s := range allowPathSuffixes {
			if strings.HasSuffix(path, s) {
				return c.Next()
			}
		}
		u := CurrentUser(c)
		if u == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not_authenticated"})
		}
		if !u.IsEmailVerified() {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "email_not_verified"})
		}
		return c.Next()
	}
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
