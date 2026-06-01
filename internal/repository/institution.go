package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type InstitutionRepo struct{ db *gorm.DB }

func NewInstitutionRepo(db *gorm.DB) *InstitutionRepo { return &InstitutionRepo{db} }

// FindBySlug resolves an institution by its URL slug (e.g. "unilag"). Used at
// signup to pin a new account to the org they came in through.
func (r *InstitutionRepo) FindBySlug(slug string) (*models.Institution, error) {
	var inst models.Institution
	return &inst, r.db.Where("slug = ? AND active = ?", slug, true).First(&inst).Error
}

func (r *InstitutionRepo) FindByID(id uuid.UUID) (*models.Institution, error) {
	var inst models.Institution
	return &inst, r.db.First(&inst, "id = ?", id).Error
}

func (r *InstitutionRepo) Create(inst *models.Institution) error {
	return r.db.Create(inst).Error
}

// List returns every institution, newest first — admin/onboarding surface.
func (r *InstitutionRepo) List() ([]models.Institution, error) {
	var out []models.Institution
	return out, r.db.Order("created_at DESC").Find(&out).Error
}
