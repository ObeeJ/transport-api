package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type RidesHandler struct {
	svc *service.RideService
}

func NewRidesHandler(svc *service.RideService) *RidesHandler {
	return &RidesHandler{svc: svc}
}

func (h *RidesHandler) ListHubs(c *fiber.Ctx) error {
	hubs, err := h.svc.ListHubs()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": hubs})
}

func (h *RidesHandler) PublishTrip(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}

	var req struct {
		OriginHubID  string `json:"originHubId"`
		Destination  string `json:"destination"`
		DepartureAt  string `json:"departureAt"`
		TotalSeats   int    `json:"totalSeats"`
		VehiclePlate string `json:"vehiclePlate"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}

	trip, err := h.svc.PublishTrip(service.PublishTripInput{
		DriverID:     user.ID,
		OriginHubID:  req.OriginHubID,
		Destination:  req.Destination,
		DepartureAt:  req.DepartureAt,
		TotalSeats:   req.TotalSeats,
		VehiclePlate: req.VehiclePlate,
	})
	if err != nil {
		return fail(c, err, "create_failed")
	}
	return c.Status(201).JSON(trip)
}

func (h *RidesHandler) ListTrips(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}

	var hubID *uuid.UUID
	if raw := c.Query("hubId"); raw != "" {
		if id, err := uuid.Parse(raw); err == nil {
			hubID = &id
		}
	}

	limit := c.QueryInt("limit", 50)
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	cards, err := h.svc.ListTrips(hubID)
	if err != nil {
		return fail(c, err, "query_failed")
	}
	// Client-side truncation for now (upcoming trips are bounded by time window).
	if len(cards) > limit {
		cards = cards[:limit]
	}
	return c.JSON(fiber.Map{"items": cards})
}

func (h *RidesHandler) GetTrip(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	resp, err := h.svc.GetTrip(id, user.ID)
	if err != nil {
		return fail(c, err, "query_failed")
	}
	return c.JSON(resp)
}

func (h *RidesHandler) StartTrip(c *fiber.Ctx) error {
	return h.driverTransition(c, h.svc.StartTrip)
}

func (h *RidesHandler) CompleteTrip(c *fiber.Ctx) error {
	return h.driverTransition(c, h.svc.CompleteTrip)
}

func (h *RidesHandler) CancelTrip(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)

	if err := h.svc.CancelTrip(id, user.ID, body.Reason); err != nil {
		return fail(c, err, "update_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *RidesHandler) BookSeat(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	booking, err := h.svc.BookSeat(c.Context(), id, user.ID)
	if err != nil {
		return fail(c, err, "book_failed")
	}
	return c.Status(201).JSON(booking)
}

func (h *RidesHandler) CancelBooking(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	if err := h.svc.CancelBooking(id, user.ID); err != nil {
		return fail(c, err, "cancel_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *RidesHandler) MyDriverTrips(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	cards, err := h.svc.MyDriverTrips(user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": cards})
}

func (h *RidesHandler) MyRiderBookings(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	items, err := h.svc.MyRiderBookings(user.ID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}

func (h *RidesHandler) driverTransition(c *fiber.Ctx, fn func(uuid.UUID, uuid.UUID) error) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	if err := fn(id, user.ID); err != nil {
		return fail(c, err, "update_failed")
	}
	return c.JSON(fiber.Map{"ok": true})
}
