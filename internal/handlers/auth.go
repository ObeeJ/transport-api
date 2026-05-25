package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/sanitize"
	"github.com/obeej/akin/internal/service"
)

type AuthHandler struct {
	svc *service.AuthService
	cfg *config.Config
}

func NewAuthHandler(svc *service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, cfg: cfg}
}

func (h *AuthHandler) Signup(c *fiber.Ctx) error {
	var req struct {
		Email           string `json:"email"`
		FirstName       string `json:"firstName"`
		LastName        string `json:"lastName"`
		Phone           string `json:"phone"`
		Password        string `json:"password"`
		AcceptedPrivacy bool   `json:"acceptedPrivacy"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	email, err := sanitize.Email(req.Email)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "email_invalid"})
	}
	firstName, err := sanitize.SingleLine(req.FirstName, sanitize.MaxName)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "first_name_invalid"})
	}
	// Last name is optional in the UI, so allow empty.
	lastName, err := sanitize.Optional(req.LastName, sanitize.MaxName)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "last_name_invalid"})
	}
	phone, err := sanitize.SingleLine(req.Phone, 32)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "phone_invalid"})
	}
	// Password is NOT trimmed — leading/trailing spaces are part of the
	// secret. We only enforce a max length to defend against DoS via
	// gigantic bcrypt inputs (bcrypt is slow on long strings).
	if len(req.Password) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "password_too_short"})
	}
	if len(req.Password) > 256 {
		return c.Status(400).JSON(fiber.Map{"error": "password_too_long"})
	}

	st, err := h.svc.Signup(service.SignupInput{
		Email:           email,
		FirstName:       firstName,
		LastName:        lastName,
		Phone:           phone,
		Password:        req.Password,
		AcceptedPrivacy: req.AcceptedPrivacy,
	})
	if err != nil {
		return fail(c, err, "signup_failed")
	}
	setSessionCookie(c, h.cfg, st.Token, st.Session.ExpiresAt)
	return c.Status(201).JSON(toUserResponse(st.User))
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	email, err := sanitize.Email(req.Email)
	if err != nil {
		// Return the generic invalid-credentials error so a bad email
		// can't be distinguished from a wrong password by an attacker.
		return c.Status(401).JSON(fiber.Map{"error": "invalid_credentials"})
	}
	if len(req.Password) == 0 || len(req.Password) > 256 {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_credentials"})
	}
	st, err := h.svc.Login(service.LoginInput{Email: email, Password: req.Password})
	if err != nil {
		return fail(c, err, "login_failed")
	}
	setSessionCookie(c, h.cfg, st.Token, st.Session.ExpiresAt)
	return c.JSON(toUserResponse(st.User))
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	token := c.Cookies(h.cfg.SessionCookieName)
	user := middleware.CurrentUser(c)
	if token != "" && user != nil {
		_ = h.svc.Logout(hashTokenForCookie(token), user.ID)
	}
	c.ClearCookie(h.cfg.SessionCookieName)
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	u := middleware.CurrentUser(c)
	if u == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	return c.JSON(toUserResponse(u))
}

func (h *AuthHandler) RequestPasswordReset(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	// Sanitize but swallow errors — endpoint is silent on bad input
	// (same reason as below: don't leak who is/isn't registered).
	if email, err := sanitize.Email(req.Email); err == nil {
		_ = h.svc.RequestPasswordReset(c.Context(), email)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AuthHandler) ConfirmPasswordReset(c *fiber.Ctx) error {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	token, err := sanitize.Alnum(req.Token, 128)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "reset_token_invalid"})
	}
	if len(req.NewPassword) == 0 || len(req.NewPassword) > 256 {
		return c.Status(400).JSON(fiber.Map{"error": "password_too_short"})
	}
	if err := h.svc.ConfirmPasswordReset(token, req.NewPassword); err != nil {
		return fail(c, err, "reset_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AuthHandler) RequestStewardOTP(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if email, err := sanitize.Email(req.Email); err == nil {
		_ = h.svc.RequestStewardOTP(c.Context(), email)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *AuthHandler) VerifyStewardOTP(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	email, err := sanitize.Email(req.Email)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "otp_invalid"})
	}
	code, err := sanitize.Code(req.Code, 6)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "otp_invalid"})
	}
	st, err := h.svc.VerifyStewardOTP(c.Context(), email, code)
	if err != nil {
		return fail(c, err, "otp_failed")
	}
	setSessionCookie(c, h.cfg, st.Token, st.Session.ExpiresAt)
	return c.JSON(toUserResponse(st.User))
}
