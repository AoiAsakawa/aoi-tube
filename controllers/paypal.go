package controllers

import (
	"bytes"
	"encoding/base64"
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

// PayPal API endpoints
const (
	paypalSandboxAPI    = "https://api-m.sandbox.paypal.com"
	paypalProductionAPI = "https://api-m.paypal.com"
)

// PayPalCreatePayment creates a PayPal order for payment.
func PayPalCreatePayment(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for cases where the web UI is served from a different origin.
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	log.Debugf("PayPal create requested. method=%s origin=%q remote=%s", r.Method, r.Header.Get("Origin"), r.RemoteAddr)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetPayPalConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "PayPal is not enabled")
		return
	}

	var request payPalCreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	createPayPalPayment(w, r, request)
}

type payPalCreatePaymentRequest struct {
	Amount      float64 `json:"amount"`
	Message     string  `json:"message"`
	DisplayName string  `json:"displayName"`
	IsAnonymous bool    `json:"isAnonymous"`
	// ItemType/EffectType are normalized by CreatePayment before reaching here.
	ItemType   string `json:"itemType"`
	EffectType string `json:"effectType"`
	// ArchiveID/UserID are set for paid archive purchases. UserID is the
	// authenticated buyer the entitlement is granted to.
	ArchiveID string `json:"archiveId"`
	UserID    string `json:"userId"`
	// PreScaledAmount/CurrencyOverride carry an archive's manifest price, which
	// is already in the smallest unit of the archive's own currency. When
	// PreScaledAmount > 0 it is charged verbatim in CurrencyOverride, avoiding
	// the major-unit *100 re-scaling. Set server-side only.
	PreScaledAmount  int64
	CurrencyOverride string
}

