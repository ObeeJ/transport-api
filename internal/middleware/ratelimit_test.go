package middleware

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

// TestLimiter — 3 requests allowed in a 1s window, the 4th must be blocked,
// and after the window elapses we're allowed to make new requests again.
func TestLimiter_AllowsThenBlocksThenResets(t *testing.T) {
	app := fiber.New()
	lim := NewLimiter(3, 200*time.Millisecond, func(c *fiber.Ctx) string { return "k" }, "blocked")
	app.Use(lim.Middleware())
	app.Get("/ping", func(c *fiber.Ctx) error { return c.SendString("ok") })

	hit := func() int {
		req := httptest.NewRequest("GET", "/ping", nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		return resp.StatusCode
	}

	for i := 0; i < 3; i++ {
		if got := hit(); got != 200 {
			t.Fatalf("hit %d: got %d, want 200", i+1, got)
		}
	}
	if got := hit(); got != fiber.StatusTooManyRequests {
		t.Fatalf("4th hit: got %d, want 429", got)
	}

	// Window elapses → allowed again.
	time.Sleep(220 * time.Millisecond)
	if got := hit(); got != 200 {
		t.Fatalf("after window: got %d, want 200", got)
	}
}

func TestExtractJSONString_HandlesBasic(t *testing.T) {
	body := []byte(`{"email":"ayo@example.com","password":"hunter22"}`)
	idx := indexJSONField(body, "email")
	if idx < 0 {
		t.Fatal("indexJSONField: not found")
	}
	got := extractJSONString(body, idx)
	if got != "ayo@example.com" {
		t.Fatalf("got %q, want ayo@example.com", got)
	}
}

func TestExtractJSONString_HandlesWhitespace(t *testing.T) {
	body := []byte(`{ "email" :   "ngozi@school.edu.ng" }`)
	idx := indexJSONField(body, "email")
	if idx < 0 {
		t.Fatal("indexJSONField: not found")
	}
	got := extractJSONString(body, idx)
	if got != "ngozi@school.edu.ng" {
		t.Fatalf("got %q, want ngozi@school.edu.ng", got)
	}
}

func TestByIPAndEmail_IncludesEmail(t *testing.T) {
	app := fiber.New()
	var captured string
	app.Post("/x", func(c *fiber.Ctx) error {
		captured = ByIPAndEmail(c)
		return c.SendString("ok")
	})
	req := httptest.NewRequest("POST", "/x", strings.NewReader(`{"email":"a@b.com"}`))
	req.Header.Set("Content-Type", "application/json")
	if _, err := app.Test(req, -1); err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if !strings.Contains(captured, "a@b.com") {
		t.Fatalf("expected key to include email, got %q", captured)
	}
}
