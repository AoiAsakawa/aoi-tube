package controllers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
)

// GetPaymentsStatus returns enabled status for supported payment providers.
// This endpoint intentionally avoids provider names in the URL path (e.g. "/paypal/")
// to reduce the chances of client-side blockers interfering with requests.
func GetPaymentsStatus(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	paypayConfig := data.GetPayPayConfig()
	metamaskConfig := data.GetMetamaskConfig()
	doneruConfig := data.GetDoneruConfig()
	paypalConfig := data.GetPayPalConfig()
	kofiConfig := data.GetKofiConfig()
	stripeConfig := data.GetStripeConfig()

	WriteResponse(w, map[string]interface{}{
		"paypay": map[string]interface{}{
			"enabled": paypayConfig.Enabled,
		},
		"metamask": map[string]interface{}{
			"enabled": metamaskConfig.Enabled,
		},
		"doneru": map[string]interface{}{
			"enabled": doneruConfig.Enabled,
		},
		"paypal": map[string]interface{}{
			"enabled":      paypalConfig.Enabled,
			"currencyCode": paypalConfig.CurrencyCode,
			"isSandbox":    paypalConfig.IsSandbox,
		},
		"kofi": map[string]interface{}{
			"enabled": kofiConfig.Enabled,
			"pageUrl": kofiConfig.PageURL,
		},
		"stripe": map[string]interface{}{
			"enabled":        stripeConfig.Enabled,
			"currencyCode":   stripeConfig.CurrencyCode,
			"isTestMode":     stripeConfig.IsTestMode,
			"publishableKey": stripeConfig.GetActivePublishableKey(),
		},
	})
}

type createPaymentRequest struct {
	Provider string `json:"provider"`

	Amount      float64 `json:"amount"`
	Message     string  `json:"message"`
	DisplayName string  `json:"displayName"`
	IsAnonymous bool    `json:"isAnonymous"`
	// ItemType selects the purchase: "superchat" (default), "effect" or
	// "archive".
	ItemType string `json:"itemType"`
	// EffectType is the screen effect to play when ItemType is "effect".
	EffectType string `json:"effectType"`
	// ArchiveID is the paid archive being purchased when ItemType is "archive".
	ArchiveID string `json:"archiveId"`
}

// purchaseDescription returns the product label used for the payment
// description shown to the buyer on their statement. English is used as the
// international default since payers may be in any locale.
func purchaseDescription(itemType string) string {
	switch itemType {
	case models.DonationItemEffect:
		return "Screen effect"
	case models.DonationItemArchive:
		return "Archive access"
	default:
		return "Super Chat"
	}
}

// broadcastPurchaseDelay postpones the chat/effect broadcast when a purchase
// was confirmed by a provider webhook. At that moment the buyer is usually
// still on the provider's payment page; the delay gives them time to get
// back to the stream so they see their own purchase play out.
const broadcastPurchaseDelay = 10 * time.Second

// broadcastPurchaseEvent sends the purchase event to all chat clients,
// optionally delayed (used for webhook-confirmed purchases).
func broadcastPurchaseEvent(event *events.DonationEvent, delayed bool, provider string) {
	send := func() {
		if err := chat.Broadcast(event); err != nil {
			log.Errorf("Failed to broadcast %s purchase event: %v", provider, err)
		}
	}
	if delayed {
		time.AfterFunc(broadcastPurchaseDelay, send)
		return
	}
	send()
}

// applyFixedEffectPrice enforces the server-side fixed price for screen
// effect purchases, in major units of the given currency. The client
// supplied amount is intentionally ignored.
func applyFixedEffectPrice(itemType, effectType, currency string, amount float64) (float64, error) {
	if itemType != models.DonationItemEffect {
		return amount, nil
	}
	price, ok := models.GetEffectPrice(effectType, currency)
	if !ok {
		return 0, errors.New("invalid effect type")
	}
	return float64(price), nil
}

// parseEffectCommand extracts a screen-effect command from the start of a
// message (e.g. "!fireworks great stream!"). Returns the effect type and the
// message with the command removed, or ("", message) when there is none.
// Used by externally-hosted payment providers (Ko-fi) that have no native
// product selection.
func parseEffectCommand(message string) (string, string) {
	trimmed := strings.TrimSpace(message)
	if !strings.HasPrefix(trimmed, "!") {
		return "", message
	}
	parts := strings.SplitN(trimmed[1:], " ", 2)
	command := strings.ToLower(strings.TrimSpace(parts[0]))
	if !models.IsValidEffectType(command) {
		return "", message
	}
	rest := ""
	if len(parts) == 2 {
		rest = strings.TrimSpace(parts[1])
	}
	return command, rest
}

