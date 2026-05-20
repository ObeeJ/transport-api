package service

import (
	"errors"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrAlreadyRated    = errors.New("already_rated")
	ErrInvalidScore    = errors.New("invalid_score")
	ErrRatingNotAllowed = errors.New("rating_not_allowed")
)

// Low-rating threshold — drivers below this average with ≥5 ratings
// are surfaced to the steward queue.
const lowRatingThreshold = 2.5
const minRatingsForFlag = 5

type RatingService struct {
	repo       *repository.RatingRepo
	impactRepo *repository.DriverImpactRepo
	rideRepo   *repository.RideRepo
	notify     *NotificationService
	db         *gorm.DB
}

func NewRatingService(
	repo *repository.RatingRepo,
	impactRepo *repository.DriverImpactRepo,
	rideRepo *repository.RideRepo,
	notify *NotificationService,
	db *gorm.DB,
) *RatingService {
	return &RatingService{repo: repo, impactRepo: impactRepo, rideRepo: rideRepo, notify: notify, db: db}
}

type SubmitRatingInput struct {
	TripID    uuid.UUID
	RaterID   uuid.UUID
	SubjectID uuid.UUID
	Role      string // driver_rating | rider_rating
	Score     int
	Note      string
}

func (s *RatingService) Submit(input SubmitRatingInput) (*models.TripRating, error) {
	if input.Score < 1 || input.Score > 5 {
		return nil, ErrInvalidScore
	}
	if input.Role != "driver_rating" && input.Role != "rider_rating" {
		return nil, ErrRatingNotAllowed
	}

	// Idempotent — one rating per rater per trip.
	if _, err := s.repo.FindByRaterAndTrip(input.RaterID, input.TripID); err == nil {
		return nil, ErrAlreadyRated
	}

	// Verify the trip is completed.
	trip, err := s.rideRepo.FindTrip(input.TripID)
	if err != nil || trip.Status != "completed" {
		return nil, ErrRatingNotAllowed
	}

	rating := &models.TripRating{
		TripID:    input.TripID,
		RaterID:   input.RaterID,
		SubjectID: input.SubjectID,
		Role:      input.Role,
		Score:     input.Score,
		Note:      input.Note,
	}
	if err := s.repo.Create(rating); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.RaterID.String(), "trip_rated", input.TripID.String(), map[string]any{
		"role":  input.Role,
		"score": input.Score,
	})

	// After a driver rating, check if they've fallen below the threshold.
	if input.Role == "driver_rating" {
		s.checkDriverRating(input.SubjectID)
	}

	return rating, nil
}

func (s *RatingService) DriverAverage(driverID uuid.UUID) (float64, int64, error) {
	return s.repo.AverageForSubject(driverID, "driver_rating")
}

func (s *RatingService) FlaggedDrivers() ([]uuid.UUID, error) {
	return s.repo.LowRatedDrivers(lowRatingThreshold, minRatingsForFlag)
}

func (s *RatingService) checkDriverRating(driverID uuid.UUID) {
	avg, count, err := s.repo.AverageForSubject(driverID, "driver_rating")
	if err != nil || count < minRatingsForFlag {
		return
	}
	if avg < lowRatingThreshold {
		audit.Record(s.db, "system", "driver_low_rating_flagged", driverID.String(), map[string]any{
			"avg":   avg,
			"count": count,
		})
		if s.notify != nil {
			_ = s.notify.Send(driverID, "driver_rating_review",
				"Your rating needs attention",
				"Your recent trip ratings are below our threshold. A steward will be in touch.",
			)
		}
	}
}

// RecordImpact is called by RideService when a trip completes.
func (s *RatingService) RecordImpact(driverID uuid.UUID, seatsUsed int64, km float64) error {
	return s.impactRepo.Upsert(driverID, seatsUsed, km)
}

func (s *RatingService) DriverImpact(driverID uuid.UUID) (*models.DriverImpact, error) {
	return s.impactRepo.FindByUserID(driverID)
}
