package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/teris-io/shortid"
)

// archivePurchaseEntry is one purchase row enriched with the buyer's current
// account name (the row's display_name is frozen at purchase time and the
// buyer may have renamed since).
type archivePurchaseEntry struct {
	*models.Donation
	// BuyerCurrentName is the buyer account's present display name, empty if
	// the user no longer resolves.
	BuyerCurrentName string `json:"buyerCurrentName,omitempty"`
}

// GetArchivePurchases lists every purchase of an archive for the admin
// purchase-management panel.
func GetArchivePurchases(w http.ResponseWriter, r *http.Request) {
	archiveID := r.URL.Query().Get("id")
	if archiveID == "" || strings.ContainsAny(archiveID, "/\\.") {
		controllers.WriteSimpleResponse(w, false, "invalid archive id")
		return
	}

	rows, err := data.GetArchivePurchases(archiveID)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to fetch purchases")
		return
	}

	out := make([]archivePurchaseEntry, 0, len(rows))
	for _, row := range rows {
		entry := archivePurchaseEntry{Donation: row}
		if row.UserID != "" {
			if u := user.GetUserByID(row.UserID); u != nil {
				entry.BuyerCurrentName = u.DisplayName
			}
		}
		out = append(out, entry)
	}
	controllers.WriteResponse(w, out)
}

// GrantArchivePurchase manually grants a viewer access to an archive by
// recording a zero-amount manual purchase row — the same shape the payment
// providers write, so every entitlement check works unchanged. Used for
// comps and support cases (e.g. payment arrived but the webhook was lost).
func GrantArchivePurchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req struct {
		ArchiveID string `json:"archiveId"`
		UserID    string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ArchiveID == "" || req.UserID == "" {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if strings.ContainsAny(req.ArchiveID, "/\\.") {
		controllers.WriteSimpleResponse(w, false, "invalid archive id")
		return
	}

	manifest, ok := recording.ReadManifest(req.ArchiveID)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "archive not found")
		return
	}

	buyer := user.GetUserByID(req.UserID)
	if buyer == nil {
		controllers.WriteSimpleResponse(w, false, "user not found")
		return
	}

	if purchased, err := data.HasPurchasedArchive(req.UserID, req.ArchiveID); err == nil && purchased {
		controllers.WriteSimpleResponse(w, false, "user already has access to this archive")
		return
	}

	currency := manifest.Currency
	if currency == "" {
		currency = data.GetBaseCurrency()
	}
	donationID := shortid.MustGenerate()
	donation := &models.Donation{
		ID:              donationID,
		UserID:          buyer.ID,
		Amount:          0,
		Currency:        currency,
		DisplayName:     buyer.DisplayName,
		PaymentProvider: "manual",
		PaymentID:       "manual-" + donationID,
		ItemType:        models.DonationItemArchive,
		ArchiveID:       req.ArchiveID,
	}
	// No chat broadcast / webhook: an archive entitlement is a private grant,
	// not a Super Chat (same rule as provider-confirmed archive purchases).
	if err := data.AddDonation(donation); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to record grant")
		return
	}
	controllers.WriteResponse(w, donation)
}

// RevokeArchivePurchase deletes a purchase row, removing the buyer's access.
func RevokeArchivePurchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req struct {
		DonationID string `json:"donationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.DonationID == "" {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if err := data.DeleteArchivePurchase(req.DonationID); err != nil {
		controllers.WriteSimpleResponse(w, false, "purchase not found")
		return
	}
	controllers.WriteSimpleResponse(w, true, "revoked")
}
