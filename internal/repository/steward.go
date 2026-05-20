package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type StewardRepo struct{ db *gorm.DB }

func NewStewardRepo(db *gorm.DB) *StewardRepo { return &StewardRepo{db} }

func (r *StewardRepo) CreateAction(a *models.StewardAction) error {
	return r.db.Create(a).Error
}

func (r *StewardRepo) FindActionByStewardAndSubject(stewardID, subjectID uuid.UUID, subjectType string) (*models.StewardAction, error) {
	var a models.StewardAction
	return &a, r.db.Where(
		"steward_id = ? AND subject_id = ? AND subject_type = ?",
		stewardID, subjectID, subjectType,
	).First(&a).Error
}

func (r *StewardRepo) ListActionsBySubject(subjectID uuid.UUID, subjectType string) ([]models.StewardAction, error) {
	var items []models.StewardAction
	return items, r.db.Where("subject_id = ? AND subject_type = ?", subjectID, subjectType).
		Order("created_at asc").Find(&items).Error
}

func (r *StewardRepo) ListActionsBySubjectAndDecision(subjectID uuid.UUID, subjectType, decision string) ([]models.StewardAction, error) {
	var items []models.StewardAction
	return items, r.db.Where(
		"subject_id = ? AND subject_type = ? AND decision = ?",
		subjectID, subjectType, decision,
	).Find(&items).Error
}

func (r *StewardRepo) ListAudit(limit int) ([]models.AuditEntry, error) {
	var items []models.AuditEntry
	return items, r.db.Order("created_at desc").Limit(limit).Find(&items).Error
}

func (r *StewardRepo) ListAuditCursor(cursor time.Time, limit int) ([]models.AuditEntry, error) {
	var items []models.AuditEntry
	q := r.db.Order("created_at desc").Limit(limit)
	if !cursor.IsZero() {
		q = q.Where("created_at < ?", cursor)
	}
	return items, q.Find(&items).Error
}
