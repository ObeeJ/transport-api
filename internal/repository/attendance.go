package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AttendanceRepo struct{ db *gorm.DB }

func NewAttendanceRepo(db *gorm.DB) *AttendanceRepo { return &AttendanceRepo{db} }

// Upsert — write attendance for (userID, weekStart). Conflict on the
// composite unique index updates the attended flag + source.
func (r *AttendanceRepo) Upsert(a *models.Attendance) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "week_start"}},
		DoUpdates: clause.Assignments(map[string]any{
			"attended":   a.Attended,
			"source":     a.Source,
			"updated_at": time.Now(),
		}),
	}).Create(a).Error
}

// ForUser — most-recent first, up to `limit` weeks.
func (r *AttendanceRepo) ForUser(userID uuid.UUID, limit int) ([]models.Attendance, error) {
	if limit <= 0 {
		limit = 8
	}
	var items []models.Attendance
	return items, r.db.Where("user_id = ?", userID).
		Order("week_start desc").Limit(limit).Find(&items).Error
}

// Was — did this user attend in the given week (Monday-anchored)?
// Returns (false, nil) when no record exists; the caller decides if that
// counts as "attended" or "missing".
func (r *AttendanceRepo) Was(userID uuid.UUID, weekStart time.Time) (bool, bool, error) {
	var a models.Attendance
	err := r.db.Where("user_id = ? AND week_start = ?", userID, weekStart.UTC()).First(&a).Error
	if err == gorm.ErrRecordNotFound {
		return false, false, nil // no record, not "attended", not an error
	}
	if err != nil {
		return false, false, err
	}
	return a.Attended, true, nil
}

// AttendanceRate — percentage of users who attended at least once in the window.
func (r *AttendanceRepo) AttendanceRate(from, to time.Time) (float64, error) {
	var total, attended int64
	if err := r.db.Model(&models.Attendance{}).
		Where("week_start >= ? AND week_start < ?", from, to).
		Distinct("user_id").Count(&total).Error; err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	if err := r.db.Model(&models.Attendance{}).
		Where("week_start >= ? AND week_start < ? AND attended = ?", from, to, true).
		Distinct("user_id").Count(&attended).Error; err != nil {
		return 0, err
	}
	return float64(attended) / float64(total) * 100, nil
}
