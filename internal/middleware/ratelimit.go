package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// rateBucket — sliding window per key, in-memory.
//
// For a single-instance API this is plenty. When we shard the API we'll
// swap this for a Redis-backed limiter; the public Allow signature stays
// the same, so middleware callers won't change.
type rateBucket struct {
	hits []time.Time
}

type Limiter struct {
	mu     sync.Mutex
	window time.Duration
	max    int
	keys   map[string]*rateBucket
	keyFn  func(*fiber.Ctx) string
	msg    string
}

// NewLimiter — at most `max` requests per `window` per key.
// `keyFn` extracts the rate-limit key (defaults to remote IP if nil).
func NewLimiter(max int, window time.Duration, keyFn func(*fiber.Ctx) string, msg string) *Limiter {
	if keyFn == nil {
		keyFn = func(c *fiber.Ctx) string { return c.IP() }
	}
	if msg == "" {
		msg = "too_many_requests"
	}
	l := &Limiter{
		window: window,
		max:    max,
		keys:   make(map[string]*rateBucket),
		keyFn:  keyFn,
		msg:    msg,
	}
	// Lazy GC — every minute, drop empty buckets.
	go l.gc()
	return l
}

func (l *Limiter) Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := l.keyFn(c)
		if key == "" {
			return c.Next()
		}
		now := time.Now()
		threshold := now.Add(-l.window)

		l.mu.Lock()
		bucket, ok := l.keys[key]
		if !ok {
			bucket = &rateBucket{}
			l.keys[key] = bucket
		}
		// Drop expired hits.
		fresh := bucket.hits[:0]
		for _, t := range bucket.hits {
			if t.After(threshold) {
				fresh = append(fresh, t)
			}
		}
		bucket.hits = fresh
		if len(bucket.hits) >= l.max {
			retryAfter := bucket.hits[0].Add(l.window).Sub(now)
			l.mu.Unlock()
			c.Set("Retry-After", formatSeconds(retryAfter))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": l.msg})
		}
		bucket.hits = append(bucket.hits, now)
		l.mu.Unlock()
		return c.Next()
	}
}

func (l *Limiter) gc() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		threshold := now.Add(-l.window)
		l.mu.Lock()
		for k, b := range l.keys {
			active := b.hits[:0]
			for _, h := range b.hits {
				if h.After(threshold) {
					active = append(active, h)
				}
			}
			if len(active) == 0 {
				delete(l.keys, k)
				continue
			}
			b.hits = active
		}
		l.mu.Unlock()
	}
}

func formatSeconds(d time.Duration) string {
	s := int(d.Seconds())
	if s < 1 {
		s = 1
	}
	return itoa(s)
}

// itoa avoids pulling in strconv just for a small int.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := make([]byte, 0, 4)
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	return string(out)
}

// ByIPAndEmail — rate-limit credentials-bearing requests by IP *and*
// (best-effort) the email being attempted. Reads the email from the JSON
// body without consuming it for the next handler — the body is cached on
// the Fiber context so subsequent BodyParser calls still work.
func ByIPAndEmail(c *fiber.Ctx) string {
	ip := c.IP()
	body := c.Body()
	if i := indexJSONField(body, "email"); i >= 0 {
		return ip + "|" + extractJSONString(body, i)
	}
	return ip
}

// indexJSONField — finds the start of a value for a string-typed JSON
// field, returns the index of the opening quote. Returns -1 if not found.
// Tolerant of whitespace and key reordering; not a real parser.
func indexJSONField(body []byte, field string) int {
	needle := []byte(`"` + field + `"`)
	for i := 0; i+len(needle) < len(body); i++ {
		if string(body[i:i+len(needle)]) != string(needle) {
			continue
		}
		j := i + len(needle)
		// skip whitespace and colon
		for j < len(body) && (body[j] == ' ' || body[j] == ':' || body[j] == '\t') {
			j++
		}
		if j < len(body) && body[j] == '"' {
			return j
		}
	}
	return -1
}

func extractJSONString(body []byte, openQuoteIdx int) string {
	if openQuoteIdx < 0 || openQuoteIdx >= len(body) || body[openQuoteIdx] != '"' {
		return ""
	}
	end := openQuoteIdx + 1
	for end < len(body) && body[end] != '"' {
		if body[end] == '\\' && end+1 < len(body) {
			end += 2
			continue
		}
		end++
	}
	return string(body[openQuoteIdx+1 : end])
}
