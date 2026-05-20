package models

import (
	"testing"
	"time"
)

// WeekStartOf is the anchor for the whole attendance gate. If this drifts,
// recipients can be incorrectly blocked or paid out.
func TestWeekStartOf_MondayAnchored(t *testing.T) {
	// 2026-05-20 is a Wednesday. Its ISO week starts on 2026-05-18 (Monday).
	wed := time.Date(2026, 5, 20, 14, 30, 0, 0, time.UTC)
	got := WeekStartOf(wed)
	want := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("WeekStartOf(Wed): got %s, want %s", got, want)
	}
}

func TestWeekStartOf_SundayGoesToPriorMonday(t *testing.T) {
	// 2026-05-24 is a Sunday — still part of the week that started 2026-05-18.
	sun := time.Date(2026, 5, 24, 23, 59, 59, 0, time.UTC)
	got := WeekStartOf(sun)
	want := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("WeekStartOf(Sun): got %s, want %s", got, want)
	}
}

func TestWeekStartOf_MondayIsIdempotent(t *testing.T) {
	mon := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	got := WeekStartOf(mon)
	if !got.Equal(mon) {
		t.Fatalf("WeekStartOf(Mon): got %s, want %s", got, mon)
	}
}
