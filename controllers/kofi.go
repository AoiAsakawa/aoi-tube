package controllers

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/google/uuid"
	log "github.com/sirupsen/logrus"
)

// GetKofiStatus returns Ko-fi enabled status and config for public.
func GetKofiStatus(w http.ResponseWriter, r *http.Request) {
	config := data.GetKofiConfig()
	WriteResponse(w, map[string]interface{}{
		"enabled":     config.Enabled,
		"pageUrl":     config.PageURL,
		"displayName": config.DisplayName,
	})
}

// KofiWebhook handles incoming Ko-fi webhook notifications.
// Ko-fi sends POST requests with form data containing a "data" field with JSON.
func KofiWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, "method not allowed")
		return
	}

	config := data.GetKofiConfig()
	if !config.Enabled {
		log.Debug("Ko-fi webhook received but Ko-fi is disabled")
		WriteSimpleResponse(w, false, "Ko-fi is not enabled")
		return
	}

	// Parse form data
	if err := r.ParseForm(); err != nil {
		log.Errorf("Failed to parse Ko-fi webhook form: %v", err)
		WriteSimpleResponse(w, false, "invalid form data")
		return
	}

	// Ko-fi sends JSON in a "data" form field
	dataField := r.FormValue("data")
	if dataField == "" {
		log.Error("Ko-fi webhook missing 'data' field")
		WriteSimpleResponse(w, false, "missing data field")
		return
	}

	var payload models.KofiWebhookPayload
	if err := json.Unmarshal([]byte(dataField), &payload); err != nil {
		log.Errorf("Failed to parse Ko-fi webhook JSON: %v", err)
		WriteSimpleResponse(w, false, "invalid JSON data")
		return
	}

	// Verify the webhook token. A token is REQUIRED: without one, anyone who
	// knows the URL could forge donations, so reject rather than accept
	// unverified payloads. Constant-time compare avoids a timing oracle.
	if config.VerificationToken == "" {
		log.Warn("Ko-fi webhook rejected: no verification token configured")
		WriteSimpleResponse(w, false, "verification token not configured")
		return
	}
	if subtle.ConstantTimeCompare([]byte(payload.VerificationToken), []byte(config.VerificationToken)) != 1 {
		log.Warnf("Ko-fi webhook verification failed: token mismatch")
		WriteSimpleResponse(w, false, "verification failed")
		return
	}

	log.Infof("Ko-fi webhook received: type=%s from=%s amount=%s %s message_id=%s",
		payload.Type, payload.FromName, payload.Amount, payload.Currency, payload.MessageID)

	// Process the donation
	processKofiDonation(payload)

	// Return success to Ko-fi
	WriteSimpleResponse(w, true, "webhook received")
}

// processKofiDonation processes a Ko-fi donation and sends it to chat.
func processKofiDonation(payload models.KofiWebhookPayload) {
	// Parse amount (Ko-fi sends it as a string like "3.00")
	amountFloat, err := strconv.ParseFloat(payload.Amount, 64)
	if err != nil {
		log.Errorf("Failed to parse Ko-fi amount '%s': %v", payload.Amount, err)
		return
	}

	// Convert to smallest unit based on currency
	// For most currencies (USD, EUR, GBP, etc.), multiply by 100 for cents
	// For JPY, use as-is (no decimal places)
	var amountInSmallestUnit int64
	currency := strings.ToUpper(payload.Currency)
	switch currency {
	case "JPY":
		amountInSmallestUnit = int64(amountFloat)
	default:
		// Most currencies use cents
		amountInSmallestUnit = int64(amountFloat * 100)
	}

	// Determine display name
	displayName := payload.FromName
	isAnonymous := !payload.IsPublic
	if isAnonymous || displayName == "" {
		displayName = "Ko-fi Supporter"
	}

	// Screen effects can be purchased through Ko-fi by starting the message
	// with an effect command (e.g. "!fireworks") and paying at least the
	// effect price. Below-price commands fall through to a regular Super Chat.
	message := payload.Message
	itemType := models.DonationItemSuperChat
	effectType, remainingMessage := parseEffectCommand(message)
	if effectType != "" {
		priceCurrency := "USD"
		if currency == "JPY" {
			priceCurrency = "JPY"
		}
		if price, ok := models.GetEffectPrice(effectType, priceCurrency); ok && amountFloat >= float64(price) {
			itemType = models.DonationItemEffect
			message = remainingMessage
		} else {
			effectType = ""
		}
	}

	// Idempotency: Ko-fi can deliver the same webhook more than once. Skip if
	// this transaction was already recorded so a replay can't create a second
	// donation, re-broadcast to chat, or re-fire a screen effect.
	if payload.KofiTransactionID != "" {
		if exists, err := data.DonationExistsForPayment("kofi", payload.KofiTransactionID); err != nil {
			log.Errorf("Failed to check Ko-fi donation idempotency: %v", err)
			return
		} else if exists {
			log.Infof("Ko-fi webhook ignored: transaction %s already processed", payload.KofiTransactionID)
			return
		}
	}

	// Create donation record
	donationID := uuid.New().String()
	donation := &models.Donation{
		ID:              donationID,
		Amount:          amountInSmallestUnit,
		Currency:        currency,
		Message:         message,
		DisplayName:     displayName,
		IsAnonymous:     isAnonymous,
		PaymentProvider: "kofi",
		PaymentID:       payload.KofiTransactionID,
		ItemType:        itemType,
		EffectType:      effectType,
		CreatedAt:       time.Now(),
	}

	// Save to database
	if err := data.AddDonation(donation); err != nil {
		log.Errorf("Failed to save Ko-fi donation: %v", err)
		return
	}

	// Send to chat
	chatDisplayName := displayName
	if isAnonymous {
		chatDisplayName = "" // localized by clients via the isAnonymous flag
	}

	event := events.NewDonationEvent(
		donation.ID,
		donation.Amount,
		donation.Currency,
		donation.Message,
		chatDisplayName,
		donation.IsAnonymous,
		nil,
	).WithItem(donation.ItemType, donation.EffectType)

	if err := chat.Broadcast(event); err != nil {
		log.Errorf("Failed to send Ko-fi donation to chat: %v", err)
	}

	// Send webhook notification
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)

	log.Infof("Ko-fi donation processed: %s - %s %s from %s (type: %s)",
		donation.ID, payload.Amount, payload.Currency, displayName, payload.Type)
}
