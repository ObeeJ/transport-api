package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"github.com/obeej/akin/internal/ws"
	"gorm.io/gorm"
)

var (
	ErrHubNotFound      = errors.New("hub_not_found")
	ErrTripNotFound     = errors.New("trip_not_found")
	ErrNotYourTrip      = errors.New("not_your_trip")
	ErrInvalidTripState = errors.New("invalid_state")
	ErrCannotCancel     = errors.New("cannot_cancel")
	ErrTripFull         = errors.New("trip_full")
	ErrAlreadyBooked    = errors.New("already_booked")
	ErrNotBookable      = errors.New("not_bookable")
	ErrCannotBookOwn    = errors.New("cannot_book_own_trip")
	ErrInvalidSeats     = errors.New("invalid_seats")
	ErrDestinationEmpty = errors.New("destination_required")
	ErrDepartureInPast  = errors.New("departure_in_past")
	ErrBookingNotFound  = errors.New("no_booking")
)

type RideService struct {
	repo    *repository.RideRepo
	drivers *repository.DriverRepo
	users   *repository.UserRepo
	hub     SeatPublisher
	db      *gorm.DB
}

// SeatPublisher is the interface the hub implements.
type SeatPublisher interface {
	Publish(ctx context.Context, update ws.SeatUpdate)
}

func NewRideService(repo *repository.RideRepo, drivers *repository.DriverRepo, users *repository.UserRepo, hub SeatPublisher, db *gorm.DB) *RideService {
	return &RideService{repo: repo, drivers: drivers, users: users, hub: hub, db: db}
}

func (s *RideService) ListHubs() ([]models.Hub, error) {
	return s.repo.ListActiveHubs()
}

func (s *RideService) TripDemand() ([]repository.DemandRow, error) {
	return s.repo.DemandByHubHour()
}

type PublishTripInput struct {
	DriverID     uuid.UUID
	OriginHubID  string
	Destination  string
	DepartureAt  string // RFC3339
	TotalSeats   int
	VehiclePlate string
}

func (s *RideService) PublishTrip(input PublishTripInput) (*models.Trip, error) {
	if s.drivers != nil {
		profile, err := s.drivers.FindByUserID(input.DriverID)
		if err != nil {
			return nil, ErrDriverNotFound
		}
		if profile.Status != "approved" {
			return nil, ErrDriverNotApproved
		}
	}
	if input.TotalSeats < 1 || input.TotalSeats > 7 {
		return nil, ErrInvalidSeats
	}
	if strings.TrimSpace(input.Destination) == "" {
		return nil, ErrDestinationEmpty
	}

	hubID, err := uuid.Parse(input.OriginHubID)
	if err != nil {
		return nil, ErrHubNotFound
	}
	hub, err := s.repo.FindHub(hubID)
	if err != nil {
		return nil, ErrHubNotFound
	}

	departure, err := time.Parse(time.RFC3339, input.DepartureAt)
	if err != nil {
		return nil, ErrDepartureInPast
	}
	if departure.Before(time.Now().Add(-1 * time.Minute)) {
		return nil, ErrDepartureInPast
	}

	trip := &models.Trip{
		DriverID:     input.DriverID,
		OriginHubID:  hub.ID,
		Destination:  strings.TrimSpace(input.Destination),
		DepartureAt:  departure,
		TotalSeats:   input.TotalSeats,
		Status:       "published",
		VehiclePlate: strings.TrimSpace(input.VehiclePlate),
	}
	if err := s.repo.CreateTrip(trip); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.DriverID.String(), "trip_published", trip.ID.String(), map[string]any{
		"hub":         hub.Name,
		"destination": trip.Destination,
		"seats":       trip.TotalSeats,
	})
	return trip, nil
}

type TripCard struct {
	models.Trip
	HubName     string `json:"hubName"`
	BookedCount int64  `json:"bookedCount"`
	SeatsLeft   int    `json:"seatsLeft"`
	DriverName  string `json:"driverName,omitempty"`
}

func (s *RideService) ListTrips(hubID *uuid.UUID) ([]TripCard, error) {
	trips, err := s.repo.ListUpcomingTrips(hubID)
	if err != nil {
		return nil, err
	}
	return s.enrichTrips(trips), nil
}

