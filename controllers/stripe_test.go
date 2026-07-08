package controllers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"testing"
	"time"
)

func stripeSig(secret, timestamp string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + string(payload)))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyStripeSignature(t *testing.T) {
	secret := "whsec_test_secret"
	payload := []byte(`{"id":"evt_1","type":"checkout.session.completed"}`)
	now := time.Now().Unix()
	ts := strconv.FormatInt(now, 10)
	header := "t=" + ts + ",v1=" + stripeSig(secret, ts, payload)

	if !verifyStripeSignature(payload, header, secret) {
		t.Fatal("a correctly signed, current webhook should verify")
	}

	// A tampered payload (e.g. attacker changing the amount) must fail.
	if verifyStripeSignature([]byte(`{"amount_total":999999}`), header, secret) {
		t.Error("tampered payload must not verify")
	}

	// A signature computed with a different secret must fail.
	if verifyStripeSignature(payload, header, "whsec_wrong") {
		t.Error("wrong secret must not verify")
	}

	// Replay protection: a validly signed but stale event must be rejected.
	oldTs := strconv.FormatInt(now-3600, 10)
	oldHeader := "t=" + oldTs + ",v1=" + stripeSig(secret, oldTs, payload)
	if verifyStripeSignature(payload, oldHeader, secret) {
		t.Error("stale timestamp must be rejected (replay protection)")
	}

	// Missing / malformed headers must fail rather than pass.
	if verifyStripeSignature(payload, "", secret) {
		t.Error("empty signature header must not verify")
	}
	if verifyStripeSignature(payload, "not-a-valid-header", secret) {
		t.Error("malformed signature header must not verify")
	}
}
