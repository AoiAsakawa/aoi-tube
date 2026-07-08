package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/integrations/paypay"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

// PayPayCreatePayment creates a PayPay payment QR code.
func PayPayCreatePayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetPayPayConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "PayPay is not enabled")
		return
	}

	// Debug logging for PayPay configuration
	log.Debugf("PayPay Config - Enabled: %v, IsSandbox: %v, APIKey set: %v, APISecret set: %v, MerchantID: %s",
		config.Enabled,
		config.IsSandbox,
		config.GetActiveAPIKey() != "",
		config.GetActiveAPISecret() != "",
		config.GetActiveMerchantID(),
	)

	var request struct {
		Amount      int64  `json:"amount"`
		Message     string `json:"message"`
		DisplayName string `json:"displayName"`
		IsAnonymous bool   `json:"isAnonymous"`
		ItemType    string `json:"itemType"`
		EffectType  string `json:"effectType"`
		ArchiveID   string `json:"archiveId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	itemType, effectType, err := normalizePurchaseItem(request.ItemType, request.EffectType)
	if err != nil {
		WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Screen effects are fixed-price products; enforce the JPY price and
	// ignore the client-supplied amount.
	if itemType == models.DonationItemEffect {
		price, ok := models.GetEffectPrice(effectType, "JPY")
		if !ok {
			WriteSimpleResponse(w, false, "invalid effect type")
			return
		}
		request.Amount = price
	}

	// Paid archive: resolve buyer + server-enforced price (client amount is
	// ignored) and tie the entitlement to the authenticated buyer.
	var archiveBuyerID string
	if itemType == models.DonationItemArchive {
		uid, price, _, aerr := resolveArchivePurchase(r, request.ArchiveID)
		if aerr != nil {
			WriteSimpleResponse(w, false, aerr.Error())
			return
		}
		archiveBuyerID = uid
		request.Amount = price
	}

	if request.Amount <= 0 {
		WriteSimpleResponse(w, false, "amount must be greater than 0")
		return
	}

	// Maximum donation amount: 1,000,000 JPY
	if request.Amount > 1000000 {
		WriteSimpleResponse(w, false, "amount exceeds maximum limit")
		return
	}

	// Sanitize inputs
	if len(request.Message) > 500 {
		request.Message = request.Message[:500]
	}
	if len(request.DisplayName) > 100 {
		request.DisplayName = request.DisplayName[:100]
	}

	// Generate order ID
	orderID, _ := shortid.Generate()
	orderID = "donation_" + orderID

	// Get server URL for redirect
	serverURL := data.GetServerURL()
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}
	redirectURL := serverURL + "/donation/paypay/complete?orderId=" + orderID

	// Store pending donation info
	pendingDonation := &models.Donation{
		ID:              orderID,
		Amount:          request.Amount,
		Currency:        "JPY",
		Message:         request.Message,
		DisplayName:     request.DisplayName,
		IsAnonymous:     request.IsAnonymous,
		PaymentProvider: "paypay",
		PaymentID:       "", // Will be set after payment
		ItemType:        itemType,
		EffectType:      effectType,
		ArchiveID:       request.ArchiveID,
		UserID:          archiveBuyerID,
		IsTest:          config.IsSandbox,
		CreatedAt:       time.Now(),
	}

	// Store pending donation (with status pending)
	if err := data.AddPendingDonation(pendingDonation); err != nil {
		log.Errorf("Failed to store pending donation: %v", err)
		WriteSimpleResponse(w, false, "failed to create donation")
		return
	}

	// Create PayPay client
	client := paypay.NewClient(&config)

	// Create QR code
	paymentReq := &models.PayPayPaymentRequest{
		Amount:      request.Amount,
		OrderID:     orderID,
		Description: purchaseDescription(itemType) + ": " + request.DisplayName,
		RedirectURL: redirectURL,
	}

	resp, err := client.CreateQRCode(paymentReq)
	if err != nil {
		log.Errorf("Failed to create PayPay QR code: %v", err)
		WriteSimpleResponse(w, false, "failed to create payment")
		return
	}

	if !resp.Success {
		WriteSimpleResponse(w, false, "PayPay error: "+resp.ErrorMessage)
		return
	}

	WriteResponse(w, map[string]interface{}{
		"success":    true,
		"orderId":    orderID,
		"paymentUrl": resp.PaymentURL,
		"paymentId":  resp.PaymentID,
	})
}

// PayPayWebhook handles PayPay webhook notifications.
func PayPayWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetPayPayConfig()
	if !config.Enabled {
		w.WriteHeader(http.StatusOK)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Errorf("Failed to read PayPay webhook body: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// A signature is mandatory: an unsigned webhook cannot be proven to originate
	// from PayPay, so processing one would let anyone mark a pending donation paid.
	signature := r.Header.Get("X-PayPay-Signature")
	if signature == "" || !paypay.ValidateWebhookSignature(body, signature, config.GetActiveAPISecret()) {
		log.Warnf("Invalid or missing PayPay webhook signature")
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var payload models.PayPayWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		log.Errorf("Failed to parse PayPay webhook: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	log.Infof("PayPay webhook received: type=%s, paymentId=%s, state=%s",
		payload.NotificationType, payload.MerchantPaymentID, payload.State)

	// Handle completed payments
	if payload.State == "COMPLETED" {
		processCompletedPayPayPayment(payload)
	}

	w.WriteHeader(http.StatusOK)
}

// PayPayCompletePayment handles the redirect after payment completion.
func PayPayCompletePayment(w http.ResponseWriter, r *http.Request) {
	orderID := r.URL.Query().Get("orderId")
	if orderID == "" {
		http.Error(w, "Missing order ID", http.StatusBadRequest)
		return
	}

	config := data.GetPayPayConfig()
	if !config.Enabled {
		http.Error(w, "PayPay is not enabled", http.StatusBadRequest)
		return
	}

	// Check payment status
	client := paypay.NewClient(&config)
	details, err := client.GetPaymentDetails(orderID)
	if err != nil {
		log.Errorf("Failed to get PayPay payment details: %v", err)
		renderPaymentResultPage(w, r, "PayPay", paypayBrandColor, "error", "msg.fetchFailed")
		return
	}

	log.Infof("PayPay payment status for %s: state=%s, paymentId=%s", orderID, details.State, details.PaymentID)

	if details.State == "COMPLETED" {
		// Get pending donation and complete it
		successMessageKey := "msg.thanksSuperchat"
		donation, err := data.GetPendingDonation(orderID)
		if err != nil {
			log.Errorf("Failed to get pending donation: %v", err)
		} else {
			donation.PaymentID = details.PaymentID
			completePayPayDonation(donation, false)
			successMessageKey = successMessageKeyForItem(donation.ItemType)
		}
		renderPaymentResultPage(w, r, "PayPay", paypayBrandColor, "success", successMessageKey)
	} else {
		renderPaymentResultPage(w, r, "PayPay", paypayBrandColor, "pending", "msg.notCompleted")
	}
}

// paypayBrandColor is the success accent for the PayPay payment result page.
const paypayBrandColor = "#4CAF50"

// processCompletedPayPayPayment processes a completed PayPay payment from webhook.
func processCompletedPayPayPayment(payload models.PayPayWebhookPayload) {
	donation, err := data.GetPendingDonation(payload.MerchantPaymentID)
	if err != nil {
		log.Errorf("Failed to get pending donation for PayPay webhook: %v", err)
		return
	}

	// Defense in depth: even with a valid signature, confirm the payment state
	// via the PayPay API before finalizing (mirrors the redirect completion path).
	config := data.GetPayPayConfig()
	client := paypay.NewClient(&config)
	details, err := client.GetPaymentDetails(payload.MerchantPaymentID)
	if err != nil {
		log.Errorf("Failed to verify PayPay payment %s: %v", payload.MerchantPaymentID, err)
		return
	}
	if details.State != "COMPLETED" {
		log.Warnf("PayPay webhook for %s but API reports state=%s; ignoring", payload.MerchantPaymentID, details.State)
		return
	}

	donation.PaymentID = details.PaymentID
	completePayPayDonation(donation, true)
}

// completePayPayDonation finalizes a PayPay donation. fromWebhook delays the
// chat broadcast so the buyer can get back from the PayPay app/page first.
func completePayPayDonation(donation *models.Donation, fromWebhook bool) {
	// Atomically claim so the webhook and the completion redirect can't both
	// finalize the same payment (double chat broadcast).
	if _, err := data.ClaimPendingDonation(donation.ID); err != nil {
		log.Debugf("PayPay donation %s already finalized; skipping", donation.ID)
		return
	}

	// Add to donations table. For a paid archive this row is the buyer's
	// viewing entitlement.
	if err := data.AddDonation(donation); err != nil {
		log.Errorf("Failed to save PayPay donation: %v", err)
		return
	}

	// Archive purchases are private entitlements, not Super Chats: don't
	// broadcast them to chat or fire the donation webhook.
	if donation.ItemType == models.DonationItemArchive {
		log.Infof("PayPay archive purchase recorded: user=%s archive=%s", donation.UserID, donation.ArchiveID)
		return
	}

	// Send to chat
	displayName := donation.DisplayName
	if donation.IsAnonymous {
		displayName = "" // localized by clients via the isAnonymous flag
	}

	event := events.NewDonationEvent(
		donation.ID,
		donation.Amount,
		donation.Currency,
		donation.Message,
		displayName,
		donation.IsAnonymous,
		nil,
	).WithItem(donation.ItemType, donation.EffectType)

	broadcastPurchaseEvent(event, fromWebhook, "paypay")

	// Send webhook
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)

	log.Infof("PayPay donation completed: %s - %d JPY from %s",
		donation.ID, donation.Amount, displayName)
}

// GetPayPayStatus returns PayPay enabled status or payment status for a specific order.
func GetPayPayStatus(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for popup window
	middleware.EnableCors(w)

	orderID := r.URL.Query().Get("orderId")

	// If no orderId, just return enabled status
	if orderID == "" {
		config := data.GetPayPayConfig()
		WriteResponse(w, map[string]interface{}{
			"success": true,
			"enabled": config.Enabled,
		})
		return
	}

	// Check payment status for specific order
	config := data.GetPayPayConfig()
	if !config.Enabled {
		WriteResponse(w, map[string]interface{}{
			"success": false,
			"message": "PayPay is not enabled",
		})
		return
	}

	client := paypay.NewClient(&config)
	details, err := client.GetPaymentDetails(orderID)
	if err != nil {
		log.Errorf("Failed to get PayPay payment status: %v", err)
		WriteResponse(w, map[string]interface{}{
			"success": false,
			"status":  "UNKNOWN",
			"message": "Failed to get payment status",
		})
		return
	}

	WriteResponse(w, map[string]interface{}{
		"success": true,
		"status":  details.State,
		"orderId": orderID,
	})
}
