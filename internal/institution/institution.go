// Package institution manages multi-tenant circle creation and invite links.
package institution

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("institution: not found")

// SetAdmin assigns an admin user to an institution.
func SetAdmin(db *gorm.DB, institutionID, adminUserID uuid.UUID) error {
	return db.Table("institutions").Where("id = ?", institutionID).
		Update("admin_user_id", adminUserID).Error
}

// Create creates a new whitelabel Circle (institution) and makes the creator
// its admin. This is the Phase 7 entry point for a community leader onboarding
// their own cross-sector Circle onto the shared platform.
func Create(db *gorm.DB, creatorUserID uuid.UUID, name, slug, sector string) (uuid.UUID, error) {
	id := uuid.New()
	now := time.Now()
	if err := db.Exec(
		`INSERT INTO institutions (id, name, slug, active, admin_user_id, sector, created_at, updated_at)
		 VALUES (?,?,?,true,?,?,?,?)`,
		id, name, slug, creatorUserID, sector, now, now,
	).Error; err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// Switch moves a user's active context to another institution. The schema
// only tracks one institution per user (no membership junction table yet), so
// "switching" reassigns membership outright rather than toggling between
// simultaneous memberships — it only succeeds for institutions the caller
// actually administers. A Circle-membership junction table is the natural
// next step if multi-membership becomes a real requirement.
func Switch(db *gorm.DB, userID, institutionID uuid.UUID) error {
	var inst struct {
		ID          uuid.UUID
		AdminUserID *uuid.UUID
	}
	if err := db.Table("institutions").Where("id = ? AND active = true", institutionID).
		Scan(&inst).Error; err != nil {
		return err
	}
	if inst.ID == uuid.Nil {
		return ErrNotFound
	}
	if inst.AdminUserID == nil || *inst.AdminUserID != userID {
		return errors.New("institution: not a member of this circle")
	}
	return db.Table("users").Where("id = ?", userID).
		Updates(map[string]any{"institution_id": institutionID, "updated_at": time.Now()}).Error
}

// GenerateInviteToken creates a unique invite link token for an institution.
func GenerateInviteToken(db *gorm.DB, institutionID uuid.UUID) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)
	if err := db.Table("institutions").Where("id = ?", institutionID).
		Update("invite_link_token", token).Error; err != nil {
		return "", err
	}
	return token, nil
}

// JoinByToken adds a user to the institution associated with the token.
func JoinByToken(db *gorm.DB, token string, userID uuid.UUID) error {
	var inst struct {
		ID uuid.UUID
	}
	if err := db.Table("institutions").Where("invite_link_token = ?", token).Scan(&inst).Error; err != nil {
		return ErrNotFound
	}
	if inst.ID == uuid.Nil {
		return ErrNotFound
	}
	return db.Table("users").Where("id = ?", userID).
		Updates(map[string]any{"institution_id": inst.ID, "updated_at": time.Now()}).Error
}