func createPayPalPayment(w http.ResponseWriter, r *http.Request, request payPalCreatePaymentRequest) {
	config := data.GetPayPalConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "PayPal is not enabled")
		return
	}

	// Archives carry a server-priced amount already in the smallest unit of the
	// archive's own currency; charge it verbatim. Everything else is priced in
	// major units of the provider's configured currency.
	currency := config.CurrencyCode
	var amountToStore int64 // smallest unit, as stored on the donation row
	var orderAmount float64 // major unit, as sent to PayPal
	if request.PreScaledAmount > 0 {
		currency = request.CurrencyOverride
		amountToStore = request.PreScaledAmount
		if amountToStore <= 0 || amountToStore > maxDonationAmount*100 {
			WriteSimpleResponse(w, false, "amount exceeds maximum limit")
			return
		}
		if models.IsZeroDecimalCurrency(currency) {
			orderAmount = float64(amountToStore)
		} else {
			orderAmount = float64(amountToStore) / 100
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
		orderAmount = request.Amount
		if models.IsZeroDecimalCurrency(currency) {
			amountToStore = int64(request.Amount)
		} else {
			amountToStore = int64(request.Amount * 100)
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
	orderID = "paypal_" + orderID

	// Get server URL for redirect
	serverURL := data.GetServerURL()
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}

	pendingDonation := &models.Donation{
		ID:              orderID,
		Amount:          amountToStore,
		Currency:        currency,
		Message:         request.Message,
		DisplayName:     request.DisplayName,
		IsAnonymous:     request.IsAnonymous,
		PaymentProvider: "paypal",
		PaymentID:       "", // Will be set after payment
		ItemType:        request.ItemType,
		EffectType:      request.EffectType,
		ArchiveID:       request.ArchiveID,
		UserID:          request.UserID,
		IsTest:          config.IsSandbox,
		CreatedAt:       time.Now(),
	}

	// Store pending donation
	if err := data.AddPendingDonation(pendingDonation); err != nil {
		log.Errorf("Failed to store pending donation: %v", err)
		WriteSimpleResponse(w, false, "failed to create donation")
		return
	}

	// Create PayPal order
	paypalOrderID, approvalURL, err := createPayPalOrder(config, currency, orderAmount, orderID, serverURL, request.ItemType)
	if err != nil {
		log.Errorf("Failed to create PayPal order: %v", err)
		data.DeletePendingDonation(orderID)
		WriteSimpleResponse(w, false, "failed to create PayPal order")
		return
	}

	// Update pending donation with PayPal order ID
	pendingDonation.PaymentID = paypalOrderID
	data.AddPendingDonation(pendingDonation) // Re-add to update

	WriteResponse(w, map[string]interface{}{
		"success":     true,
		"orderId":     orderID,
		"paypalOrder": paypalOrderID,
		"approvalUrl": approvalURL,
	})
}

// getPayPalAccessToken gets an access token from PayPal.
func getPayPalAccessToken(config models.PayPalConfig) (string, error) {
	baseURL := paypalProductionAPI
	if config.IsSandbox {
		baseURL = paypalSandboxAPI
	}

	// Get active credentials based on environment
	clientID := config.GetActiveClientID()
	clientSecret := config.GetActiveClientSecret()

	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("PayPal credentials not configured for %s environment", map[bool]string{true: "sandbox", false: "production"}[config.IsSandbox])
	}

	// Create basic auth header
	auth := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))

	// Request access token
	data := url.Values{}
	data.Set("grant_type", "client_credentials")

	req, err := http.NewRequest("POST", baseURL+"/v1/oauth2/token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Basic "+auth)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("PayPal auth failed: %s", string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int    `json:"expires_in"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

// createPayPalOrder creates a PayPal order and returns the order ID and approval URL.
func createPayPalOrder(config models.PayPalConfig, currency string, amount float64, donationID, serverURL, itemType string) (string, string, error) {
	accessToken, err := getPayPalAccessToken(config)
	if err != nil {
		return "", "", fmt.Errorf("failed to get access token: %v", err)
	}

	baseURL := paypalProductionAPI
	if config.IsSandbox {
		baseURL = paypalSandboxAPI
	}

	// Format amount based on currency (zero-decimal currencies use no decimals)
	var amountStr string
	if models.IsZeroDecimalCurrency(currency) {
		amountStr = fmt.Sprintf("%.0f", amount)
	} else {
		amountStr = fmt.Sprintf("%.2f", amount)
	}

	// Describe what is being purchased on the PayPal side.
	purchaseDescription := "Super Chat purchase"
	if itemType == models.DonationItemEffect {
		purchaseDescription = "Screen effect purchase"
	}

	// Create order request
	orderRequest := map[string]interface{}{
		"intent": "CAPTURE",
		"purchase_units": []map[string]interface{}{
			{
				"reference_id": donationID,
				"description":  purchaseDescription,
				"custom_id":    donationID,
				"amount": map[string]interface{}{
					"currency_code": currency,
					"value":         amountStr,
				},
			},
		},
		"application_context": map[string]interface{}{
			"brand_name":          "AoiTube",
			"landing_page":        "NO_PREFERENCE",
			"user_action":         "PAY_NOW",
			"return_url":          serverURL + "/donation/paypal/complete?donation_id=" + donationID,
			"cancel_url":          serverURL + "/donation/paypal/cancel?donation_id=" + donationID,
			"shipping_preference": "NO_SHIPPING",
		},
	}

	orderJSON, err := json.Marshal(orderRequest)
	if err != nil {
		return "", "", err
	}

	req, err := http.NewRequest("POST", baseURL+"/v2/checkout/orders", bytes.NewBuffer(orderJSON))
	if err != nil {
		return "", "", err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("PayPal-Request-Id", donationID)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("PayPal order creation failed: %s", string(body))
	}

	var orderResp struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Links  []struct {
			Href   string `json:"href"`
			Rel    string `json:"rel"`
			Method string `json:"method"`
		} `json:"links"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&orderResp); err != nil {
		return "", "", err
	}

	// Find approval URL
	var approvalURL string
	for _, link := range orderResp.Links {
		if link.Rel == "approve" {
			approvalURL = link.Href
			break
		}
	}

	return orderResp.ID, approvalURL, nil
}

// capturePayPalOrder captures a PayPal order after approval.
func capturePayPalOrder(config models.PayPalConfig, orderID string) error {
	accessToken, err := getPayPalAccessToken(config)
	if err != nil {
		return fmt.Errorf("failed to get access token: %v", err)
	}

	baseURL := paypalProductionAPI
	if config.IsSandbox {
		baseURL = paypalSandboxAPI
	}

	req, err := http.NewRequest("POST", baseURL+"/v2/checkout/orders/"+orderID+"/capture", nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PayPal capture failed: %s", string(body))
	}

	return nil
}

