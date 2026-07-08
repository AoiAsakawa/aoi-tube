package controllers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

// Stripe API endpoints
const (
	stripeAPIBase = "https://api.stripe.com/v1"
)

// maxDonationAmount is a sanity upper bound expressed in the payment's major
// currency unit (e.g. yen, dollars). Shared across the card/wallet providers to
// bound values and prevent overflow in the smallest-unit conversion.
const maxDonationAmount = 1000000

// StripeCreatePayment creates a Stripe Checkout Session for payment.
func StripeCreatePayment(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for cases where the web UI is served from a different origin.
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	log.Debugf("Stripe create requested. method=%s origin=%q remote=%s", r.Method, r.Header.Get("Origin"), r.RemoteAddr)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetStripeConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "Stripe is not enabled")
		return
	}

	var request stripeCreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	createStripePayment(w, r, request)
}

type stripeCreatePaymentRequest struct {
	Amount      float64 `json:"amount"`
	Message     string  `json:"message"`
	DisplayName string  `json:"displayName"`
	IsAnonymous bool    `json:"isAnonymous"`
	// ItemType/EffectType are normalized by CreatePayment before reaching here.
	ItemType   string `json:"itemType"`
	EffectType string `json:"effectType"`
	// ArchiveID/UserID are set for paid archive purchases (validated + priced
	// by CreatePayment). UserID is the authenticated buyer the entitlement
	// will be granted to.
	ArchiveID string `json:"archiveId"`
	UserID    string `json:"userId"`
	// PreScaledAmount and CurrencyOverride are set for archive purchases, whose
	// manifest price is already stored in the smallest unit of its own currency
	// (e.g. 500 = $5.00). When PreScaledAmount > 0 it is charged verbatim in
	// CurrencyOverride, bypassing the major-unit *100 scaling that would
	// otherwise 100x-overcharge a non-JPY archive. Not part of the JSON body —
	// only set server-side by CreatePayment.
	PreScaledAmount  int64
	CurrencyOverride string
}

func createStripePayment(w http.ResponseWriter, r *http.Request, request stripeCreatePaymentRequest) {
	config := data.GetStripeConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "Stripe is not enabled")
		return
	}

	// Archives carry a server-priced amount already in the smallest unit of the
	// archive's own currency; charge it verbatim. Everything else is priced in
	// major units of the provider's configured currency.
	currency := config.CurrencyCode
	var amountInSmallestUnit int64
	if request.PreScaledAmount > 0 {
		currency = request.CurrencyOverride
		amountInSmallestUnit = request.PreScaledAmount
		if amountInSmallestUnit <= 0 || amountInSmallestUnit > maxDonationAmount*100 {
			WriteSimpleResponse(w, false, "amount exceeds maximum limit")
			return
		}
	} else {
		if fixedAmount, err := applyFixedEffectPrice(request.ItemType, request.EffectType, currency, request.Amount); err != nil {
			WriteSimpleResponse(w, false, err.Error())
			return
		} else {
			request.Amount = fixedAmount
		}
		if request.Amount <= 0 {
			WriteSimpleResponse(w, false, "amount must be greater than 0")
			return
		}
		// Sanity upper bound (also guards the *100 conversion below from overflow).
		if request.Amount > maxDonationAmount {
			WriteSimpleResponse(w, false, "amount exceeds maximum limit")
			return
		}
		// Zero-decimal currencies (JPY, KRW) are already in their smallest unit.
		if models.IsZeroDecimalCurrency(currency) {
			amountInSmallestUnit = int64(request.Amount)
		} else {
			amountInSmallestUnit = int64(request.Amount * 100)
		}
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
	orderID = "stripe_" + orderID

	// Get server URL for redirect
	serverURL := data.GetServerURL()
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}

	// Store pending donation info (amountInSmallestUnit and currency computed above)
	pendingDonation := &models.Donation{
		ID:              orderID,
		Amount:          amountInSmallestUnit,
		Currency:        currency,
		Message:         request.Message,
		DisplayName:     request.DisplayName,
		IsAnonymous:     request.IsAnonymous,
		PaymentProvider: "stripe",
		PaymentID:       "", // Will be set after payment
		ItemType:        request.ItemType,
		EffectType:      request.EffectType,
		ArchiveID:       request.ArchiveID,
		UserID:          request.UserID,
		IsTest:          config.IsTestMode,
		CreatedAt:       time.Now(),
	}

	// Store pending donation
	if err := data.AddPendingDonation(pendingDonation); err != nil {
		log.Errorf("Failed to store pending donation: %v", err)
		WriteSimpleResponse(w, false, "failed to create donation")
		return
	}

	// Create Stripe Checkout Session
	sessionID, checkoutURL, err := createStripeCheckoutSession(config, currency, amountInSmallestUnit, orderID, request.DisplayName, request.Message, serverURL, request.ItemType)
	if err != nil {
		log.Errorf("Failed to create Stripe checkout session: %v", err)
		data.DeletePendingDonation(orderID)
		WriteSimpleResponse(w, false, "failed to create Stripe checkout session")
		return
	}

	// Update pending donation with session ID
	pendingDonation.PaymentID = sessionID
	data.AddPendingDonation(pendingDonation) // Re-add to update

	WriteResponse(w, map[string]interface{}{
		"success":   true,
		"orderId":   orderID,
		"sessionId": sessionID,
		"url":       checkoutURL,
	})
}

