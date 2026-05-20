package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
)

var phoneDigits = regexp.MustCompile(`^\d{9,11}$`)

func normalizePhone(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "-", "")
	if strings.HasPrefix(s, "+234") {
		return s, nil
	}
	if strings.HasPrefix(s, "0") {
		s = s[1:]
	}
	if !phoneDigits.MatchString(s) {
		return "", errors.New("phone must be a Nigerian number")
	}
	return "+234" + s, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