// payPalCaptureResource is the subset of a PayPal capture we verify.
type payPalCaptureResource struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	CustomID string `json:"custom_id"`
	Amount   *struct {
		CurrencyCode string `json:"currency_code"`
		Value        string `json:"value"`
	} `json:"amount"`
}

// getPayPalCapture fetches a capture directly from PayPal so a webhook cannot be
// trusted on its own. This is what makes the webhook path safe: a forged webhook
// body cannot fabricate a capture that PayPal itself will confirm.
func getPayPalCapture(config models.PayPalConfig, captureID string) (*payPalCaptureResource, error) {
	accessToken, err := getPayPalAccessToken(config)
	if err != nil {
		return nil, fmt.Errorf("failed to get access token: %v", err)
	}

	baseURL := paypalProductionAPI
	if config.IsSandbox {
		baseURL = paypalSandboxAPI
	}

	req, err := http.NewRequest("GET", baseURL+"/v2/payments/captures/"+url.PathEscape(captureID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("PayPal capture lookup failed: %s", string(body))
	}

	var capture payPalCaptureResource
	if err := json.Unmarshal(body, &capture); err != nil {
		return nil, err
	}
	return &capture, nil
}

// PayPalWebhook handles PayPal webhook notifications.
func PayPalWebhook(w http.ResponseWriter, r *http.Request) {
	config := data.GetPayPalConfig()
	if !config.Enabled {
		w.WriteHeader(http.StatusOK)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Errorf("Failed to read PayPal webhook body: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var webhook models.PayPalWebhookPayload
	if err := json.Unmarshal(body, &webhook); err != nil {
		log.Errorf("Failed to parse PayPal webhook: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	log.Infof("PayPal webhook received: eventType=%s, resourceId=%s",
		webhook.EventType, webhook.Resource.ID)

	// Handle payment capture completed
	if webhook.EventType == "PAYMENT.CAPTURE.COMPLETED" {
		processCompletedPayPalPayment(webhook)
	}

	w.WriteHeader(http.StatusOK)
}

// processCompletedPayPalPayment processes a completed PayPal payment.
func processCompletedPayPalPayment(webhook models.PayPalWebhookPayload) {
	customID := webhook.Resource.CustomID
	if customID == "" {
		log.Warnf("PayPal webhook missing custom_id")
		return
	}

	captureID := webhook.Resource.ID
	if captureID == "" {
		log.Warnf("PayPal webhook missing capture id for donation %s", customID)
		return
	}

	// Get pending donation
	donation, err := data.GetPendingDonation(customID)
	if err != nil {
		log.Errorf("Failed to get pending donation for PayPal webhook: %v", err)
		return
	}

	// Verify the capture directly with PayPal. The webhook is not signature-checked,
	// so we never trust its body: a real, completed capture matching this donation
	// must be confirmed by PayPal before we record anything.
	config := data.GetPayPalConfig()
	capture, err := getPayPalCapture(config, captureID)
	if err != nil {
		log.Errorf("Failed to verify PayPal capture %s: %v", captureID, err)
		return
	}
	if capture.Status != "COMPLETED" {
		log.Warnf("PayPal capture %s not completed (status=%s); ignoring webhook", captureID, capture.Status)
		return
	}
	if capture.CustomID != "" && capture.CustomID != customID {
		log.Warnf("PayPal capture %s custom_id mismatch: expected %s got %s", captureID, customID, capture.CustomID)
		return
	}

	donation.PaymentID = captureID

	// Use the PayPal-verified amount, never the webhook body. Zero-decimal
	// currencies (JPY, KRW) are stored as-is; others in cents.
	if capture.Amount != nil {
		if amount, err := strconv.ParseFloat(capture.Amount.Value, 64); err == nil {
			if models.IsZeroDecimalCurrency(donation.Currency) {
				donation.Amount = int64(amount)
			} else {
				donation.Amount = int64(amount * 100)
			}
		}
	}

	completePayPalDonation(donation, true)
}

// completePayPalDonation finalizes a PayPal donation.
// completePayPalDonation finalizes a PayPal donation. fromWebhook delays
// the chat broadcast so the buyer can get back from the payment page first.
func completePayPalDonation(donation *models.Donation, fromWebhook bool) {
	// Atomically claim so the webhook and the approval redirect can't both
	// finalize the same order (double chat broadcast).
	if _, err := data.ClaimPendingDonation(donation.ID); err != nil {
		log.Debugf("PayPal donation %s already finalized; skipping", donation.ID)
		return
	}

	// Add to donations table. For a paid archive this row is the buyer's
	// viewing entitlement.
	if err := data.AddDonation(donation); err != nil {
		log.Errorf("Failed to save PayPal donation: %v", err)
		return
	}

	// Archive purchases are private entitlements, not Super Chats: don't
	// broadcast them to chat or fire the donation webhook.
	if donation.ItemType == models.DonationItemArchive {
		log.Infof("PayPal archive purchase recorded: user=%s archive=%s", donation.UserID, donation.ArchiveID)
		return
	}

	// Coin top-ups credit the buyer's wallet; buying coins isn't a chat event.
	if donation.ItemType == models.DonationItemCoin {
		creditCoinCharge(donation, "paypal")
		return
	}

	// Send to chat
	displayName := donation.DisplayName
	if donation.IsAnonymous {
		displayName = "" // localized by clients via the isAnonymous flag
	}

	// Convert cents back to currency amount for display
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

	broadcastPurchaseEvent(event, fromWebhook, "paypal")

	// Send webhook
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)

	log.Infof("PayPal donation completed: %s - %d %s from %s",
		donation.ID, donation.Amount, donation.Currency, displayName)
}

// PayPalCompletePayment handles the redirect after payment approval.
func PayPalCompletePayment(w http.ResponseWriter, r *http.Request) {
	donationID := r.URL.Query().Get("donation_id")
	token := r.URL.Query().Get("token") // PayPal order ID

	if donationID == "" {
		renderPaymentResultPage(w, r, "PayPal", paypalBrandColor, "error", "msg.notFound")
		return
	}

	// Get pending donation
	donation, err := data.GetPendingDonation(donationID)
	if err != nil {
		// Donation was already processed
		renderPaymentResultPage(w, r, "PayPal", paypalBrandColor, "success", "msg.thanksSuperchat")
		return
	}

	// Capture the payment
	config := data.GetPayPalConfig()
	orderID := token
	if orderID == "" {
		orderID = donation.PaymentID
	}

	if err := capturePayPalOrder(config, orderID); err != nil {
		log.Errorf("Failed to capture PayPal order: %v", err)
		renderPaymentResultPage(w, r, "PayPal", paypalBrandColor, "error", "msg.captureFailed")
		return
	}

	// Complete the donation
	donation.PaymentID = orderID
	completePayPalDonation(donation, false)

	renderPaymentResultPage(w, r, "PayPal", paypalBrandColor, "success", successMessageKeyForItem(donation.ItemType))
}

// PayPalCancelPayment handles the redirect after payment cancellation.
func PayPalCancelPayment(w http.ResponseWriter, r *http.Request) {
	donationID := r.URL.Query().Get("donation_id")

	if donationID != "" {
		// Delete pending donation
		data.DeletePendingDonation(donationID)
	}

	renderPaymentResultPage(w, r, "PayPal", paypalBrandColor, "cancelled", "msg.cancelled")
}

// paypalBrandColor is the success accent for the PayPal payment result page.
const paypalBrandColor = "#0070ba"

// GetPayPalStatus returns PayPal enabled status.
func GetPayPalStatus(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for cases where the web UI is served from a different origin.
	middleware.EnableCors(w)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	log.Debugf("PayPal status requested. method=%s origin=%q remote=%s", r.Method, r.Header.Get("Origin"), r.RemoteAddr)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	config := data.GetPayPalConfig()
	WriteResponse(w, map[string]interface{}{
		"success":      true,
		"enabled":      config.Enabled,
		"currencyCode": config.CurrencyCode,
		"isSandbox":    config.IsSandbox,
	})
}