// createStripeCheckoutSession creates a Stripe Checkout Session.
func createStripeCheckoutSession(config models.StripeConfig, currency string, amountInSmallestUnit int64, donationID, displayName, message, serverURL, itemType string) (string, string, error) {
	secretKey := config.GetActiveSecretKey()
	if secretKey == "" {
		return "", "", fmt.Errorf("Stripe secret key not configured for %s environment", map[bool]string{true: "test", false: "live"}[config.IsTestMode])
	}

	// Build request body as URL-encoded form data. Every value must be escaped:
	// displayName/message are user-controlled and would otherwise allow injecting
	// additional Stripe parameters (e.g. overriding unit_amount or metadata).
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", serverURL+"/donation/stripe/complete?donation_id="+donationID)
	form.Set("cancel_url", serverURL+"/donation/stripe/cancel?donation_id="+donationID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", strings.ToLower(currency))
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(amountInSmallestUnit, 10))
	productName := "スーパーチャット / Super Chat"
	if itemType == models.DonationItemEffect {
		productName = "画面演出 / Screen Effect"
	}
	form.Set("line_items[0][price_data][product_data][name]", productName)
	form.Set("metadata[donation_id]", donationID)
	form.Set("metadata[display_name]", displayName)
	form.Set("metadata[message]", message)

	req, err := http.NewRequest("POST", stripeAPIBase+"/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}

	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("Stripe session creation failed: %s", string(body))
	}

	var sessionResp struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}

	if err := json.Unmarshal(body, &sessionResp); err != nil {
		return "", "", err
	}

	return sessionResp.ID, sessionResp.URL, nil
}

