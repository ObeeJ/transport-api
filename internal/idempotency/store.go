package idempotency

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Key struct {
	Key          string          `gorm:"primaryKey"`
	UserID       uuid.UUID       `gorm:"type:uuid;not null"`
	Endpoint     string          `gorm:"not null"`
	RequestHash  string          `gorm:"not null"`
	ResponseCode *int            `gorm:""`
	ResponseBody json.RawMessage `gorm:"type:jsonb"`
	CreatedAt    time.Time
	ExpiresAt    time.Time
}

func (Key) TableName() string { return "idempotency_keys" }

// Store handles idempotency key persistence.
type Store struct{ db *gorm.DB }

func NewStore(db *gorm.DB) *Store { return &Store{db: db} }

// HashBody returns a stable SHA-256 hex of the request body.
func HashBody(body []byte) string {
	h := sha256.Sum256(body)
	return hex.EncodeToString(h[:])
}

// Get returns an existing key record, or nil if not found / expired.
func (s *Store) Get(key string) (*Key, error) {
	var k Key
	err := s.db.Where("key = ? AND expires_at > ?", key, time.Now()).First(&k).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &k, nil
}

// Create inserts a new key record (before the handler runs).
func (s *Store) Create(key string, userID uuid.UUID, endpoint, requestHash string) error {
	k := Key{
		Key:         key,
		UserID:      userID,
		Endpoint:    endpoint,
		RequestHash: requestHash,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	return s.db.Create(&k).Error
}

// Settle stores the response so replays return the cached result.
func (s *Store) Settle(key string, code int, body any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return s.db.Model(&Key{}).Where("key = ?", key).Updates(map[string]any{
		"response_code": code,
		"response_body": raw,
	}).Error
}
