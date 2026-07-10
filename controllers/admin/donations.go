package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

// GetDonations returns a list of donations for the admin.
func GetDonations(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	limit := 50
	offset := 0

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	donations, err := data.GetAllPurchases(limit, offset)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to get donations")
		return
	}

	// Attach the archive title to archive-purchase rows so the purchase
	// management list can name what was bought (empty when deleted).
	type purchaseRow struct {
		*models.Donation
		ArchiveTitle string `json:"archiveTitle,omitempty"`
	}
	rows := make([]purchaseRow, 0, len(donations))
	for _, d := range donations {
		row := purchaseRow{Donation: d}
		if d.ArchiveID != "" {
			if m, ok := recording.ReadManifest(d.ArchiveID); ok {
				row.ArchiveTitle = m.Title
			}
		}
		rows = append(rows, row)
	}

	baseCurrency := data.GetBaseCurrency()
	count, _ := data.GetDonationCount()
	total, _ := data.GetDonationTotal(baseCurrency)

	response := map[string]interface{}{
		"donations":     rows,
		"total":         count,
		"totalAmount":   total,
		"totalCurrency": baseCurrency,
	}

	controllers.WriteResponse(w, response)
}

// GetDonationSummary returns donation statistics.
func GetDonationSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	baseCurrency := data.GetBaseCurrency()
	count, _ := data.GetDonationCount()
	total, _ := data.GetDonationTotal(baseCurrency)
	monthly, _ := data.GetMonthlyDonationTotal(baseCurrency)

	response := map[string]interface{}{
		"count": count,
		"totals": map[string]int64{
			baseCurrency: total,
		},
		"baseCurrency": baseCurrency,
		"monthlyTotal": monthly,
	}
	// Deprecated alias kept for external consumers of the admin API.
	if baseCurrency == "JPY" {
		response["monthlyJPY"] = monthly
	}

	controllers.WriteResponse(w, response)
}

// GetDonationStats returns detailed purchase statistics for the admin
// dashboard: per-currency totals, provider and item breakdowns, and a daily
// series for charting. Test purchases are excluded from all aggregates.
func GetDonationStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	stats, err := data.GetDonationStats()
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to aggregate purchase stats")
		return
	}

	controllers.WriteResponse(w, stats)
}

// CreateDonation creates a new donation (for manual entry or webhook integration).
func CreateDonation(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	type donationRequest struct {
		Amount          int64  `json:"amount"`
		Currency        string `json:"currency"`
		Message         string `json:"message"`
		DisplayName     string `json:"displayName"`
		IsAnonymous     bool   `json:"isAnonymous"`
		UserID          string `json:"userId"`
		PaymentProvider string `json:"paymentProvider"`
		PaymentID       string `json:"paymentId"`
		ItemType        string `json:"itemType"`
		EffectType      string `json:"effectType"`
	}

	decoder := json.NewDecoder(r.Body)
	var request donationRequest
	if err := decoder.Decode(&request); err != nil {
		log.Errorln("error decoding donation request:", err)
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// Validate required fields
	if request.Amount <= 0 {
		controllers.WriteSimpleResponse(w, false, "amount must be greater than 0")
		return
	}

	// Maximum donation amount in stored units: 1,000,000 major units for
	// zero-decimal currencies, 10,000 major units (1,000,000 minor) otherwise.
	if request.Amount > 1000000 {
		controllers.WriteSimpleResponse(w, false, "amount exceeds maximum limit")
		return
	}

	// Validate currency
	if request.Currency == "" {
		request.Currency = data.GetBaseCurrency()
	}
	if !models.IsSupportedFiatCurrency(request.Currency) {
		controllers.WriteSimpleResponse(w, false, "unsupported currency")
		return
	}

	// Sanitize inputs
	if len(request.Message) > 500 {
		request.Message = request.Message[:500]
	}
	if len(request.DisplayName) > 100 {
		request.DisplayName = request.DisplayName[:100]
	}

	// A nameless donation is treated as anonymous; the display name stays
	// empty and clients localize the anonymous label via the isAnonymous flag,
	// matching the payment-provider controllers.
	if request.DisplayName == "" {
		request.IsAnonymous = true
	}

	// Normalize the purchased item (Super Chat by default; a screen effect
	// requires a valid effect type).
	itemType := models.DonationItemSuperChat
	effectType := ""
	if request.ItemType == models.DonationItemEffect {
		if !models.IsValidEffectType(request.EffectType) {
			controllers.WriteSimpleResponse(w, false, "invalid effect type")
			return
		}
		itemType = models.DonationItemEffect
		effectType = request.EffectType
	}

	donation := &models.Donation{
		ID:              shortid.MustGenerate(),
		Amount:          request.Amount,
		Currency:        request.Currency,
		Message:         request.Message,
		DisplayName:     request.DisplayName,
		IsAnonymous:     request.IsAnonymous,
		UserID:          request.UserID,
		PaymentProvider: request.PaymentProvider,
		PaymentID:       request.PaymentID,
		ItemType:        itemType,
		EffectType:      effectType,
	}

	if err := data.AddDonation(donation); err != nil {
		log.Errorln("error saving donation:", err)
		controllers.WriteSimpleResponse(w, false, "failed to save donation")
		return
	}

	// Broadcast donation event to chat
	broadcastDonationEvent(donation)

	// Send webhook
	sendDonationWebhook(donation)

	controllers.WriteResponse(w, donation)
}

// CreateDonationExternal creates a donation via external API (for integrations).
func CreateDonationExternal(integration user.ExternalAPIUser, w http.ResponseWriter, r *http.Request) {
	CreateDonation(w, r)
}

// UpdateDonationVisibility updates the visibility of a donation.
func UpdateDonationVisibility(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	type visibilityRequest struct {
		ID      string `json:"id"`
		Visible bool   `json:"visible"`
	}

	decoder := json.NewDecoder(r.Body)
	var request visibilityRequest
	if err := decoder.Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if err := data.SetDonationVisibility(request.ID, request.Visible); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to update donation visibility")
		return
	}

	controllers.WriteSimpleResponse(w, true, "donation visibility updated")
}