// retrieveStripeSession fetches a Checkout Session from Stripe so the server can
// confirm a payment really happened, instead of trusting the success redirect.
func retrieveStripeSession(config models.StripeConfig, sessionID string) (*models.StripeCheckoutSession, error) {
	secretKey := config.GetActiveSecretKey()
	if secretKey == "" {
		return nil, fmt.Errorf("Stripe secret key not configured")
	}
	if sessionID == "" {
		return nil, fmt.Errorf("empty Stripe session id")
	}

	req, err := http.NewRequest("GET", stripeAPIBase+"/checkout/sessions/"+url.PathEscape(sessionID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Stripe session retrieve failed: %s", string(body))
	}

	var session models.StripeCheckoutSession
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

// StripeWebhook handles Stripe webhook notifications.
func StripeWebhook(w http.ResponseWriter, r *http.Request) {
	config := data.GetStripeConfig()
	if !config.Enabled {
		w.WriteHeader(http.StatusOK)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Errorf("Failed to read Stripe webhook body: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// A webhook signing secret is mandatory. Without it we cannot prove the
	// request came from Stripe, so an unsigned webhook must be rejected rather
	// than processed (otherwise anyone could POST a forged completed session).
	webhookSecret := config.GetActiveWebhookSecret()
	if webhookSecret == "" {
		log.Warnf("Stripe webhook received but no webhook signing secret is configured; rejecting")
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	sigHeader := r.Header.Get("Stripe-Signature")
	if !verifyStripeSignature(body, sigHeader, webhookSecret) {
		log.Warnf("Stripe webhook signature verification failed")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var event models.StripeWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Errorf("Failed to parse Stripe webhook: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	log.Infof("Stripe webhook received: type=%s, id=%s", event.Type, event.ID)

	// Handle checkout.session.completed event
	if event.Type == "checkout.session.completed" {
		processCompletedStripePayment(event.Data.Object)
	}

	w.WriteHeader(http.StatusOK)
}

// verifyStripeSignature verifies the Stripe webhook signature.
func verifyStripeSignature(payload []byte, sigHeader, secret string) bool {
	if sigHeader == "" {
		return false
	}

	// Parse signature header
	var timestamp string
	var signatures []string

	parts := strings.Split(sigHeader, ",")
	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.TrimSpace(kv[0])
		value := strings.TrimSpace(kv[1])

		if key == "t" {
			timestamp = value
		} else if key == "v1" {
			signatures = append(signatures, value)
		}
	}

	if timestamp == "" || len(signatures) == 0 {
		return false
	}

	// Reject events outside a 5-minute tolerance window to prevent replay of a
	// previously-captured valid webhook.
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if diff := time.Now().Unix() - ts; diff > 300 || diff < -300 {
		log.Warnf("Stripe webhook timestamp outside tolerance window (%ds)", diff)
		return false
	}

	// Create expected signature
	signedPayload := timestamp + "." + string(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signedPayload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// Compare signatures
	for _, sig := range signatures {
		if hmac.Equal([]byte(sig), []byte(expectedSig)) {
			return true
		}
	}

	return false
}

// processCompletedStripePayment processes a completed Stripe payment.
func processCompletedStripePayment(session models.StripeCheckoutSession) {
	donationID := session.Metadata["donation_id"]
	if donationID == "" {
		log.Warnf("Stripe webhook missing donation_id in metadata")
		return
	}

	// Get pending donation
	donation, err := data.GetPendingDonation(donationID)
	if err != nil {
		log.Errorf("Failed to get pending donation for Stripe webhook: %v", err)
		return
	}

	// Update with payment intent ID
	donation.PaymentID = session.PaymentIntent
	if session.AmountTotal > 0 {
		donation.Amount = session.AmountTotal
	}

	completeStripeDonation(donation, true)
}

// completeStripeDonation finalizes a Stripe donation. fromWebhook delays the
// chat broadcast so a buyer still on the payment page can get back first.
func completeStripeDonation(donation *models.Donation, fromWebhook bool) {
	// Atomically claim the pending donation so a webhook and the success redirect
	// can't both finalize the same payment (which would double-broadcast to chat).
	if _, err := data.ClaimPendingDonation(donation.ID); err != nil {
		log.Debugf("Stripe donation %s already finalized; skipping", donation.ID)
		return
	}

	// Add to donations table. For a paid archive this row is the buyer's
	// viewing entitlement.
	if err := data.AddDonation(donation); err != nil {
		log.Errorf("Failed to save Stripe donation: %v", err)
		return
	}

	// Archive purchases are private entitlements, not Super Chats: don't
	// broadcast them to chat or fire the donation webhook.
	if donation.ItemType == models.DonationItemArchive {
		log.Infof("Stripe archive purchase recorded: user=%s archive=%s", donation.UserID, donation.ArchiveID)
		return
	}

	// Send to chat
	displayName := donation.DisplayName
	if donation.IsAnonymous {
		displayName = "" // localized by clients via the isAnonymous flag
	}

	// Amount is already in smallest currency unit
	displayAmount := donation.Amount

	event := events.NewDonationEvent(
		donation.ID,
		displayAmount,
		donation.Currency,
		donation.Message,
		displayName,
		donation.IsAnonymous,
		nil,
	).WithItem(donation.ItemType, donation.EffectType)

	broadcastPurchaseEvent(event, fromWebhook, "stripe")

	// Send webhook
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)

	log.Infof("Stripe donation completed: %s - %d %s from %s",
		donation.ID, donation.Amount, donation.Currency, displayName)
}

// StripeCompletePayment handles the redirect after payment success.
func StripeCompletePayment(w http.ResponseWriter, r *http.Request) {
	donationID := r.URL.Query().Get("donation_id")

	if donationID == "" {
		renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "error", "msg.notFound")
		return
	}

	// Get pending donation
	donation, err := data.GetPendingDonation(donationID)
	if err != nil {
		// Donation was already processed (possibly via webhook)
		renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "success", "msg.thanksSuperchat")
		return
	}

	// The success redirect URL is reachable without actually paying, so we must
	// confirm the payment with Stripe before recording it. donation.PaymentID
	// holds the Checkout Session ID set at creation time.
	config := data.GetStripeConfig()
	session, err := retrieveStripeSession(config, donation.PaymentID)
	if err != nil {
		log.Errorf("Failed to retrieve Stripe session for donation %s: %v", donationID, err)
		renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "error", "msg.confirmFailed")
		return
	}
	if session.PaymentStatus != "paid" {
		log.Warnf("Stripe completion attempted for unpaid session: donation=%s status=%q", donationID, session.PaymentStatus)
		renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "pending", "msg.notCompleted")
		return
	}

	// Trust Stripe's payment intent and amount, never the client-supplied redirect.
	if session.PaymentIntent != "" {
		donation.PaymentID = session.PaymentIntent
	}
	if session.AmountTotal > 0 {
		donation.Amount = session.AmountTotal
	}

	// Complete the donation
	completeStripeDonation(donation, false)

	renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "success", successMessageKeyForItem(donation.ItemType))
}

// StripeCancelPayment handles the redirect after payment cancellation.
func StripeCancelPayment(w http.ResponseWriter, r *http.Request) {
	donationID := r.URL.Query().Get("donation_id")

	if donationID != "" {
		// Delete pending donation
		data.DeletePendingDonation(donationID)
	}

	renderPaymentResultPage(w, r, "Stripe", stripeBrandColor, "cancelled", "msg.cancelled")
}

// stripeBrandColor is the success accent for the Stripe payment result page.
const stripeBrandColor = "#635BFF"

// GetStripeStatus returns Stripe enabled status.
func GetStripeStatus(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for cases where the web UI is served from a different origin.
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	log.Debugf("Stripe status requested. method=%s origin=%q remote=%s", r.Method, r.Header.Get("Origin"), r.RemoteAddr)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	config := data.GetStripeConfig()

	// Get publishable key for frontend
	publishableKey := config.GetActivePublishableKey()

	WriteResponse(w, map[string]interface{}{
		"success":        true,
		"enabled":        config.Enabled,
		"currencyCode":   config.CurrencyCode,
		"isTestMode":     config.IsTestMode,
		"publishableKey": publishableKey,
	})
}
