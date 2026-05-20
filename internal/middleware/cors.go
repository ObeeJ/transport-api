package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS(allowedOrigin string) fiber.Handler {
	return cors.New(cors.Config{
		AllowOrigins:     allowedOrigin,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Requested-With,X-CSRF-Token",
		AllowCredentials: true,
		MaxAge:           600,
	})
}