// DeleteDonation deletes a donation permanently.
func DeleteDonation(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	type deleteRequest struct {
		ID string `json:"id"`
	}

	decoder := json.NewDecoder(r.Body)
	var request deleteRequest
	if err := decoder.Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if request.ID == "" {
		controllers.WriteSimpleResponse(w, false, "id is required")
		return
	}

	if err := data.DeleteDonation(request.ID); err != nil {
		log.Errorln("error deleting donation:", err)
		controllers.WriteSimpleResponse(w, false, "failed to delete donation")
		return
	}

	controllers.WriteSimpleResponse(w, true, "donation deleted")
}

// GetRecentDonations returns the most recent donations (for public display).
func GetRecentDonations(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	limit := 10
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}

	donations, err := data.GetRecentDonations(limit)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to get donations")
		return
	}

	controllers.WriteResponse(w, toPublicDonations(donations))
}

// publicDonation is the reduced, public-safe view of a donation. It omits
// payment references (paymentId/provider), the internal userId, and honors
// anonymity by blanking the display name — none of which the public recent
// feed needs, and all of which the full model would otherwise leak.
type publicDonation struct {
	// ID is the internal donation row ID — safe to expose (it is not a payment
	// reference) and required by polling consumers (mcv overlay) for dedup.
	ID     string `json:"id"`
	Amount int64  `json:"amount"`
	// Currency is the payment currency; AmountJPY/FiatCurrency carry the
	// base-currency conversion for crypto rows (wire name kept for replay
	// compatibility; empty FiatCurrency means JPY).
	Currency     string `json:"currency"`
	AmountJPY    int64  `json:"amountJpy,omitempty"`
	FiatCurrency string `json:"fiatCurrency,omitempty"`
	Message      string `json:"message,omitempty"`
	DisplayName  string `json:"displayName"`
	IsAnonymous  bool   `json:"isAnonymous"`
	ItemType     string `json:"itemType,omitempty"`
	EffectType   string `json:"effectType,omitempty"`
	CreatedAt    string `json:"createdAt,omitempty"`
}

func toPublicDonations(donations []*models.Donation) []publicDonation {
	out := make([]publicDonation, 0, len(donations))
	for _, d := range donations {
		if d == nil {
			continue
		}
		// Archive purchases are private entitlements and coin top-ups are private
		// wallet charges: neither is broadcast to chat, so the public recent feed
		// (and the mcv overlay polling it) must not leak the buyer either. A
		// coin-funded superchat/effect keeps its own item type and still shows.
		if d.ItemType == "archive" || d.ItemType == models.DonationItemCoin {
			continue
		}
		name := d.DisplayName
		if d.IsAnonymous {
			name = ""
		}
		var createdAt string
		if !d.CreatedAt.IsZero() {
			createdAt = d.CreatedAt.Format(time.RFC3339)
		}
		out = append(out, publicDonation{
			ID:           d.ID,
			Amount:       d.Amount,
			Currency:     d.Currency,
			AmountJPY:    d.AmountJPY,
			FiatCurrency: d.FiatCurrency,
			Message:      d.Message,
			DisplayName:  name,
			IsAnonymous:  d.IsAnonymous,
			ItemType:     d.ItemType,
			EffectType:   d.EffectType,
			CreatedAt:    createdAt,
		})
	}
	return out
}

// broadcastDonationEvent sends a donation event to all connected chat clients.
func broadcastDonationEvent(donation *models.Donation) {
	var u *user.User
	if donation.UserID != "" {
		u = user.GetUserByID(donation.UserID)
	}

	event := events.NewDonationEvent(
		donation.ID,
		donation.Amount,
		donation.Currency,
		donation.Message,
		donation.DisplayName,
		donation.IsAnonymous,
		u,
	).WithItem(donation.ItemType, donation.EffectType)

	if err := chat.Broadcast(event); err != nil {
		log.Errorln("error broadcasting donation event:", err)
	}
}

// sendDonationWebhook sends a donation webhook to configured endpoints.
func sendDonationWebhook(donation *models.Donation) {
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)
}
