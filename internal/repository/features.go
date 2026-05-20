package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// --- Ratings ---

type RatingRepo struct{ db *gorm.DB }

func NewRatingRepo(db *gorm.DB) *RatingRepo { return &RatingRepo{db} }

func (r *RatingRepo) Create(rating *models.TripRating) error {
	return r.db.Create(rating).Error
}

func (r *RatingRepo) FindByRaterAndTrip(raterID, tripID uuid.UUID) (*models.TripRating, error) {
	var rt models.TripRating
	return &rt, r.db.Where("rater_id = ? AND trip_id = ?", raterID, tripID).First(&rt).Error
}

func (r *RatingRepo) AverageForSubject(subjectID uuid.UUID, role string) (float64, int64, error) {
	var result struct {
		Avg   float64
		Count int64
	}
	err := r.db.Model(&models.TripRating{}).
		Where("subject_id = ? AND role = ?", subjectID, role).
		Select("AVG(score) as avg, COUNT(*) as count").
		Scan(&result).Error
	return result.Avg, result.Count, err
}

func (r *RatingRepo) LowRatedDrivers(threshold float64, minRatings int64) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.Model(&models.TripRating{}).
		Where("role = ?", "driver_rating").
		Group("subject_id").
		Having("AVG(score) < ? AND COUNT(*) >= ?", threshold, minRatings).
		Pluck("subject_id", &ids).Error
	return ids, err
}

// --- Driver Impact ---

type DriverImpactRepo struct{ db *gorm.DB }

func NewDriverImpactRepo(db *gorm.DB) *DriverImpactRepo { return &DriverImpactRepo{db} }

func (r *DriverImpactRepo) Upsert(userID uuid.UUID, seats int64, km float64) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"seats_total": gorm.Expr("driver_impacts.seats_total + ?", seats),
			"trips_total": gorm.Expr("driver_impacts.trips_total + 1"),
			"km_total":    gorm.Expr("driver_impacts.km_total + ?", km),
			"updated_at":  time.Now(),
		}),
	}).Create(&models.DriverImpact{
		UserID:     userID,
		SeatsTotal: seats,
		TripsTotal: 1,
		KmTotal:    km,
	}).Error
}

func (r *DriverImpactRepo) FindByUserID(userID uuid.UUID) (*models.DriverImpact, error) {
	var d models.DriverImpact
	return &d, r.db.Where("user_id = ?", userID).First(&d).Error
}

// --- Encouragement Notes ---

type NoteRepo struct{ db *gorm.DB }

func NewNoteRepo(db *gorm.DB) *NoteRepo { return &NoteRepo{db} }

func (r *NoteRepo) Create(note *models.EncouragementNote) error {
	return r.db.Create(note).Error
}

func (r *NoteRepo) ListActive(limit int) ([]models.EncouragementNote, error) {
	var items []models.EncouragementNote
	return items, r.db.Where("active = ?", true).
		Order("created_at desc").Limit(limit).Find(&items).Error
}

// --- SOS ---

type SOSRepo struct{ db *gorm.DB }

func NewSOSRepo(db *gorm.DB) *SOSRepo { return &SOSRepo{db} }

func (r *SOSRepo) Create(alert *models.SOSAlert) error {
	return r.db.Create(alert).Error
}

func (r *SOSRepo) FindByID(id uuid.UUID) (*models.SOSAlert, error) {
	var a models.SOSAlert
	return &a, r.db.First(&a, "id = ?", id).Error
}

func (r *SOSRepo) ListOpen() ([]models.SOSAlert, error) {
	var items []models.SOSAlert
	return items, r.db.Where("status = ?", "open").Order("created_at asc").Find(&items).Error
}

func (r *SOSRepo) Update(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.SOSAlert{}).Where("id = ?", id).Updates(updates).Error
}

// --- GPS ---

type GPSRepo struct{ db *gorm.DB }

func NewGPSRepo(db *gorm.DB) *GPSRepo { return &GPSRepo{db} }

func (r *GPSRepo) Create(pt *models.TripGPSPoint) error {
	return r.db.Create(pt).Error
}

func (r *GPSRepo) ListForTrip(tripID uuid.UUID) ([]models.TripGPSPoint, error) {
	var items []models.TripGPSPoint
	return items, r.db.Where("trip_id = ?", tripID).
		Order("recorded_at asc").Find(&items).Error
}

func (r *GPSRepo) LatestForTrip(tripID uuid.UUID) (*models.TripGPSPoint, error) {
	var pt models.TripGPSPoint
	return &pt, r.db.Where("trip_id = ?", tripID).
		Order("recorded_at desc").First(&pt).Error
}

// --- Appeals ---

type AppealRepo struct{ db *gorm.DB }

func NewAppealRepo(db *gorm.DB) *AppealRepo { return &AppealRepo{db} }

func (r *AppealRepo) Create(a *models.RecipientAppeal) error {
	return r.db.Create(a).Error
}

func (r *AppealRepo) FindByID(id uuid.UUID) (*models.RecipientAppeal, error) {
	var a models.RecipientAppeal
	return &a, r.db.First(&a, "id = ?", id).Error
}

func (r *AppealRepo) ListOpen() ([]models.RecipientAppeal, error) {
	var items []models.RecipientAppeal
	return items, r.db.Where("status IN ?", []string{"open", "under_review"}).
		Order("created_at asc").Find(&items).Error
}

func (r *AppealRepo) Update(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.RecipientAppeal{}).Where("id = ?", id).Updates(updates).Error
}

func (r *AppealRepo) CountByRecipient(recipientID uuid.UUID) (int64, error) {
	var count int64
	return count, r.db.Model(&models.RecipientAppeal{}).
		Where("recipient_id = ?", recipientID).Count(&count).Error
}
