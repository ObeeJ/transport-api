package email

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestSMTPIntegrationSend(t *testing.T) {
	if os.Getenv("SMTP_INTEGRATION_TEST") != "1" {
		t.Skip("set SMTP_INTEGRATION_TEST=1 to send a real SMTP test email")
	}

	cfg := SMTPConfig{
		Host:     os.Getenv("SMTP_HOST"),
		Port:     os.Getenv("SMTP_PORT"),
		Username: os.Getenv("SMTP_USERNAME"),
		Password: os.Getenv("SMTP_PASSWORD"),
		From:     os.Getenv("EMAIL_FROM"),
	}
	to := os.Getenv("SMTP_TEST_TO")
	if to == "" {
		to = cfg.Username
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	sender := New(cfg)
	if !sender.Configured() {
		t.Fatal("smtp is not configured")
	}
	if err := sender.send(ctx, to, "Akin SMTP test", "<p>Akin SMTP delivery works.</p>"); err != nil {
		t.Fatalf("send smtp test email: %v", err)
	}
}
