package reconciler

import (
	"context"
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// Reconciler sweeps stale data on a fixed interval and runs any attached
// background jobs (e.g., weekly wallet credits).
type Reconciler struct {
	db       *gorm.DB
	interval time.Duration
	cancel   context.CancelFunc

	weeklyCredit *WeeklyCreditJob
}

func New(db *gorm.DB, interval time.Duration) *Reconciler {
	return &Reconciler{db: db, interval: interval}
}

// WithWeeklyCredit attaches the approved-recipient weekly credit job.
// Optional — if not wired, the reconciler still runs the other sweeps.
func (r *Reconciler) WithWeeklyCredit(j *WeeklyCreditJob) *Reconciler {
	r.weeklyCredit = j
	return r
}

func (r *Reconciler) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	r.cancel = cancel
	go r.loop(ctx)
	slog.Info("reconciler started", "interval", r.interval)
}

func (r *Reconciler) Stop() {
	if r.cancel != nil {
		r.cancel()
	}
}

func (r *Reconciler) loop(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	r.run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.run()
		}
	}
}

// RunOnce executes all reconciler sweeps immediately. Used in tests.
func (r *Reconciler) RunOnce() {
	r.run()
}

func (r *Reconciler) run() {
	r.expireStalePendingDeposits()
	r.expireStalePendingPayouts()
	r.cancelPastDepartureTrips()
	r.deleteExpiredSessions()
	if r.weeklyCredit != nil {
		r.weeklyCredit.Run()
	}
}

// Deposits pending > 2 hours → failed.
func (r *Reconciler) expireStalePendingDeposits() {
	cutoff := time.Now().Add(-2 * time.Hour)
	res := r.db.Exec(
		`UPDATE giver_deposits SET status = 'failed' WHERE status = 'pending' AND created_at < ?`,
		cutoff,
	)
	if res.Error != nil {
		slog.Error("reconciler: expire deposits", "err", res.Error)
	} else if res.RowsAffected > 0 {
		slog.Info("reconciler: expired stale deposits", "count", res.RowsAffected)
	}
}

// Payouts stuck in pending (transfer initiated but no webhook) > 24h → failed.
func (r *Reconciler) expireStalePendingPayouts() {
	cutoff := time.Now().Add(-24 * time.Hour)
	res := r.db.Exec(
		`UPDATE payouts SET status = 'failed', failure_reason = 'reconciler_timeout' WHERE status = 'pending' AND created_at < ?`,
		cutoff,
	)
	if res.Error != nil {
		slog.Error("reconciler: expire payouts", "err", res.Error)
	} else if res.RowsAffected > 0 {
		slog.Info("reconciler: expired stale payouts", "count", res.RowsAffected)
	}
}

// Trips still "published" whose departure is > 30 min in the past → cancelled.
func (r *Reconciler) cancelPastDepartureTrips() {
	cutoff := time.Now().Add(-30 * time.Minute)
	now := time.Now()
	res := r.db.Exec(
		`UPDATE trips SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'auto_expired' WHERE status = 'published' AND departure_at < ?`,
		now, cutoff,
	)
	if res.Error != nil {
		slog.Error("reconciler: cancel trips", "err", res.Error)
	} else if res.RowsAffected > 0 {
		slog.Info("reconciler: cancelled past-departure trips", "count", res.RowsAffected)
	}
}

// Sessions past their expiry → deleted.
func (r *Reconciler) deleteExpiredSessions() {
	res := r.db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, time.Now())
	if res.Error != nil {
		slog.Error("reconciler: delete sessions", "err", res.Error)
	} else if res.RowsAffected > 0 {
		slog.Info("reconciler: deleted expired sessions", "count", res.RowsAffected)
	}
}
