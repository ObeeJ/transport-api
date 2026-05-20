package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/middleware"
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
		Email     string `json:"email"`
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
		Phone     string `json:"phone"`
		Password  string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	st, err := h.svc.Signup(service.SignupInput{
		Email:     req.Email,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Phone:     req.Phone,
		Password:  req.Password,
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
	st, err := h.svc.Login(service.LoginInput{Email: req.Email, Password: req.Password})
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
	_ = h.svc.RequestPasswordReset(c.Context(), req.Email)
	// Always 200 — don't reveal whether email exists.
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
	if err := h.svc.ConfirmPasswordReset(req.Token, req.NewPassword); err != nil {
		return fail(c, err, "reset_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}
