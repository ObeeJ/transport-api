package wings

import (
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// ExpiryWorker runs hourly and marks expired grants, returning their value to the pool.
type ExpiryWorker struct {
	db   *gorm.DB
	stop chan struct{}
}

func NewExpiryWorker(db *gorm.DB) *ExpiryWorker {
	return &ExpiryWorker{db: db, stop: make(chan struct{})}
}

func (w *ExpiryWorker) Start() { go w.loop() }
func (w *ExpiryWorker) Stop()  { close(w.stop) }

func (w *ExpiryWorker) loop() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	w.run() // run immediately on start
	for {
		select {
		case <-w.stop:
			return
		case <-ticker.C:
			w.run()
		}
	}
}

func (w *ExpiryWorker) run() {
	res := w.db.Model(&Grant{}).
		Where("status = 'active' AND expires_at < ?", time.Now()).
		Update("status", "expired")
	if res.Error != nil {
		slog.Error("wings expiry worker", "err", res.Error)
		return
	}
	if res.RowsAffected > 0 {
		slog.Info("wings expired", "count", res.RowsAffected)
	}
}
