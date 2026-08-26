package outbox

import (
	"context"
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// Handler processes a single outbox event. Return nil to mark sent.
type Handler func(evt Event) error

// Dispatcher polls outbox_events and delivers them via registered handlers.
type Dispatcher struct {
	db       *gorm.DB
	handlers map[string]Handler
	stop     chan struct{}
}

func NewDispatcher(db *gorm.DB) *Dispatcher {
	return &Dispatcher{
		db:       db,
		handlers: make(map[string]Handler),
		stop:     make(chan struct{}),
	}
}

// Register adds a handler for an event type. Call before Start().
func (d *Dispatcher) Register(eventType string, h Handler) {
	d.handlers[eventType] = h
}

// Start launches the polling goroutine. Call once from main().
func (d *Dispatcher) Start() {
	go d.loop()
}

// Stop signals the dispatcher to exit.
func (d *Dispatcher) Stop() { close(d.stop) }

func (d *Dispatcher) loop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-d.stop:
			return
		case <-ticker.C:
			d.flush()
		}
	}
}

func (d *Dispatcher) flush() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = ctx

	var events []Event
	if err := d.db.
		Where("status IN ('pending','failed') AND next_retry_at <= ?", time.Now()).
		Order("next_retry_at ASC").
		Limit(50).
		Find(&events).Error; err != nil {
		slog.Error("outbox: fetch failed", "err", err)
		return
	}

	for _, evt := range events {
		d.deliver(evt)
	}
}

func (d *Dispatcher) deliver(evt Event) {
	h, ok := d.handlers[evt.EventType]
	if !ok {
		// No handler registered — mark dead so it doesn't loop forever.
		d.db.Model(&Event{}).Where("id = ?", evt.ID).Updates(map[string]any{
			"status":     "dead",
			"last_error": "no handler registered",
		})
		return
	}

	err := h(evt)
	now := time.Now()
	if err == nil {
		d.db.Model(&Event{}).Where("id = ?", evt.ID).Updates(map[string]any{
			"status":  "sent",
			"sent_at": now,
		})
		return
	}

	attempts := evt.Attempts + 1
	status := "failed"
	errStr := err.Error()
	// Exponential backoff: 5s, 25s, 125s, … cap at 1h.
	backoff := time.Duration(5<<uint(attempts)) * time.Second
	if backoff > time.Hour {
		backoff = time.Hour
	}
	if attempts >= 10 {
		status = "dead"
	}
	d.db.Model(&Event{}).Where("id = ?", evt.ID).Updates(map[string]any{
		"status":         status,
		"attempts":       attempts,
		"next_retry_at":  now.Add(backoff),
		"last_error":     errStr,
	})
	slog.Warn("outbox: delivery failed", "event_id", evt.ID, "type", evt.EventType, "err", errStr, "attempts", attempts)
}
