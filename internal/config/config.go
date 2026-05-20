package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	APIPort           string
	AppEnv            string
	DatabaseURL       string
	RedisURL          string
	SessionCookieName string
	SessionTTL        time.Duration
	SessionKey        string
	PaystackSecretKey string
	PaystackPublicKey string
	APIBaseURL        string
	AppBaseURL        string
	CORSAllowedOrigin string
	// MockTransfers — when true, the payout confirm flow skips the real
	// Paystack Transfer call and marks the payout succeeded locally.
	// Set this in development if your Paystack account is "starter" and
	// can't initiate third-party transfers yet.
	MockTransfers bool

	// Email (Resend)
	ResendAPIKey        string
	EmailFrom           string
	ResendWebhookSecret string // from Resend dashboard → Webhooks → signing secret
}

func Load() (*Config, error) {
	c := &Config{
		APIPort:           env("API_PORT", "8080"),
		AppEnv:            env("APP_ENV", "development"),
		DatabaseURL:       env("DATABASE_URL", "postgres://akin:akin_dev@localhost:55432/akin?sslmode=disable"),
		RedisURL:          env("REDIS_URL", "redis://localhost:6379/0"),
		SessionCookieName: env("SESSION_COOKIE_NAME", "akin_session"),
		SessionKey:        env("SESSION_KEY", ""),
		PaystackSecretKey: env("PAYSTACK_SECRET_KEY", ""),
		PaystackPublicKey: env("PAYSTACK_PUBLIC_KEY", ""),
		APIBaseURL:        env("API_BASE_URL", "http://localhost:8080"),
		AppBaseURL:        env("APP_BASE_URL", "http://localhost:5173"),
		CORSAllowedOrigin: env("CORS_ALLOWED_ORIGIN", "http://localhost:5173"),
		MockTransfers:     env("MOCK_TRANSFERS", "false") == "true",
		ResendAPIKey:        env("RESEND_API_KEY", ""),
		EmailFrom:           env("EMAIL_FROM", "Akin. <onboarding@resend.dev>"),
		ResendWebhookSecret: env("RESEND_WEBHOOK_SECRET", ""),
	}

	hours, err := strconv.Atoi(env("SESSION_TTL_HOURS", "720"))
	if err != nil {
		return nil, fmt.Errorf("invalid SESSION_TTL_HOURS: %w", err)
	}
	c.SessionTTL = time.Duration(hours) * time.Hour

	if err := c.validate(); err != nil {
		return nil, err
	}

	return c, nil
}

// validate runs at boot — refuses to start with obviously-wrong secrets
// in production. Development gets warnings for the same checks, surfaced
// in main.go via the logger.
func (c *Config) validate() error {
	if c.AppEnv == "production" {
		if len(c.SessionKey) < 32 {
			return fmt.Errorf("SESSION_KEY must be at least 32 chars in production (got %d) — generate with: openssl rand -hex 32", len(c.SessionKey))
		}
		if !c.PaystackConfigured() {
			return fmt.Errorf("PAYSTACK_SECRET_KEY must be set in production")
		}
		if c.CORSAllowedOrigin == "http://localhost:5173" {
			return fmt.Errorf("CORS_ALLOWED_ORIGIN is still the dev default — set it to your real frontend URL")
		}
	}
	// Dev/staging — soft warnings via boot logs are handled in main.go.
	return nil
}

// Warnings returns boot-time warnings that don't block startup but
// should appear in logs. Used by main.go.
func (c *Config) Warnings() []string {
	var ws []string
	if c.AppEnv != "production" {
		if c.SessionKey != "" && len(c.SessionKey) < 32 {
			ws = append(ws, "SESSION_KEY is shorter than 32 chars — fine for dev, replace before prod")
		}
		if c.SessionKey == "" {
			ws = append(ws, "SESSION_KEY is empty — sessions will still work but tokens are not bound to a server-side secret")
		}
	}
	return ws
}

func (c *Config) PaystackConfigured() bool {
	return c.PaystackSecretKey != "" && c.PaystackSecretKey != "sk_test_replace_me"
}

func (c *Config) EmailConfigured() bool {
	return c.ResendAPIKey != "" && c.ResendAPIKey != "re_replace_me"
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
