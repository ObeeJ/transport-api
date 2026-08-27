package sponsor

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"gorm.io/gorm"
)

// Dispatcher periodically charges due recurring sponsors and records the
// money as a normal giver deposit into the pool — a recurring sponsor is
// just a giver on a schedule, so it reuses the same pool ledger, not a
// separate money path.
type Dispatcher struct {
	db       *gorm.DB
	provider payments.DisbursementProvider
	mock     bool
	interval time.Duration
	stop     chan struct{}
}

// NewDispatcher builds a sponsor-billing dispatcher. When mock is true (dev/
// test, MOCK_TRANSFERS=true) charges are simulated as always-succeeding
// rather than calling out to Paystack — same convention as payout mocking.
func NewDispatcher(db *gorm.DB, provider payments.DisbursementProvider, mock bool) *Dispatcher {
	return &Dispatcher{db: db, provider: provider, mock: mock, interval: time.Hour, stop: make(chan struct{})}
}

func (d *Dispatcher) Start() {
	go func() {
		ticker := time.NewTicker(d.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				d.runOnce()
			case <-d.stop:
				return
			}
		}
	}()
}

func (d *Dispatcher) Stop() { close(d.stop) }

func (d *Dispatcher) runOnce() {
	due, err := DueCharges(d.db)
	if err != nil {
		slog.Error("sponsor dispatcher: query due charges", "err", err)
		return
	}
	for _, s := range due {
		if err := d.ChargeOne(context.Background(), s); err != nil {
			slog.Warn("sponsor dispatcher: charge failed", "sponsor_id", s.ID, "err", err)
		}
	}
}

// ChargeOne charges a single recurring sponsor immediately — used by both the
// hourly sweep and the manual "retry now" endpoint. Idempotent per call:
// each attempt gets its own reference, so a retry never double-charges a
// previous success (MarkCharged already moved next_charge_at forward).
func (d *Dispatcher) ChargeOne(ctx context.Context, s RecurringSponsor) error {
	reference := "sponsor_" + s.ID.String() + "_" + time.Now().Format("20060102150405")

	var status string
	if d.mock {
		status = "success"
	} else {
		var email string
		d.db.Table("users").Where("id = ?", s.UserID).Select("email").Scan(&email)
		resp, err := d.provider.ChargeAuthorization(ctx, payments.ChargeRequest{
			Email:             email,
			AmountKobo:        s.AmountKobo,
			AuthorizationCode: s.PaystackAuthCode,
			Reference:         reference,
		})
		if err != nil {
			_ = MarkFailed(d.db, s.ID)
			return err
		}
		status = resp.Status
	}

	if status != "success" {
		return MarkFailed(d.db, s.ID)
	}

	deposit := &models.GiverDeposit{
		UserID:            s.UserID,
		AmountKobo:        s.AmountKobo,
		Currency:          "NGN",
		Frequency:         s.Cadence,
		Status:            "succeeded",
		PaystackReference: reference,
	}
	now := time.Now()
	deposit.SettledAt = &now
	if err := d.db.Create(deposit).Error; err != nil {
		return err
	}
	return MarkCharged(d.db, s.ID, s.Cadence)
}

// ChargeByID looks up one sponsor and charges it now — the manual-retry path.
func ChargeByID(ctx context.Context, db *gorm.DB, provider payments.DisbursementProvider, mock bool, id, userID uuid.UUID) error {
	var s RecurringSponsor
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&s).Error; err != nil {
		return err
	}
	d := NewDispatcher(db, provider, mock)
	return d.ChargeOne(ctx, s)
}
