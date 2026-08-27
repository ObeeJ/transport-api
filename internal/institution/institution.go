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
