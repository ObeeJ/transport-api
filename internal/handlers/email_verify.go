package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type EmailVerifyHandler struct {
	svc        *service.EmailVerifyService
	appBaseURL string
}

func NewEmailVerifyHandler(svc *service.EmailVerifyService, appBaseURL string) *EmailVerifyHandler {
	return &EmailVerifyHandler{svc: svc, appBaseURL: appBaseURL}
}

// POST /auth/email/verify/send — issues a verification email.
func (h *EmailVerifyHandler) Send(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	if _, err := h.svc.IssueToken(c.Context(), user.ID); err != nil {
		return fail(c, err, "issue_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GET /auth/email/verify/confirm?token=...
// No auth required — the token is the credential.
// Redirects to the frontend app on success or failure.
func (h *EmailVerifyHandler) ConfirmViaLink(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return c.Redirect(h.appBaseURL+"/account/verify-email?error=missing_token", 302)
	}

	userID, err := h.svc.FindUserByToken(token)
	if err != nil {
		return c.Redirect(h.appBaseURL+"/account/verify-email?error=invalid_token", 302)
	}

	if err := h.svc.Confirm(userID, token); err != nil {
		return c.Redirect(h.appBaseURL+"/account/verify-email?error=invalid_token", 302)
	}

	return c.Redirect(h.appBaseURL+"/account?verified=1", 302)
}

// POST /auth/email/verify/confirm — manual token confirmation (fallback).
func (h *EmailVerifyHandler) Confirm(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		Token string `json:"token"`
	}
	if err := c.BodyParser(&req); err != nil || req.Token == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if err := h.svc.Confirm(user.ID, req.Token); err != nil {
		return fail(c, err, "confirm_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}
