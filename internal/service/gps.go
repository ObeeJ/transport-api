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

// journeyMinKm — minimum distance the vehicle must travel from its origin hub
// for a completed trip to count as a real journey. Below this, a "boarded"
// attendance mark is suspect (the vehicle effectively never left).
const journeyMinKm = 1.0

// defaultGPS is the boot-wired GPS service used by RideService.CompleteTrip to
// corroborate that a finished trip actually happened. Package singleton (like
// defaultIntegrity) to avoid threading GPSService through RideService's
// constructor. Nil-safe.
var defaultGPS *GPSService

// SetDefaultGPS wires the package-level GPS service. Call once at startup.
func SetDefaultGPS(s *GPSService) { defaultGPS = s }

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

// withinGeofenceKm reports whether (lat,lng) lies within radiusKm of a centre
// point. The geofence primitive for arrival/presence checks.
func withinGeofenceKm(lat, lng, centerLat, centerLng, radiusKm float64) bool {
	return haversineKm(lat, lng, centerLat, centerLng) <= radiusKm
}

// CorroborateTripJourney records a privacy-preserving check that a completed
// trip actually happened. It inspects ONLY the driver's GPS track (riders are
// never tracked) and stores a single boolean outcome — whether the vehicle
// travelled beyond journeyMinKm from its origin hub. A "boarded" attendance
// mark on a trip whose vehicle never moved is exactly the abuse signal stewards
// want to see. This is a soft corroboration: it never blocks a payout, it only
// writes an audit signal alongside the existing driver-marked attendance.
func (s *GPSService) CorroborateTripJourney(tripID uuid.UUID) {
	if s == nil {
		return
	}
	trip, err := s.rideRepo.FindTrip(tripID)
	if err != nil {
		return
	}
	hub, err := s.rideRepo.FindHub(trip.OriginHubID)
	if err != nil {
		return
	}
	points, err := s.repo.ListForTrip(tripID)
	if err != nil {
		return
	}
	maxKm := 0.0
	for _, pt := range points {
		if d := haversineKm(pt.Lat, pt.Lng, hub.Lat, hub.Lng); d > maxKm {
			maxKm = d
		}
	}
	confirmed := len(points) >= 2 && maxKm >= journeyMinKm
	audit.Record(s.db, "system", "trip_journey_corroborated", tripID.String(), map[string]any{
		"confirmed":       confirmed,
		"maxKmFromOrigin": maxKm,
		"points":          len(points),
	})
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
