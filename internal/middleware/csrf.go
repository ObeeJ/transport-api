package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"

	"github.com/gofiber/fiber/v2"
)

const (
	csrfCookieName = "akin_csrf"
	csrfHeaderName = "X-CSRF-Token"
)

// CSRFCookie — issues the CSRF token cookie on every request that doesn't
// already have one. The token is non-HttpOnly by design so the frontend
// JS can read it and echo it back in the header. This is the harmless
// half of the double-submit pair — the protective check lives in CSRF().
func CSRFCookie(prod bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if c.Cookies(csrfCookieName) == "" {
			tok := newCSRFToken()
			sameSite := "Lax"
			if prod {
				sameSite = "None"
			}
			c.Cookie(&fiber.Cookie{
				Name:     csrfCookieName,
				Value:    tok,
				Path:     "/",
				HTTPOnly: false, // JS needs to read this
				SameSite: sameSite,
				Secure:   prod,
			})
		}
		return c.Next()
	}
}

// CSRF — verifies that the value of X-CSRF-Token matches the akin_csrf
// cookie. Safe methods (GET, HEAD, OPTIONS) skip the check.
//
// Paths under /webhooks/ are skipped — third-party services (Paystack,
// Flutterwave) can't carry our cookie; they prove themselves via
// signature verification instead.
func CSRF() fiber.Handler {
	return func(c *fiber.Ctx) error {
		switch c.Method() {
		case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
			return c.Next()
		}
		path := c.Path()
		if len(path) >= 9 && path[:9] == "/webhooks" {
			return c.Next()
		}
		cookie := c.Cookies(csrfCookieName)
		header := c.Get(csrfHeaderName)
		if cookie == "" || header == "" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "csrf_missing"})
		}
		if subtle.ConstantTimeCompare([]byte(cookie), []byte(header)) != 1 {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "csrf_mismatch"})
		}
		return c.Next()
	}
}

func newCSRFToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
