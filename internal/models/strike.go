package models

import (
	"time"

	"github.com/google/uuid"
)

// Strike — a recorded integrity event against a user, used to deter abuse of
// the transport fund and the ride network. Current reasons:
//
//	ride_no_show         — booked a subsidised seat and didn't board, denying
//	                       it to someone else (recorded when the driver marks
//	                       the booking no_show).
//	attendance_mismatch  — received support for a week they were later
//	                       confirmed absent for (recorded by a steward).
//
// Strikes never seize money. Enough *active* strikes inside a rolling window
// suspend a user from booking and from payout eligibility until the strikes age
// out or a steward clears them (e.g. on a successful appeal).
type Strike struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID  `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000000'" json:"-"`
	UserID        uuid.UUID  `gorm:"type:uuid;index;not null" json:"-"`
	Reason        string     `gorm:"index;not null" json:"reason"`
	TripID        *uuid.UUID `gorm:"type:uuid" json:"tripId,omitempty"`
	WeekStart     time.Time  `gorm:"index" json:"weekStart"`
	Note          string     `json:"note,omitempty"`
	CreatedAt     time.Time  `gorm:"index" json:"createdAt"`
	ClearedAt     *time.Time `gorm:"index" json:"clearedAt,omitempty"`
	ClearedBy     *uuid.UUID `gorm:"type:uuid" json:"-"`
	ClearedReason string     `json:"clearedReason,omitempty"`
}

// Strike reason constants.
const (
	StrikeRideNoShow         = "ride_no_show"
	StrikeAttendanceMismatch = "attendance_mismatch"
)
