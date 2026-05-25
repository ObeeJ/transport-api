package sanitize_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/obeej/akin/internal/sanitize"
)

func TestEmail(t *testing.T) {
	ok := func(in, want string) {
		t.Helper()
		got, err := sanitize.Email(in)
		if err != nil {
			t.Fatalf("Email(%q) unexpected error: %v", in, err)
		}
		if got != want {
			t.Fatalf("Email(%q) = %q, want %q", in, got, want)
		}
	}
	bad := func(in string, sentinel error) {
		t.Helper()
		_, err := sanitize.Email(in)
		if !errors.Is(err, sentinel) {
			t.Fatalf("Email(%q) error = %v, want %v", in, err, sentinel)
		}
	}

	ok("  Foo@Bar.com  ", "foo@bar.com")
	ok("USER@EXAMPLE.ORG", "user@example.org")

	bad("", sanitize.ErrEmpty)
	bad("foo", sanitize.ErrFormat)
	bad("@bar.com", sanitize.ErrFormat)
	bad("a@b", sanitize.ErrFormat)
	bad(strings.Repeat("a", 250)+"@b.com", sanitize.ErrTooLong)
}

func TestText(t *testing.T) {
	ok := func(in, want string) {
		t.Helper()
		got, err := sanitize.Text(in, sanitize.MaxNote)
		if err != nil {
			t.Fatalf("Text(%q) unexpected error: %v", in, err)
		}
		if got != want {
			t.Fatalf("Text(%q) = %q, want %q", in, got, want)
		}
	}
	bad := func(in string, sentinel error) {
		t.Helper()
		_, err := sanitize.Text(in, sanitize.MaxNote)
		if !errors.Is(err, sentinel) {
			t.Fatalf("Text(%q) error = %v, want %v", in, err, sentinel)
		}
	}

	ok("hello world", "hello world")
	ok("  hello  ", "hello")
	ok("Ayo   Bello", "Ayo Bello")
	ok("line1\nline2", "line1\nline2")
	ok("tab\there", "tab\there")
	ok("cr\rhere", "cr\rhere")

	bad("", sanitize.ErrEmpty)
	bad("hello\x00world", sanitize.ErrInvalidChar)
	bad("esc\x1bchar", sanitize.ErrInvalidChar)
	bad(strings.Repeat("a", sanitize.MaxNote+1), sanitize.ErrTooLong)
}

func TestSingleLine(t *testing.T) {
	_, err := sanitize.SingleLine("hello\nworld", 100)
	if !errors.Is(err, sanitize.ErrInvalidChar) {
		t.Fatalf("SingleLine with newline: got %v, want ErrInvalidChar", err)
	}
	_, err = sanitize.SingleLine("hello\tworld", 100)
	if !errors.Is(err, sanitize.ErrInvalidChar) {
		t.Fatalf("SingleLine with tab: got %v, want ErrInvalidChar", err)
	}
	got, err := sanitize.SingleLine("  ABC-123  ", 20)
	if err != nil || got != "ABC-123" {
		t.Fatalf("SingleLine trim: got %q, %v", got, err)
	}
}

func TestDigitsOnly(t *testing.T) {
	got, err := sanitize.DigitsOnly("044", 3, 8)
	if err != nil || got != "044" {
		t.Fatalf("DigitsOnly(044): got %q, %v", got, err)
	}
	got, err = sanitize.DigitsOnly("044-abc", 3, 8)
	if err != nil || got != "044" {
		t.Fatalf("DigitsOnly strips non-digits: got %q, %v", got, err)
	}
	// too short after stripping
	_, err = sanitize.DigitsOnly("ab", 3, 8)
	if !errors.Is(err, sanitize.ErrTooLong) {
		t.Fatalf("DigitsOnly too short: got %v, want ErrTooLong", err)
	}
	// too long
	_, err = sanitize.DigitsOnly("123456789", 3, 8)
	if !errors.Is(err, sanitize.ErrTooLong) {
		t.Fatalf("DigitsOnly too long: got %v, want ErrTooLong", err)
	}
	// exact 10-digit account number
	got, err = sanitize.DigitsOnly("0123456789", 10, 20)
	if err != nil || got != "0123456789" {
		t.Fatalf("DigitsOnly account: got %q, %v", got, err)
	}
}

func TestCode(t *testing.T) {
	got, err := sanitize.Code("123456", 6)
	if err != nil || got != "123456" {
		t.Fatalf("Code valid: got %q, %v", got, err)
	}
	_, err = sanitize.Code("12345", 6)
	if !errors.Is(err, sanitize.ErrFormat) {
		t.Fatalf("Code wrong length: got %v, want ErrFormat", err)
	}
	_, err = sanitize.Code("abcdef", 6)
	if !errors.Is(err, sanitize.ErrFormat) {
		t.Fatalf("Code non-digits: got %v, want ErrFormat", err)
	}
	_, err = sanitize.Code("1234567", 6)
	if !errors.Is(err, sanitize.ErrFormat) {
		t.Fatalf("Code too long: got %v, want ErrFormat", err)
	}
}

func TestEnum(t *testing.T) {
	got, err := sanitize.Enum("Car", "car", "bus", "minivan")
	if err != nil || got != "car" {
		t.Fatalf("Enum case-insensitive: got %q, %v", got, err)
	}
	got, err = sanitize.Enum("  BUS  ", "car", "bus", "minivan")
	if err != nil || got != "bus" {
		t.Fatalf("Enum trim: got %q, %v", got, err)
	}
	_, err = sanitize.Enum("truck", "car", "bus", "minivan")
	if !errors.Is(err, sanitize.ErrFormat) {
		t.Fatalf("Enum unknown: got %v, want ErrFormat", err)
	}
	_, err = sanitize.Enum("", "car", "bus")
	if !errors.Is(err, sanitize.ErrFormat) {
		t.Fatalf("Enum empty: got %v, want ErrFormat", err)
	}
}
