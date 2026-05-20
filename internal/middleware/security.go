package middleware

import "github.com/gofiber/fiber/v2"

// SecurityHeaders — defense-in-depth response headers.
// HSTS is only added in production (it'd break localhost over HTTP).
func SecurityHeaders(prod bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Prevent the API from being framed.
		c.Set("X-Frame-Options", "DENY")
		// Stop content-type sniffing.
		c.Set("X-Content-Type-Options", "nosniff")
		// Don't leak the full URL via Referer when crossing origins.
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// Lock down what this origin is permitted to use (the API is JSON,
		// so we deny everything fancy).
		c.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()")
		if prod {
			// 6 months, include subdomains, preloadable.
			c.Set("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
		}
		return c.Next()
	}
}
