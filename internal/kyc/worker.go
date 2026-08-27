package kyc

import (
	"encoding/json"
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// Worker drains the kyc_jobs queue and calls Prembly.
type Worker struct {
	db      *gorm.DB
	client  *PremblyClient
	stop    chan struct{}
}

func NewWorker(db *gorm.DB, client *PremblyClient) *Worker {
	return &Worker{db: db, client: client, stop: make(chan struct{})}
}

func (w *Worker) Start() { go w.loop() }
func (w *Worker) Stop()  { close(w.stop) }

func (w *Worker) loop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-ticker.C:
			w.flush()
		}
	}
}

func (w *Worker) flush() {
	var jobs []Job
	if err := w.db.Where("status = 'queued'").Order("created_at ASC").Limit(10).Find(&jobs).Error; err != nil {
		return
	}
	for _, job := range jobs {
		w.process(job)
	}
}

func (w *Worker) process(job Job) {
	w.db.Model(&Job{}).Where("id = ?", job.ID).Updates(map[string]any{
		"status": "running", "attempts": job.Attempts + 1,
	})

	var payload map[string]any
	_ = json.Unmarshal(job.Payload, &payload)

	var result map[string]any
	var tier int
	var verified bool
	var err error

	if w.client != nil {
		nin, _ := payload["nin"].(string)
		result, verified, err = w.client.VerifyNIN(nin)
	} else {
		// No client configured — mark as done with tier 0.
		result = map[string]any{"mock": true}
		verified = false
	}

	now := time.Now()
	if err != nil {
		w.db.Model(&Job{}).Where("id = ?", job.ID).Updates(map[string]any{
			"status": "failed",
		})
		slog.Warn("kyc job failed", "job_id", job.ID, "err", err)
		return
	}

	if verified {
		tier = 1
	}

	raw, _ := json.Marshal(result)
	w.db.Model(&Job{}).Where("id = ?", job.ID).Updates(map[string]any{
		"status": "done", "result": raw, "completed_at": now,
	})

	// Upsert KYC record.
	rec := Record{
		UserID:      job.UserID,
		NINVerified: verified,
		Tier:        tier,
		Provider:    "prembly",
		RawResponse: raw,
		UpdatedAt:   now,
	}
	w.db.Where("user_id = ?", job.UserID).Assign(rec).FirstOrCreate(&rec)
}
