package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

type spendCoinsRequest struct {
	Amount      float64 `json:"amount"`
	Message     string  `json:"message"`
	DisplayName string  `json:"displayName"`
	IsAnonymous bool    `json:"isAnonymous"`
	ItemType    string  `json:"itemType"`
	EffectType  string  `json:"effectType"`
	ArchiveID   string  `json:"archiveId"`
}

// SpendCoins pays for a purchase from the viewer's prepaid coin balance with no
// external provider. It debits the wallet atomically, records the purchase as a
// coin-funded donation (payment_provider "coin", excluded from revenue so the
// money isn't double-counted with the original top-up), then broadcasts or
// entitles exactly like a normal confirmation. Coins equal base-currency minor
// units, so a purchase priced in those units costs that many coins.
func SpendCoins(u user.User, w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}
	if !data.GetCoinWalletEnabled() {
		WriteSimpleResponse(w, false, "coins are not available")
		return
	}
	if !u.IsEnabled() {
		WriteSimpleResponse(w, false, "account not available")
		return
	}

	var req spendCoinsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	itemType, effectType, err := normalizePurchaseItem(req.ItemType, req.EffectType)
	if err != nil {
		WriteSimpleResponse(w, false, err.Error())
		return
	}
	if itemType == models.DonationItemCoin {
		WriteSimpleResponse(w, false, "cannot buy coins with coins")
		return
	}

	baseCurrency := data.GetBaseCurrency()

	// Resolve the coin cost (base-currency minor units) for each item type.
	var cost int64
	var archiveID string
	switch itemType {
	case models.DonationItemEffect:
		price, ok := models.GetEffectPrice(effectType, baseCurrency)
		if !ok {
			WriteSimpleResponse(w, false, "invalid effect type")
			return
		}
		cost = models.FiatToStoredUnits(float64(price), baseCurrency)
	case models.DonationItemArchive:
		uid, price, currency, aerr := resolveArchivePurchase(r, req.ArchiveID)
		if aerr != nil {
			WriteSimpleResponse(w, false, aerr.Error())
			return
		}
		if uid != u.ID {
			WriteSimpleResponse(w, false, "archive purchase user mismatch")
			return
		}
		// The manifest price is in the archive's own currency's minor units; a
		// coin (base minor unit) only equals it when the currencies match.
		if currency != baseCurrency {
			WriteSimpleResponse(w, false, "this archive can't be paid with coins")
			return
		}
		cost = price
		archiveID = req.ArchiveID
	default: // superchat
		if req.Amount <= 0 || req.Amount > maxDonationAmount {
			WriteSimpleResponse(w, false, "invalid amount")
			return
		}
		cost = models.FiatToStoredUnits(req.Amount, baseCurrency)
	}

	if cost <= 0 {
		WriteSimpleResponse(w, false, "invalid amount")
		return
	}

	// Debit the wallet atomically; refuse if the balance is insufficient.
	donationID := shortid.MustGenerate()
	ok, err := data.SpendWallet(u.ID, cost, "donation:"+donationID)
	if err != nil {
		WriteSimpleResponse(w, false, "unable to spend coins")
		return
	}
	if !ok {
		WriteSimpleResponse(w, false, "insufficient coin balance")
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = u.DisplayName
	}

	donation := &models.Donation{
		ID:              donationID,
		UserID:          u.ID,
		Amount:          cost,
		Currency:        baseCurrency,
		Message:         req.Message,
		DisplayName:     displayName,
		IsAnonymous:     req.IsAnonymous,
		PaymentProvider: models.PaymentProviderCoin,
		PaymentID:       "coin-" + donationID,
		ItemType:        itemType,
		EffectType:      effectType,
		// Base-currency value so the purchase still counts in the supporter
		// ranking (which sums amount_jpy); revenue excludes provider "coin".
		AmountJPY:    cost,
		FiatCurrency: baseCurrency,
		ArchiveID:    archiveID,
	}

	if err := data.AddDonation(donation); err != nil {
		// Roll the debit back so a lost purchase doesn't cost the viewer coins.
		if rerr := data.RefundWallet(u.ID, cost, "refund:"+donationID); rerr != nil {
			log.Errorf("coin spend %s: AddDonation failed and refund failed: %v / %v", donationID, err, rerr)
		}
		WriteSimpleResponse(w, false, "unable to record purchase")
		return
	}

	// Archive entitlements are private: no chat broadcast or webhook.
	if itemType == models.DonationItemArchive {
		balance, _ := data.GetWalletBalance(u.ID)
		WriteResponse(w, map[string]interface{}{"success": true, "balance": balance})
		return
	}

	broadcastName := displayName
	if req.IsAnonymous {
		broadcastName = ""
	}
	event := events.NewDonationEvent(
		donation.ID, donation.Amount, donation.Currency, donation.Message,
		broadcastName, donation.IsAnonymous, nil,
	).WithItem(donation.ItemType, donation.EffectType)
	broadcastPurchaseEvent(event, false, "coin")

	webhooks.SendEventToWebhooks(webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	})

	balance, _ := data.GetWalletBalance(u.ID)
	log.Infof("Coin spend: user=%s cost=%d item=%s balance=%d", u.ID, cost, itemType, balance)
	WriteResponse(w, map[string]interface{}{"success": true, "balance": balance})
}
