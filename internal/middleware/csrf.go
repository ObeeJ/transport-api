package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strings"

	"github.com/gofiber/fiber/v2"
)

const (
	csrfCookieName = "akin_csrf"
	csrfHeaderName = "X-CSRF-Token"
)

// CookieOpts — minimal set of cookie attributes we care about. We don't
// use fiber.Cookie directly because Fiber v2 doesn't expose the
// `Partitioned` attribute (CHIPS), which we need to keep our cross-site
// cookies working in Firefox Total Cookie Protection and Chrome's
// upcoming third-party cookie deprecation.
type CookieOpts struct {
	Name        string
	Value       string
	Path        string
	SameSite    string // "Lax" | "None" | "Strict"
	Secure      bool
	HTTPOnly    bool
	Partitioned bool
	MaxAge      int // seconds; 0 = session
}

// SetCookie writes a `Set-Cookie` response header. Use this in place of
// c.Cookie() when you need attributes Fiber v2 doesn't expose.
func SetCookie(c *fiber.Ctx, o CookieOpts) {
	var b strings.Builder
	b.WriteString(o.Name)
	b.WriteByte('=')
	b.WriteString(o.Value)
	if o.Path != "" {
		b.WriteString("; Path=")
		b.WriteString(o.Path)
	}
	if o.MaxAge > 0 {
		b.WriteString("; Max-Age=")
		b.WriteString(itoaPositive(o.MaxAge))
	}
	if o.SameSite != "" {
		b.WriteString("; SameSite=")
		b.WriteString(o.SameSite)
	}
	if o.HTTPOnly {
		b.WriteString("; HttpOnly")
	}
	if o.Secure {
		b.WriteString("; Secure")
	}
	if o.Partitioned {
		// CHIPS — third-party cookie partitioned per top-level site. Required
		// by Firefox Total Cookie Protection + Chrome 3PCD. Browsers ignore
		// the attribute when they don't understand it, so this is safe to
		// always emit in production.
		b.WriteString("; Partitioned")
	}
	c.Response().Header.Add("Set-Cookie", b.String())
}

// itoaPositive — strconv-free formatter for small positive ints to avoid
// pulling strconv just for cookie Max-Age.
func itoaPositive(n int) string {
	if n == 0 {
		return "0"
	}
	out := make([]byte, 0, 6)
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	return string(out)
}

// CSRFCookie — issues the CSRF token cookie on every request that doesn't
// already have one. The token is non-HttpOnly by design so the frontend
// JS can read it and echo it back in the header. This is the harmless
// half of the double-submit pair — the protective check lives in CSRF().
//
// In production the cookie carries `SameSite=None; Secure; Partitioned`
// so it works as a cross-site cookie under modern browser privacy rules.
func CSRFCookie(prod bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tok := c.Cookies(csrfCookieName)
		if tok == "" {
			tok = newCSRFToken()
			sameSite := "Lax"
			if prod {
				sameSite = "None"
			}
			SetCookie(c, CookieOpts{
				Name:        csrfCookieName,
				Value:       tok,
				Path:        "/",
				SameSite:    sameSite,
				Secure:      prod,
				HTTPOnly:    false, // JS needs to read this (when document.cookie works)
				Partitioned: prod,
			})
		}
		// Store the effective token in Locals so /auth/csrf can return it in
		// the JSON body. This is what the frontend reads on browsers where
		// document.cookie can't see partitioned cross-site cookies.
		c.Locals(CSRFLocalKey, tok)
		return c.Next()
	}
}

// CSRFLocalKey — c.Locals key holding the current request's CSRF token,
// for handlers (like /auth/csrf) that need to echo it to the client.
const CSRFLocalKey = "csrf_token"

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
