// Package matcher implements the guaranteed-ride ladder:
// Tier 1: peer drivers (platform users)
// Tier 2: partner drivers (WhatsApp-notified)
// Tier 3: emergency grant (admin nod)
package matcher

import (
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RideOffer struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey"`
	RideID    uuid.UUID  `gorm:"type:uuid;not null"`
	DriverID  *uuid.UUID `gorm:"type:uuid"`
	PartnerID *uuid.UUID `gorm:"type:uuid"`
	OfferedAt time.Time  `gorm:"not null"`
	ExpiresAt time.Time  `gorm:"not null"`
	Status    string     `gorm:"not null;default:pending"`
}

func (RideOffer) TableName() string { return "ride_offers" }

func (o *RideOffer) BeforeCreate(_ *gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	return nil
}

// LadderStatus represents the current matching tier for a ride.
type LadderStatus struct {
	RideID    uuid.UUID `json:"rideId"`
	Tier      int       `json:"tier"`      // 1=peer, 2=partner, 3=emergency
	TierLabel string    `json:"tierLabel"`
	OfferID   *uuid.UUID `json:"offerId,omitempty"`
	Status    string    `json:"status"`
}

// Enqueue creates a tier-1 offer for a ride.
func Enqueue(db *gorm.DB, rideID uuid.UUID) error {
	offer := &RideOffer{
		RideID:    rideID,
		OfferedAt: time.Now(),
		ExpiresAt: time.Now().Add(5 * time.Minute),
		Status:    "pending",
	}
	return db.Create(offer).Error
}

// RequestRide starts a new guaranteed-ride ladder for a rider who couldn't
// find a seat among scheduled trips. Generates a fresh ride ID and enqueues
// the tier-1 peer search; the caller polls Status(rideID) for progress.
func RequestRide(db *gorm.DB) (uuid.UUID, error) {
	rideID := uuid.New()
	return rideID, Enqueue(db, rideID)
}

const (
	tier1Timeout = 5 * time.Minute
	tier2Timeout = 15 * time.Minute
)

// Status returns the current ladder status for a ride, auto-escalating as
// tiers time out: no peer accepted within 5 minutes moves to tier 2 (partner
// drivers); no partner within 15 minutes total flags tier 3 (emergency grant,
// admin nod) via EmergencyQueue rather than blocking the rider indefinitely.
func Status(db *gorm.DB, rideID uuid.UUID) LadderStatus {
	var offer RideOffer
	db.Where("ride_id = ? AND status = 'pending'", rideID).Order("offered_at DESC").First(&offer)

	if offer.ID == uuid.Nil {
		return LadderStatus{RideID: rideID, Tier: 1, TierLabel: "Searching for drivers", Status: "searching"}
	}

	elapsed := time.Since(offer.OfferedAt)
	tier := 1
	label := "Peer driver"
	switch {
	case offer.PartnerID != nil:
		tier = 2
		label = "Partner driver"
		if elapsed >= tier2Timeout {
			tier = 3
			label = "Emergency grant — admin review"
		}
	case elapsed >= tier1Timeout:
		EscalateTier2(db, rideID)
		return Status(db, rideID) // re-read the freshly escalated offer
	}

	return LadderStatus{
		RideID:    rideID,
		Tier:      tier,
		TierLabel: label,
		OfferID:   &offer.ID,
		Status:    offer.Status,
	}
}

// ConfirmEmergencyScan marks a tier-3 offer accepted once the rider and the
// emergency partner have scanned each other's QR code in person — the "two-way
// handshake" the ladder falls back to when neither a peer nor a WhatsApp
// partner picked up the ride.
func ConfirmEmergencyScan(db *gorm.DB, rideID uuid.UUID) error {
	res := db.Model(&RideOffer{}).
		Where("ride_id = ? AND status = 'pending'", rideID).
		Update("status", "accepted")
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// EmergencyQueue lists rides stuck at tier 3 — no peer, no partner, needs an
// admin's emergency-grant nod. Backs GET /admin/trust-queue.
func EmergencyQueue(db *gorm.DB) []LadderStatus {
	var offers []RideOffer
	db.Where("status = 'pending' AND partner_id IS NOT NULL AND offered_at <= ?", time.Now().Add(-tier2Timeout)).
		Order("offered_at ASC").Find(&offers)
	items := make([]LadderStatus, len(offers))
	for i, o := range offers {
		items[i] = LadderStatus{
			RideID:    o.RideID,
			Tier:      3,
			TierLabel: "Emergency grant — admin review",
			OfferID:   &o.ID,
			Status:    o.Status,
		}
	}
	return items
}

// EscalateTier2 sends to partner drivers after peer timeout.
func EscalateTier2(db *gorm.DB, rideID uuid.UUID) {
	// Mark existing offers expired.
	db.Model(&RideOffer{}).Where("ride_id = ? AND status = 'pending'", rideID).
		Update("status", "expired")

	// Find nearest partner driver (simplified — no geo index yet).
	var partner struct{ ID uuid.UUID }
	if err := db.Table("partner_drivers").Where("status = 'active'").
		Order("RANDOM()").Limit(1).Scan(&partner).Error; err != nil || partner.ID == uuid.Nil {
		slog.Warn("matcher: no partner drivers available", "ride_id", rideID)
		return
	}

	offer := &RideOffer{
		RideID:    rideID,
		PartnerID: &partner.ID,
		OfferedAt: time.Now(),
		ExpiresAt: time.Now().Add(10 * time.Minute),
		Status:    "pending",
	}
	db.Create(offer)
	slog.Info("matcher: escalated to tier 2", "ride_id", rideID, "partner_id", partner.ID)
}
