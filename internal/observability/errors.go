// Package observability provides hooks for error reporting and metrics
// without committing to a specific vendor yet. The default Reporter is a
// no-op; wire in Sentry / Honeybadger / whatever by setting a non-default
// reporter at boot.
//
// This avoids the common trap where Sentry-specific code is sprinkled
// across handlers, making it hard to swap or test.
package observability

import (
	"log/slog"
	"sync"
)

// Reporter — captures errors and panics. Implementations should be
// goroutine-safe and never block: they should buffer + ship async.
type Reporter interface {
	Capture(err error, tags map[string]string)
}

type noopReporter struct{}

func (noopReporter) Capture(err error, _ map[string]string) {
	// Default behavior: log only. Helpful in dev; replaced by Sentry in prod.
	if err != nil {
		slog.Error("captured (noop reporter)", "err", err)
	}
}

var (
	mu       sync.RWMutex
	reporter Reporter = noopReporter{}
)

func SetReporter(r Reporter) {
	mu.Lock()
	reporter = r
	mu.Unlock()
}

func Capture(err error, tags map[string]string) {
	mu.RLock()
	r := reporter
	mu.RUnlock()
	r.Capture(err, tags)
}
