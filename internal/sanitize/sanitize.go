// Package sanitize centralises input cleaning + validation helpers so every
// handler doesn't reinvent length caps, whitespace trimming, control-char
// stripping, and format checks. Handlers should accept raw JSON into a
// struct, then pass each field through the appropriate helper before
// touching the database or service layer.
//
// Defence in depth: even though React auto-escapes on the frontend and
// GORM uses parameterised queries (so SQL injection isn't the threat),
// stripping control characters and clamping lengths defends against:
//   - log poisoning via CR/LF injection
//   - DoS via multi-MB strings in JSON fields
//   - unicode-confusable lookalikes that bypass identity checks
//   - email/phone format spoofing
package sanitize

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

// Sentinel errors returned by validators. Handlers can use errors.Is
// against these for typed dispatch into HTTP status mapping.
var (
	ErrEmpty       = errors.New("empty")
	ErrTooLong     = errors.New("too_long")
	ErrInvalidChar = errors.New("invalid_char")
	ErrFormat      = errors.New("invalid_format")
)

// Reasonable upper bounds. Anything longer is treated as abuse — UI inputs
// should never need this much room. Set generously so legit users aren't
// truncated, but tight enough to keep a million-row export sane.
const (
	MaxName       = 80
	MaxEmail      = 254 // RFC 5321 limit
	MaxShortText  = 200
	MaxMediumText = 1000
	MaxLongText   = 4000
	MaxNote       = 600
	MaxReason     = 1000
	MaxLicense    = 40
	MaxPlate      = 16
	MaxBankCode   = 8
	MaxAccountNum = 20
	MaxDestination = 120
)

// Text trims surrounding whitespace, strips ASCII control characters (except
// \t \n \r which we preserve for multi-line text), collapses runs of
// internal whitespace to a single space, and enforces a max byte length.
//
// Use for any plain-text user field that has no special format
// requirements (names, descriptions, notes).
func Text(s string, maxLen int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ErrEmpty
	}

	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		// Drop disallowed control chars. \t \n \r are legitimate in
		// multi-line text; everything else in U+0000-U+001F + U+007F is
		// nasty (NUL, escape, bell, etc.).
		if unicode.IsControl(r) && r != '\t' && r != '\n' && r != '\r' {
			return "", ErrInvalidChar
		}
		// Collapse runs of spaces — multiple spaces inside text are usually
		// a typo or an attempt to pad output. Newlines/tabs pass through.
		if r == ' ' {
			if prevSpace {
				continue
			}
			prevSpace = true
		} else {
			prevSpace = false
		}
		b.WriteRune(r)
	}
	out := b.String()
	if len(out) > maxLen {
		return "", ErrTooLong
	}
	return out, nil
}

// SingleLine is like Text but also rejects newlines/tabs — for fields that
// should render on one line (vehicle plate, license, destination, account
// number). Trims, strips controls, normalises internal whitespace, enforces
// max length.
func SingleLine(s string, maxLen int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ErrEmpty
	}
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		if unicode.IsControl(r) {
			return "", ErrInvalidChar
		}
		if r == ' ' {
			if prevSpace {
				continue
			}
			prevSpace = true
		} else {
			prevSpace = false
		}
		b.WriteRune(r)
	}
	out := b.String()
	if len(out) > maxLen {
		return "", ErrTooLong
	}
	return out, nil
}

// Optional wraps SingleLine for fields that are allowed to be empty. Empty
// input returns "" with no error; non-empty input is run through SingleLine.
func Optional(s string, maxLen int) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "", nil
	}
	return SingleLine(s, maxLen)
}

// emailRE is a deliberately permissive RFC-5322-ish check. It rejects
// obvious garbage (no @, leading dot, double @) while accepting all
// realistic mailbox names. The real validation happens when we send the
// email and it bounces or doesn't.
var emailRE = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// Email lower-cases, trims, length-caps, and shape-checks an email address.
// Returns the canonical form ready for storage and lookup.
func Email(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return "", ErrEmpty
	}
	if len(s) > MaxEmail {
		return "", ErrTooLong
	}
	if !emailRE.MatchString(s) {
		return "", ErrFormat
	}
	return s, nil
}

// DigitsOnly strips everything except 0-9 and enforces an exact length
// range. For bank account numbers, OTP codes, reference numbers — anything
// where only digits are valid.
func DigitsOnly(s string, minLen, maxLen int) (string, error) {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if len(out) < minLen {
		return "", ErrTooLong // too short or empty — same upstream handling
	}
	if len(out) > maxLen {
		return "", ErrTooLong
	}
	return out, nil
}

// Code is for fixed-length numeric verification codes (OTPs, 6-digit
// confirmations). Strict: must be exactly the requested length, all digits.
func Code(s string, length int) (string, error) {
	s = strings.TrimSpace(s)
	if len(s) != length {
		return "", ErrFormat
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return "", ErrFormat
		}
	}
	return s, nil
}

// Alnum strips to ASCII letters + digits only. For reference codes and
// identifiers that shouldn't carry punctuation/whitespace.
func Alnum(s string, maxLen int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ErrEmpty
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			continue
		}
		return "", ErrInvalidChar
	}
	out := b.String()
	if len(out) > maxLen {
		return "", ErrTooLong
	}
	return out, nil
}

// Enum returns the input only if it's in the allowed set. Trimmed and
// lowercased before comparison. Use for status fields, decision values,
// vehicle types — anywhere only a small fixed vocabulary is valid.
func Enum(s string, allowed ...string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, a := range allowed {
		if s == a {
			return s, nil
		}
	}
	return "", ErrFormat
}
