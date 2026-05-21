package reconciler

import (
	"log/slog"
	"time"

	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"github.com/obeej/akin/internal/service"
	"gorm.io/gorm"
)

// WeeklyCreditJob — credits every approved + attendance-passing recipient's
// wallet once per week, up to their weekly cap. Idempotent: keyed on
// (user_id, week_start) via the wallet_transactions.ref_id field, so the
// job can run on any cadence (every reconciler tick is fine).
//
// "No attendance pass, no funds." A recipient who missed the previous
// full week — or whose attendance wasn't recorded — gets nothing this
// week. Stewards backfill via CSV upload or manual override; the next
// tick picks them up automatically.
type WeeklyCreditJob struct {
	recipients *repository.RecipientRepo
	wallet     *service.WalletService
	attendance *service.AttendanceService
	db         *gorm.DB
}

func NewWeeklyCreditJob(
	recipients *repository.RecipientRepo,
	wallet *service.WalletService,
	attendance *service.AttendanceService,
	db *gorm.DB,
) *WeeklyCreditJob {
	return &WeeklyCreditJob{
		recipients: recipients,
		wallet:     wallet,
		attendance: attendance,
		db:         db,
	}
}

// Run sweeps approved recipients and credits any that haven't been paid
// yet this week. Safe to call on every reconciler tick.
func (j *WeeklyCreditJob) Run() {
	if j == nil || j.recipients == nil || j.wallet == nil {
		return
	}
	recipients, err := j.recipients.ListApproved()
	if err != nil {
		slog.Error("weekly_credit: list approved", "err", err)
		return
	}

	thisWeek := models.WeekStartOf(time.Now())
	weekKey := thisWeek.Format("2006-01-02")

	credited := 0
	skipped := 0

	for _, r := range recipients {
		// Plan rule: a recipient with no cap set yet isn't disbursable.
		if r.WeeklyCapKobo <= 0 {
			skipped++
			continue
		}
		// No attendance pass, no funds.
		if j.attendance != nil {
			if err := j.attendance.EligibleForPayout(r.UserID); err != nil {
				skipped++
				continue
			}
		}
		// Idempotent per (recipient, week) — the wallet ledger refuses
		// to insert a duplicate ref_id, so re-runs are no-ops.
		refID := "weekly:" + r.UserID.String() + ":" + weekKey
		ok, err := j.wallet.CreditOnce(
			r.UserID,
			r.WeeklyCapKobo,
			"Weekly support · "+r.PseudonymousID+" · "+weekKey,
			refID,
		)
		if err != nil {
			slog.Error("weekly_credit: credit", "err", err, "recipient", r.PseudonymousID)
			continue
		}
		if !ok {
			// Already credited this week — nothing to do.
			continue
		}
		credited++
		audit.Record(j.db, "system", "weekly_credit_disbursed", r.ID.String(), map[string]any{
			"pseudonymousId": r.PseudonymousID,
			"amountKobo":     r.WeeklyCapKobo,
			"weekStart":      weekKey,
		})
	}

	if credited > 0 {
		slog.Info("weekly_credit: disbursed", "credited", credited, "week", weekKey)
	}
}
