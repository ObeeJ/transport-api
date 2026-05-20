package service

import "testing"

func TestNormalizePhone(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{"local 11-digit", "08034129087", "+2348034129087", false},
		{"local 10-digit no zero", "8034129087", "+2348034129087", false},
		{"already e164", "+2348034129087", "+2348034129087", false},
		{"with spaces", "0803 412 9087", "+2348034129087", false},
		{"with dashes", "0803-412-9087", "+2348034129087", false},
		{"too short", "12345", "", true},
		{"non-digits", "080341abc87", "", true},
		{"empty", "", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizePhone(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q, got %q", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("normalizePhone(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
