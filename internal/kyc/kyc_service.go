// Package kyc handles async NIN/BVN verification via Prembly.
package kyc

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrJobNotFound = errors.New("kyc: job not found")

type Record struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID           uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	NINHash          string    `gorm:""`
	NINVerified      bool      `gorm:"not null;default:false"`
	BVNHash          string    `gorm:""`
	BVNVerified      bool      `gorm:"not null;default:false"`
	SelfieMatchScore *float64  `gorm:""`
	Tier             int       `gorm:"not null;default:0"`
	Provider         string    `gorm:"default:prembly"`
	RawResponse      []byte    `gorm:"type:jsonb"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func (Record) TableName() string { return "kyc_records" }

func (r *Record) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

type Job struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID       `gorm:"type:uuid;not null;index"`
	JobType     string          `gorm:"not null"`
	Payload     json.RawMessage `gorm:"type:jsonb;not null"`
	Status      string          `gorm:"not null;default:queued"`
	Attempts    int             `gorm:"not null;default:0"`
	Result      json.RawMessage `gorm:"type:jsonb"`
	CreatedAt   time.Time
	CompletedAt *time.Time
}

func (Job) TableName() string { return "kyc_jobs" }

func (j *Job) BeforeCreate(_ *gorm.DB) error {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	return nil
}

// Submit enqueues a KYC job. Returns the job ID.
func Submit(db *gorm.DB, userID uuid.UUID, jobType string, payload map[string]any) (uuid.UUID, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return uuid.Nil, err
	}
	job := &Job{
		UserID:  userID,
		JobType: jobType,
		Payload: raw,
		Status:  "queued",
	}
	return job.ID, db.Create(job).Error
}

// GetJob returns a job by ID.
func GetJob(db *gorm.DB, jobID uuid.UUID) (*Job, error) {
	var j Job
	if err := db.Where("id = ?", jobID).First(&j).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrJobNotFound
		}
		return nil, err
	}
	return &j, nil
}

// GetRecord returns the KYC record for a user.
func GetRecord(db *gorm.DB, userID uuid.UUID) (*Record, error) {
	var r Record
	if err := db.Where("user_id = ?", userID).First(&r).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &r, nil
}