// normalizePurchaseItem validates the purchased item fields and returns the
// normalized (itemType, effectType) pair. An empty item type falls back to a
// Super Chat purchase for backward compatibility.
func normalizePurchaseItem(itemType, effectType string) (string, string, error) {
	switch itemType {
	case "", models.DonationItemSuperChat:
		return models.DonationItemSuperChat, "", nil
	case models.DonationItemEffect:
		if !models.IsValidEffectType(effectType) {
			return "", "", errors.New("invalid effect type")
		}
		return models.DonationItemEffect, effectType, nil
	case models.DonationItemArchive:
		// Archive purchases carry no effect; the archive itself is validated
		// separately by resolveArchivePurchase (needs the request + archiveID).
		return models.DonationItemArchive, "", nil
	default:
		return "", "", errors.New("invalid item type")
	}
}

// resolveArchivePurchase validates a paid-archive purchase and returns the
// authenticated buyer's user ID plus the SERVER-ENFORCED price and currency
// read from the archive manifest (never the client-supplied amount). It fails
// when: the viewer isn't authenticated, the archive doesn't exist / isn't in
// paid mode / has no price, or the buyer already owns it (no double charge).
func resolveArchivePurchase(r *http.Request, archiveID string) (userID string, price int64, currency string, err error) {
	m, ok := getArchiveManifest(archiveID)
	if !ok || !m.Visible || !m.FinishedOk {
		return "", 0, "", errors.New("archive not found")
	}
	if m.AccessMode != recording.AccessModePaid || m.Price <= 0 {
		return "", 0, "", errors.New("archive is not for sale")
	}

	user := requestChatUser(r)
	if user == nil || !user.IsEnabled() {
		return "", 0, "", errors.New("you must be logged in to purchase this archive")
	}

	owned, err := data.HasPurchasedArchive(user.ID, archiveID)
	if err != nil {
		return "", 0, "", errors.New("unable to verify purchase status")
	}
	if owned {
		return "", 0, "", errors.New("you already own this archive")
	}

	currency = m.Currency
	if currency == "" {
		currency = "JPY"
	}
	return user.ID, m.Price, currency, nil
}

// CreatePayment creates a payment for a supported provider.
// Currently supports provider == "paypal".
func CreatePayment(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	log.Debugf("Payment create requested. method=%s origin=%q remote=%s", r.Method, r.Header.Get("Origin"), r.RemoteAddr)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req createPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	itemType, effectType, err := normalizePurchaseItem(req.ItemType, req.EffectType)
	if err != nil {
		WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Paid archive purchase: resolve the buyer and the server-enforced price
	// up front. userID ties the resulting entitlement to the buyer; amount is
	// overridden with the manifest price so the client can't set it.
	var archiveID, buyerUserID string
	if itemType == models.DonationItemArchive {
		uid, price, _, aerr := resolveArchivePurchase(r, req.ArchiveID)
		if aerr != nil {
			WriteSimpleResponse(w, false, aerr.Error())
			return
		}
		archiveID = req.ArchiveID
		buyerUserID = uid
		req.Amount = float64(price)
	}

	switch req.Provider {
	case "paypal":
		createPayPalPayment(w, r, payPalCreatePaymentRequest{
			Amount:      req.Amount,
			Message:     req.Message,
			DisplayName: req.DisplayName,
			IsAnonymous: req.IsAnonymous,
			ItemType:    itemType,
			EffectType:  effectType,
			ArchiveID:   archiveID,
			UserID:      buyerUserID,
		})
	case "stripe":
		createStripePayment(w, r, stripeCreatePaymentRequest{
			Amount:      req.Amount,
			Message:     req.Message,
			DisplayName: req.DisplayName,
			IsAnonymous: req.IsAnonymous,
			ItemType:    itemType,
			EffectType:  effectType,
			ArchiveID:   archiveID,
			UserID:      buyerUserID,
		})
	default:
		WriteSimpleResponse(w, false, "unsupported payment provider")
		return
	}
}
