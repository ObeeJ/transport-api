package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/service"
)

type DriverHandler struct {
	svc *service.DriverService
}

func NewDriverHandler(svc *service.DriverService) *DriverHandler {
	return &DriverHandler{svc: svc}
}

func (h *DriverHandler) Apply(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	var req struct {
		VehicleType   string `json:"vehicleType"`
		VehiclePlate  string `json:"vehiclePlate"`
		LicenseNumber string `json:"licenseNumber"`
		Note          string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	d, err := h.svc.Apply(service.ApplyDriverInput{
		UserID:        user.ID,
		VehicleType:   req.VehicleType,
		VehiclePlate:  req.VehiclePlate,
		LicenseNumber: req.LicenseNumber,
		Note:          req.Note,
	})
	if err != nil {
		return fail(c, err, "apply_failed")
	}
	return c.Status(201).JSON(d)
}

func (h *DriverHandler) Me(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	d, err := h.svc.GetByUserID(user.ID)
	if err != nil {
		return fail(c, err, "lookup_failed")
	}
	return c.JSON(d)
}

func (h *DriverHandler) Opportunities(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	out, err := h.svc.Opportunities()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "opportunities_failed"})
	}
	return c.JSON(out)
}

func (h *DriverHandler) Queue(c *fiber.Ctx) error {
	items, err := h.svc.ListPending()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query_failed"})
	}
	return c.JSON(fiber.Map{"items": items})
}

func (h *DriverHandler) Decide(c *fiber.Ctx) error {
	steward := middleware.CurrentUser(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	result, err := h.svc.Decide(service.DecideDriverInput{
		DriverProfileID: id,
		StewardID:       steward.ID,
		Decision:        req.Decision,
		Note:            req.Note,
	})
	if err != nil {
		return fail(c, err, "decide_failed")
	}
	return c.JSON(fiber.Map{
		"profile":       result.Profile,
		"transitioned":  result.Transitioned,
		"signoffsSoFar": result.SignoffsSoFar,
	})
}

func (h *DriverHandler) MarkAttendance(c *fiber.Ctx) error {
	user := middleware.CurrentUser(c)
	if user == nil {
		return c.Status(401).JSON(fiber.Map{"error": "not_authenticated"})
	}
	tripID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_trip_id"})
	}
	var req struct {
		BookingID string `json:"bookingId"`
		RiderID   string `json:"riderId"`
		Status    string `json:"status"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	bookingID, err := uuid.Parse(req.BookingID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_booking_id"})
	}
	riderID, err := uuid.Parse(req.RiderID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_rider_id"})
	}
	a, err := h.svc.MarkAttendance(service.MarkAttendanceInput{
		BookingID: bookingID,
		TripID:    tripID,
		RiderID:   riderID,
		DriverID:  user.ID,
		Status:    req.Status,
	})
	if err != nil {
		return fail(c, err, "mark_failed")
	}
	return c.JSON(a)
}
