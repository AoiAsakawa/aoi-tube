package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/router/middleware"
)

// myPurchase is one row of a viewer's own purchase history. Payment
// references (provider transaction IDs) are deliberately omitted — support
// cases go through the operator, who sees them in the admin panel.
type myPurchase struct {
	ID         string `json:"id"`
	CreatedAt  string `json:"createdAt"`
	ItemType   string `json:"itemType"`
	EffectType string `json:"effectType,omitempty"`
	Amount     int64  `json:"amount"`
	Currency   string `json:"currency"`
	Provider   string `json:"provider"`
	IsTest     bool   `json:"isTest,omitempty"`
	ArchiveID  string `json:"archiveId,omitempty"`
	// ArchiveTitle resolves the archive's current title; empty when the
	// archive no longer exists.
	ArchiveTitle string `json:"archiveTitle,omitempty"`
	// ArchiveAvailable is true when the purchased archive can still be
	// watched (it exists and finished recording).
	ArchiveAvailable bool `json:"archiveAvailable,omitempty"`
}

// GetMyPurchases returns the requesting viewer's own purchase history
// (archives, Super Chats, screen effects), resolved from their access token.
func GetMyPurchases(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	u := requestChatUser(r)
	if u == nil || !u.IsEnabled() {
		// No valid token: an empty history, not an error, so the UI can show
		// its login hint without special-casing failures.
		WriteResponse(w, []myPurchase{})
		return
	}

	rows, err := data.GetPurchasesByUser(u.ID)
	if err != nil {
		WriteSimpleResponse(w, false, "failed to fetch purchases")
		return
	}

	out := make([]myPurchase, 0, len(rows))
	for _, row := range rows {
		p := myPurchase{
			ID:         row.ID,
			CreatedAt:  row.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			ItemType:   row.ItemType,
			EffectType: row.EffectType,
			Amount:     row.Amount,
			Currency:   row.Currency,
			Provider:   row.PaymentProvider,
			IsTest:     row.IsTest,
			ArchiveID:  row.ArchiveID,
		}
		if row.ArchiveID != "" {
			if m, ok := recording.ReadManifest(row.ArchiveID); ok {
				p.ArchiveTitle = m.Title
				p.ArchiveAvailable = m.FinishedOk
			}
		}
		out = append(out, p)
	}
	WriteResponse(w, out)
}
