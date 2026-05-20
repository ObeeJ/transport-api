package paystack

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"testing"
)

// TestVerifyWebhookSignature_RoundTrip — sign a body with the same secret
// and confirm verification accepts it. Then tamper with each side and
// confirm verification rejects.
func TestVerifyWebhookSignature_RoundTrip(t *testing.T) {
	c := New("test_secret")
	body := []byte(`{"event":"charge.success","data":{"reference":"akin_abc"}}`)

	mac := hmac.New(sha512.New, []byte("test_secret"))
	mac.Write(body)
	good := hex.EncodeToString(mac.Sum(nil))

	if !c.VerifyWebhookSignature(body, good) {
		t.Fatal("matching signature was rejected")
	}
	if c.VerifyWebhookSignature(body, "0"+good[1:]) {
		t.Fatal("tampered signature accepted")
	}
	if c.VerifyWebhookSignature(append(body, 'x'), good) {
		t.Fatal("signature accepted after body tampering")
	}
	if c.VerifyWebhookSignature(body, "") {
		t.Fatal("empty signature accepted")
	}
}

func TestVerifyWebhookSignature_RefusesEmptySecret(t *testing.T) {
	c := New("")
	if c.VerifyWebhookSignature([]byte(`{}`), "anything") {
		t.Fatal("empty secret should reject everything")
	}
}