func (s *RideService) GetTrip(id, requesterID uuid.UUID) (map[string]any, error) {
	trip, err := s.repo.FindTrip(id)
	if err != nil {
		return nil, ErrTripNotFound
	}

	var hub models.Hub
	if found, err := s.repo.FindHub(trip.OriginHubID); err == nil {
		hub = *found
	}
	bookings, _ := s.repo.ListActiveBookings(trip.ID)
	isDriver := trip.DriverID == requesterID

	resp := map[string]any{
		"trip":        trip,
		"hubName":     hub.Name,
		"bookedCount": len(bookings),
		"seatsLeft":   trip.TotalSeats - len(bookings),
		"isDriver":    isDriver,
	}
	if name := s.firstNameForUser(trip.DriverID); name != "" {
		resp["driverName"] = name
	}

	if isDriver {
		names := s.firstNamesForBookings(bookings)
		riders := make([]map[string]any, 0, len(bookings))
		for _, b := range bookings {
			riders = append(riders, map[string]any{
				"bookingId":     b.ID,
				"commuterFirst": names[b.RiderID],
				"bookedAt":      b.CreatedAt,
			})
		}
		resp["riders"] = riders
	}

	for _, b := range bookings {
		if b.RiderID == requesterID {
			resp["myBooking"] = map[string]any{"id": b.ID, "status": b.Status, "bookedAt": b.CreatedAt}
			break
		}
	}
	return resp, nil
}

func (s *RideService) firstNamesForBookings(bookings []models.Booking) map[uuid.UUID]string {
	names := make(map[uuid.UUID]string, len(bookings))
	if s.users == nil || len(bookings) == 0 {
		return names
	}
	ids := make([]uuid.UUID, 0, len(bookings))
	for _, b := range bookings {
		ids = append(ids, b.RiderID)
	}
	users, err := s.users.FindByIDs(ids)
	if err != nil {
		return names
	}
	for _, u := range users {
		name := strings.TrimSpace(u.FirstName)
		if name == "" {
			name = strings.Split(u.Email, "@")[0]
		}
		names[u.ID] = name
	}
	return names
}

func (s *RideService) firstNameForUser(userID uuid.UUID) string {
	if s.users == nil {
		return ""
	}
	u, err := s.users.FindByID(userID)
	if err != nil {
		return ""
	}
	name := strings.TrimSpace(u.FirstName)
	if name == "" {
		name = strings.Split(u.Email, "@")[0]
	}
	return name
}

func (s *RideService) StartTrip(tripID, driverID uuid.UUID) error {
	return s.transition(tripID, driverID, "published", "in_transit", "started_at", "trip_started")
}

func (s *RideService) CompleteTrip(tripID, driverID uuid.UUID) error {
	if err := s.transition(tripID, driverID, "in_transit", "completed", "completed_at", "trip_completed"); err != nil {
		return err
	}
	// Roll active bookings forward so the rider's history is accurate.
	// Audit-logged as part of the trip transition; we don't audit-log per booking.
	_ = s.repo.CompleteTripBookings(tripID)
	return nil
}

func (s *RideService) CancelTrip(tripID, driverID uuid.UUID, reason string) error {
	trip, err := s.repo.FindTrip(tripID)
	if err != nil {
		return ErrTripNotFound
	}
	if trip.DriverID != driverID {
		return ErrNotYourTrip
	}
	if trip.Status != "published" && trip.Status != "boarding" {
		return ErrCannotCancel
	}
	now := time.Now()
	if err := s.repo.UpdateTrip(tripID, map[string]any{
		"status":        "cancelled",
		"cancelled_at":  &now,
		"cancel_reason": reason,
	}); err != nil {
		return err
	}
	_ = s.repo.CancelTripBookings(tripID)
	audit.Record(s.db, driverID.String(), "trip_cancelled", tripID.String(), map[string]any{"reason": reason})
	return nil
}

