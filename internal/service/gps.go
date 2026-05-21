package service

import (
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var ErrGPSNotAllowed = errors.New("gps_not_allowed")

// plausibilityMaxKm — if the driver's GPS track deviates more than this
// from the declared hub→destination straight line, flag for review.
const plausibilityMaxKm = 15.0

type GPSService struct {
	repo     *repository.GPSRepo
	rideRepo *repository.RideRepo
	db       *gorm.DB
}

func NewGPSService(repo *repository.GPSRepo, rideRepo *repository.RideRepo, db *gorm.DB) *GPSService {
	return &GPSService{repo: repo, rideRepo: rideRepo, db: db}
}

type RecordPointInput struct {
	TripID     uuid.UUID
	UserID     uuid.UUID
	Lat        float64
	Lng        float64
	Accuracy   float64
	RecordedAt time.Time
}

func (s *GPSService) Record(input RecordPointInput) error {
	trip, err := s.rideRepo.FindTrip(input.TripID)
	if err != nil {
		return ErrTripNotFound
	}
	// Only accept GPS from the driver of an active trip.
	if trip.DriverID != input.UserID {
		return ErrGPSNotAllowed
	}
	if trip.Status != "in_transit" {
		return ErrGPSNotAllowed
	}

	pt := &models.TripGPSPoint{
		TripID:     input.TripID,
		UserID:     input.UserID,
		Lat:        input.Lat,
		Lng:        input.Lng,
		Accuracy:   input.Accuracy,
		RecordedAt: input.RecordedAt,
	}
	if err := s.repo.Create(pt); err != nil {
		return err
	}
	if hub, err := s.rideRepo.FindHub(trip.OriginHubID); err == nil {
		s.CheckPlausibility(input.TripID, hub.Lat, hub.Lng)
	}
	return nil
}

func (s *GPSService) TrackForTrip(tripID uuid.UUID) ([]models.TripGPSPoint, error) {
	return s.repo.ListForTrip(tripID)
}

func (s *GPSService) LatestForTrip(tripID uuid.UUID) (*models.TripGPSPoint, error) {
	return s.repo.LatestForTrip(tripID)
}

// CheckPlausibility compares the GPS track against the declared hub origin.
// If the driver has deviated beyond the threshold, an audit flag is raised.
// This is a soft check — it never auto-cancels a trip.
func (s *GPSService) CheckPlausibility(tripID uuid.UUID, hubLat, hubLng float64) {
	points, err := s.repo.ListForTrip(tripID)
	if err != nil || len(points) < 3 {
		return
	}

	maxDeviation := 0.0
	for _, pt := range points {
		d := haversineKm(pt.Lat, pt.Lng, hubLat, hubLng)
		if d > maxDeviation {
			maxDeviation = d
		}
	}

	if maxDeviation > plausibilityMaxKm {
		audit.Record(s.db, "system", "trip_gps_plausibility_flag", tripID.String(), map[string]any{
			"maxDeviationKm": maxDeviation,
			"threshold":      plausibilityMaxKm,
		})
	}
}

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
