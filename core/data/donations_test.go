package data

import (
	"testing"

	"github.com/aoiasakawa/aoitube/models"
)

// A zero-amount manual grant (an operator handing out archive access) is not a
// sale: it must not inflate the purchase count, drag the average down, or show
// up as a ¥0 provider line in the dashboard stats.
func TestDonationStatsExcludeZeroAmountGrants(t *testing.T) {
	paid := &models.Donation{
		ID:              "don-paid-1",
		UserID:          "buyer-1",
		Amount:          1000,
		Currency:        "JPY",
		DisplayName:     "Buyer One",
		PaymentProvider: "stripe",
		PaymentID:       "pay-paid-1",
		ItemType:        models.DonationItemArchive,
		ArchiveID:       "arc-1",
	}
	grant := &models.Donation{
		ID:              "don-grant-1",
		UserID:          "buyer-2",
		Amount:          0,
		Currency:        "JPY",
		DisplayName:     "Buyer Two",
		PaymentProvider: "manual",
		PaymentID:       "manual-don-grant-1",
		ItemType:        models.DonationItemArchive,
		ArchiveID:       "arc-1",
	}
	if err := AddDonation(paid); err != nil {
		t.Fatalf("AddDonation(paid): %v", err)
	}
	if err := AddDonation(grant); err != nil {
		t.Fatalf("AddDonation(grant): %v", err)
	}

	stats, err := GetDonationStats()
	if err != nil {
		t.Fatalf("GetDonationStats: %v", err)
	}

	var count, total int64
	for _, c := range stats.Currencies {
		if c.Currency == "JPY" {
			count = c.Count
			total = c.Total
		}
	}
	if count != 1 {
		t.Fatalf("JPY purchase count = %d, want 1 (¥0 grant must be excluded)", count)
	}
	if total != 1000 {
		t.Fatalf("JPY total = %d, want 1000", total)
	}

	for _, p := range stats.Providers {
		if p.Provider == "manual" {
			t.Fatalf("manual ¥0 grant leaked into provider breakdown: %+v", p)
		}
	}

	if stats.UniquePurchasers != 1 {
		t.Fatalf("unique purchasers = %d, want 1 (grant recipient is not a purchaser)", stats.UniquePurchasers)
	}

	// The grant must still confer viewing access even though it is excluded
	// from revenue.
	if ok, err := HasPurchasedArchive("buyer-2", "arc-1"); err != nil || !ok {
		t.Fatalf("HasPurchasedArchive(grant recipient) = %v, %v; want true, nil", ok, err)
	}
}