func (s *RideService) BookSeat(ctx context.Context, tripID, riderID uuid.UUID) (*models.Booking, error) {
	trip, err := s.repo.FindTrip(tripID)
	if err != nil {
		return nil, ErrTripNotFound
	}
	if trip.DriverID == riderID {
		return nil, ErrCannotBookOwn
	}
	if trip.Status != "published" && trip.Status != "boarding" {
		return nil, ErrNotBookable
	}

	booking, err := s.repo.BookSeatTx(trip, riderID)
	if err != nil {
		if repository.IsTripFull(err) {
			return nil, ErrTripFull
		}
		if strings.Contains(err.Error(), "bookings_unique_active") {
			return nil, ErrAlreadyBooked
		}
		return nil, err
	}

	audit.Record(s.db, riderID.String(), "booking_created", booking.ID.String(), map[string]any{"tripId": tripID.String()})
	s.publishSeats(ctx, trip)
	return booking, nil
}

func (s *RideService) CancelBooking(tripID, riderID uuid.UUID) error {
	booking, err := s.repo.FindActiveBooking(tripID, riderID)
	if err != nil {
		return ErrBookingNotFound
	}
	now := time.Now()
	if err := s.repo.UpdateBooking(booking.ID, map[string]any{
		"status":       "cancelled",
		"cancelled_at": &now,
	}); err != nil {
		return err
	}
	audit.Record(s.db, riderID.String(), "booking_cancelled", booking.ID.String(), map[string]any{"tripId": tripID.String()})
	if trip, err := s.repo.FindTrip(tripID); err == nil {
		s.publishSeats(context.Background(), trip)
	}
	return nil
}

func (s *RideService) MyDriverTrips(driverID uuid.UUID) ([]TripCard, error) {
	trips, err := s.repo.ListTripsByDriver(driverID, 50)
	if err != nil {
		return nil, err
	}
	return s.enrichTrips(trips), nil
}

type BookingWithTrip struct {
	models.Booking
	Trip       *models.Trip `json:"trip,omitempty"`
	HubName    string       `json:"hubName,omitempty"`
	DriverName string       `json:"driverName,omitempty"`
}

func (s *RideService) MyRiderBookings(riderID uuid.UUID) ([]BookingWithTrip, error) {
	bookings, err := s.repo.ListBookingsByRider(riderID, 50)
	if err != nil {
		return nil, err
	}
	out := make([]BookingWithTrip, 0, len(bookings))
	for _, b := range bookings {
		entry := BookingWithTrip{Booking: b}
		if t, err := s.repo.FindTrip(b.TripID); err == nil {
			entry.Trip = t
			if hub, err := s.repo.FindHub(t.OriginHubID); err == nil {
				entry.HubName = hub.Name
			}
		}
		out = append(out, entry)
	}
	return out, nil
}

func (s *RideService) transition(tripID, driverID uuid.UUID, from, to, stampCol, auditAction string) error {
	trip, err := s.repo.FindTrip(tripID)
	if err != nil {
		return ErrTripNotFound
	}
	if trip.DriverID != driverID {
		return ErrNotYourTrip
	}
	if trip.Status != from {
		return ErrInvalidTripState
	}
	now := time.Now()
	if err := s.repo.UpdateTrip(tripID, map[string]any{"status": to, stampCol: &now}); err != nil {
		return err
	}
	audit.Record(s.db, driverID.String(), auditAction, tripID.String(), nil)
	return nil
}

func (s *RideService) publishSeats(ctx context.Context, trip *models.Trip) {
	if s.hub == nil {
		return
	}
	count, _ := s.repo.CountActiveBookings(trip.ID)
	s.hub.Publish(ctx, ws.SeatUpdate{
		TripID:      trip.ID.String(),
		SeatsLeft:   trip.TotalSeats - int(count),
		BookedCount: int(count),
		TotalSeats:  trip.TotalSeats,
	})
}
func (s *RideService) enrichTrips(trips []models.Trip) []TripCard {
	out := make([]TripCard, 0, len(trips))
	for _, t := range trips {
		card := TripCard{Trip: t, SeatsLeft: t.TotalSeats}
		if hub, err := s.repo.FindHub(t.OriginHubID); err == nil {
			card.HubName = hub.Name
		}
		card.DriverName = s.firstNameForUser(t.DriverID)
		count, _ := s.repo.CountActiveBookings(t.ID)
		card.BookedCount = count
		card.SeatsLeft = t.TotalSeats - int(count)
		out = append(out, card)
	}
	return out
}
