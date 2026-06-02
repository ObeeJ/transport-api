package handlers

import (
	"math"
	"sort"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/sanitize"
	"github.com/obeej/akin/internal/service"
)

// haversineKm returns the great-circle distance in km between two lat/lng points.
func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

type RidesHandler struct {
	svc *service.RideService
}

func NewRidesHandler(svc *service.RideService) *RidesHandler {
	return &RidesHandler{svc: svc}
}

func (h *RidesHandler) ListHubs(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)

	var lat, lng *float64
	if rawLat := c.Query("lat"); rawLat != "" {
		if v, err := strconv.ParseFloat(rawLat, 64); err == nil {
			lat = &v
		}
	}
	if rawLng := c.Query("lng"); rawLng != "" {
		if v, err := strconv.ParseFloat(rawLng, 64); err == nil {
			lng = &v
		}
	}

	hubs, err := h.svc.ListHubs(c.QueryBool("active"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}

	type hubItem struct {
		ID         string   `json:"id"`
		Name       string   `json:"name"`
		Lat        float64  `json:"lat,omitempty"`
		Lng        float64  `json:"lng,omitempty"`
		DistanceKm *float64 `json:"distanceKm,omitempty"`
	}

	items := make([]hubItem, len(hubs))
	for i, h := range hubs {
		items[i] = hubItem{ID: h.ID.String(), Name: h.Name, Lat: h.Lat, Lng: h.Lng}
		if lat != nil && lng != nil && (h.Lat != 0 || h.Lng != 0) {
			d := haversineKm(*lat, *lng, h.Lat, h.Lng)
			items[i].DistanceKm = &d
		}
	}

	// Sort by distance when coords provided, otherwise alphabetical.
	if lat != nil && lng != nil {
		sort.Slice(items, func(a, b int) bool {
			da := math.MaxFloat64
			if items[a].DistanceKm != nil {
				da = *items[a].DistanceKm
			}
			db := math.MaxFloat64
			if items[b].DistanceKm != nil {
				db = *items[b].DistanceKm
			}
			return da < db
		})
	}

	// Frequent hubs for the current user — pinned at top when no GPS.
	var frequentIDs []string
	if user != nil && lat == nil {
		frequentIDs, _ = h.svc.FrequentHubIDs(user.ID, 3)
	}

	return c.JSON(fiber.Map{"items": items, "frequentIds": frequentIDs})
}

func (h *RidesHandler) FrequentHubs(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	ids, err := h.svc.FrequentHubIDs(user.ID, 3)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"ids": ids})
}

func (h *RidesHandler) TripDemand(c *fiber.Ctx) error {
	rows, err := h.svc.TripDemand()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": rows})
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
	destination, err := sanitize.SingleLine(req.Destination, sanitize.MaxDestination)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "destination_invalid"})
	}
	if req.TotalSeats < 1 || req.TotalSeats > 8 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_seats"})
	}
	trip, err := h.svc.PublishTrip(service.PublishTripInput{
		DriverID:     user.ID,
		OriginHubID:  req.OriginHubID,
		Destination:  destination,
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
