package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

type Sender struct {
	cfg SMTPConfig
}

func New(cfg SMTPConfig) *Sender {
	if cfg.Port == "" {
		cfg.Port = "587"
	}
	return &Sender{cfg: cfg}
}

func (s *Sender) Configured() bool {
	return s.cfg.Host != "" && s.cfg.Username != "" && s.cfg.Password != ""
}

// SendVerification sends a click-to-verify link. The token is embedded in
// the URL — the user never sees or types it.
func (s *Sender) SendVerification(ctx context.Context, toEmail, token, appBaseURL string) error {
	verifyURL := fmt.Sprintf("%s/account/verify-email?token=%s", appBaseURL, token)
	html := verifyHTML(toEmail, verifyURL)
	return s.send(ctx, toEmail, "Verify your Akin email", html)
}

func (s *Sender) SendPasswordReset(ctx context.Context, toEmail, token, appBaseURL string) error {
	resetURL := fmt.Sprintf("%s/reset-password/confirm?token=%s", appBaseURL, token)
	html := resetHTML(toEmail, resetURL)
	return s.send(ctx, toEmail, "Reset your Akin password", html)
}

func (s *Sender) send(ctx context.Context, to, subject, html string) error {
	if !s.Configured() {
		slog.Warn("email not configured — skipping send", "to", to, "subject", subject)
		return nil
	}
	if err := s.sendSMTP(ctx, to, subject, html); err != nil {
		slog.Error("email send failed", "to", to, "err", err)
		return fmt.Errorf("email send: %w", err)
	}
	slog.Info("email sent", "to", to, "subject", subject)
	return nil
}

func (s *Sender) sendSMTP(ctx context.Context, to, subject, html string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	fromAddr, err := mail.ParseAddress(s.cfg.From)
	if err != nil {
		return fmt.Errorf("parse EMAIL_FROM: %w", err)
	}
	toAddr, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("parse recipient: %w", err)
	}

	addr := s.cfg.Host + ":" + s.cfg.Port
	message := buildMessage(s.cfg.From, toAddr.String(), subject, html)
	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)

	dialer := net.Dialer{Timeout: 15 * time.Second}
	var conn net.Conn
	if s.cfg.Port == "465" {
		conn, err = tls.DialWithDialer(&dialer, "tcp", addr, &tls.Config{ServerName: s.cfg.Host})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return err
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return err
	}
	defer client.Close()

	if s.cfg.Port != "465" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: s.cfg.Host}); err != nil {
			return err
		}
	}
	if err := client.Auth(auth); err != nil {
		return err
	}
	if err := client.Mail(fromAddr.Address); err != nil {
		return err
	}
	if err := client.Rcpt(toAddr.Address); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(message)); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func buildMessage(from, to, subject, html string) string {
	headers := map[string]string{
		"From":         from,
		"To":           to,
		"Subject":      mime.QEncoding.Encode("utf-8", subject),
		"MIME-Version": "1.0",
		"Content-Type": "text/html; charset=UTF-8",
	}
	var b strings.Builder
	for key, value := range headers {
		b.WriteString(key)
		b.WriteString(": ")
		b.WriteString(value)
		b.WriteString("\r\n")
	}
	b.WriteString("\r\n")
	b.WriteString(html)
	return b.String()
}

// ── Templates ─────────────────────────────────────────────────────────────────

func verifyHTML(toEmail, verifyURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="margin:0;padding:0;background:#F5EFE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5EFE6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FBF8F2;border-radius:18px;border:1px solid #E2DBCB;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:24px;font-weight:600;color:#1B2A4E;letter-spacing:-0.03em;line-height:1;">akin</td>
                <td style="font-size:24px;font-weight:600;color:#D97757;letter-spacing:-0.03em;line-height:1;padding-left:1px;">.</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 40px 0;">
            <h1 style="margin:0;font-size:26px;font-weight:500;color:#1B2A4E;letter-spacing:-0.02em;line-height:1.15;">Verify your email.</h1>
            <p style="margin:14px 0 0;font-size:14px;color:#8B8680;line-height:1.65;">
              Confirm <strong style="color:#1A1A1A;font-weight:500;">%s</strong> to finish setting up your Akin account.
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:28px 40px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1B2A4E;border-radius:14px;">
                  <a href="%s" style="display:inline-block;padding:14px 28px;color:#FBF8F2;font-size:14px;font-weight:500;text-decoration:none;letter-spacing:-0.01em;">
                    Verify email &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:12px;color:#C9C3B8;">
              Button not working? Copy this link:<br>
              <a href="%s" style="color:#1B2A4E;word-break:break-all;">%s</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:32px 40px;">
            <hr style="border:none;border-top:1px solid #E2DBCB;margin:0 0 20px;">
            <p style="margin:0;font-size:11px;color:#C9C3B8;line-height:1.6;">
              This link expires in 24 hours. If you didn't create an Akin account, you can safely ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`, toEmail, verifyURL, verifyURL, verifyURL)
}

func resetHTML(toEmail, resetURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#F5EFE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5EFE6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FBF8F2;border-radius:18px;border:1px solid #E2DBCB;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:24px;font-weight:600;color:#1B2A4E;letter-spacing:-0.03em;">akin</td>
                <td style="font-size:24px;font-weight:600;color:#D97757;letter-spacing:-0.03em;padding-left:1px;">.</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px 0;">
            <h1 style="margin:0;font-size:26px;font-weight:500;color:#1B2A4E;letter-spacing:-0.02em;line-height:1.15;">Reset your password.</h1>
            <p style="margin:14px 0 0;font-size:14px;color:#8B8680;line-height:1.65;">
              Click below to set a new password for <strong style="color:#1A1A1A;font-weight:500;">%s</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1B2A4E;border-radius:14px;">
                  <a href="%s" style="display:inline-block;padding:14px 28px;color:#FBF8F2;font-size:14px;font-weight:500;text-decoration:none;">
                    Reset password &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <hr style="border:none;border-top:1px solid #E2DBCB;margin:0 0 20px;">
            <p style="margin:0;font-size:11px;color:#C9C3B8;line-height:1.6;">
              If you didn't request this, ignore it — your password won't change.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, toEmail, resetURL)
}
