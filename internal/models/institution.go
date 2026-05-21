package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Institution — a campus community that runs its own pool, steward team,
// and ride network. All user-facing data is scoped to an institution.
// For v1 there is exactly one row; the column exists so multi-tenancy
// can be enforced at the query layer later without a schema migration.
type Institution struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	Slug      string    `gorm:"uniqueIndex;not null" json:"slug"` // e.g. "unilag", "covenant"
	Active    bool      `gorm:"not null;default:true" json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (i *Institution) BeforeCreate(_ *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}

// DefaultInstitutionSlug is the slug seeded on first boot.
const DefaultInstitutionSlug = "default"
