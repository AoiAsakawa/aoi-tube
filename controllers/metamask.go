package controllers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	log "github.com/sirupsen/logrus"
)

// GetMetamaskStatus returns Metamask enabled status and config for public.
func GetMetamaskStatus(w http.ResponseWriter, r *http.Request) {
	config := data.GetMetamaskConfig()
	WriteResponse(w, map[string]interface{}{
		"enabled":        config.Enabled,
		"walletAddress":  config.WalletAddress,
		"bitcoinAddress": config.BitcoinAddress,
		"networkId":      config.NetworkID,
		"networkName":    config.NetworkName,
		"chainCurrency":  config.ChainCurrency,
	})
}

// isTestNetwork reports whether the configured chain is a known test
// network, so test purchases are excluded from revenue aggregates.
func isTestNetwork(networkName string) bool {
	name := strings.ToLower(networkName)
	for _, marker := range []string{"sepolia", "goerli", "mumbai", "testnet", "devnet"} {
		if strings.Contains(name, marker) {
			return true
		}
	}
	return false
}

// MetamaskConfirmDonation confirms a Metamask donation after transaction is complete.
func MetamaskConfirmDonation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetMetamaskConfig()
	if !config.Enabled {
		WriteSimpleResponse(w, false, "Metamask is not enabled")
		return
	}

	var request models.MetamaskDonationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// Validate transaction hash (supports both Ethereum 0x... and Bitcoin hex format)
	if request.TransactionHash == "" {
		WriteSimpleResponse(w, false, "invalid transaction hash")
		return
	}
	// Bitcoin txid is 64 hex chars without 0x prefix, Ethereum is 66 chars with 0x prefix
	isValidEthTxHash := strings.HasPrefix(request.TransactionHash, "0x") && len(request.TransactionHash) == 66
	isValidBtcTxHash := !strings.HasPrefix(request.TransactionHash, "0x") && len(request.TransactionHash) == 64
	if !isValidEthTxHash && !isValidBtcTxHash {
		WriteSimpleResponse(w, false, "invalid transaction hash")
		return
	}

	// Validate from address (supports Ethereum 0x..., Bitcoin bc1..., and legacy formats)
	if request.FromAddress == "" {
		WriteSimpleResponse(w, false, "invalid from address")
		return
	}
	isValidEthAddress := strings.HasPrefix(request.FromAddress, "0x") && len(request.FromAddress) == 42
	isValidBtcAddress := strings.HasPrefix(request.FromAddress, "bc1") || strings.HasPrefix(request.FromAddress, "1") || strings.HasPrefix(request.FromAddress, "3")
	if !isValidEthAddress && !isValidBtcAddress {
		WriteSimpleResponse(w, false, "invalid from address")
		return
	}

	// Sanitize inputs
	if len(request.Message) > 500 {
		request.Message = request.Message[:500]
	}
	if len(request.DisplayName) > 100 {
		request.DisplayName = request.DisplayName[:100]
	}

	// Derive a deterministic donation ID from the transaction hash so the same
	// on-chain payment can only ever produce a single donation record (persistent
	// idempotency across restarts, unlike an in-memory set).
	donationID := "metamask_" + strings.ToLower(request.TransactionHash)
	if _, err := data.GetDonationByID(donationID); err == nil {
		log.Debugf("Metamask donation for tx %s already recorded; ignoring duplicate", request.TransactionHash)
		WriteResponse(w, map[string]interface{}{
			"success":    true,
			"donationId": donationID,
			"message":    "already recorded",
		})
		return
	}

	// Verify the transaction on-chain before recording anything. The amount is
	// taken from the chain, never from the client, and any transaction we cannot
	// confirm (wrong recipient, not mined, RPC unavailable) is rejected.
	verifiedAmount, err := verifyMetamaskDonation(config, request)
	if err != nil {
		log.Warnf("Metamask donation verification failed for tx %s: %v", request.TransactionHash, err)
		WriteSimpleResponse(w, false, "transaction could not be verified on-chain")
		return
	}

	itemType, effectType, err := normalizePurchaseItem(request.ItemType, request.EffectType)
	if err != nil {
		WriteSimpleResponse(w, false, err.Error())
		return
	}

	displayName := request.DisplayName
	if request.IsAnonymous || displayName == "" {
		displayName = "" // localized by clients via the isAnonymous flag
	}

	// Use TokenSymbol if provided, otherwise use chain currency
	currency := request.TokenSymbol
	if currency == "" {
		currency = config.ChainCurrency
	}

	// Record the JPY value at confirmation time; 0 means no conversion was
	// available and displays fall back to the raw crypto amount.
	amountJPY := ConvertCryptoToJPY(currency, verifiedAmount)

	// Screen effects are fixed-price products. For crypto payments the
	// verified on-chain amount is checked against the JPY price, with a 5%
	// tolerance for market movement between quoting and confirmation.
	// Without a price conversion the fixed price cannot be verified, so the
	// purchase is rejected (Super Chats are unaffected).
	if itemType == models.DonationItemEffect {
		if amountJPY == 0 {
			WriteSimpleResponse(w, false, "screen effects require a price conversion; try a fiat payment method")
			return
		}
		priceJPY, ok := models.GetEffectPrice(effectType, "JPY")
		if !ok {
			WriteSimpleResponse(w, false, "invalid effect type")
			return
		}
		if float64(amountJPY) < float64(priceJPY)*0.95 {
			WriteSimpleResponse(w, false, "on-chain amount is below the effect price")
			return
		}
	}

	donation := &models.Donation{
		ID:              donationID,
		Amount:          verifiedAmount,
		Currency:        currency,
		AmountJPY:       amountJPY,
		Message:         request.Message,
		DisplayName:     displayName,
		IsAnonymous:     request.IsAnonymous,
		PaymentProvider: "metamask",
		PaymentID:       request.TransactionHash,
		ItemType:        itemType,
		EffectType:      effectType,
		IsTest:          isTestNetwork(config.NetworkName),
		CreatedAt:       time.Now(),
	}

	if err := data.AddDonation(donation); err != nil {
		log.Errorf("Failed to save Metamask donation: %v", err)
		WriteSimpleResponse(w, false, "failed to save donation")
		return
	}

	// Broadcast to chat
	event := events.NewDonationEvent(
		donation.ID,
		donation.Amount,
		donation.Currency,
		donation.Message,
		displayName,
		request.IsAnonymous,
		nil,
	).WithItem(donation.ItemType, donation.EffectType).WithAmountJPY(donation.AmountJPY)

	if err := chat.Broadcast(event); err != nil {
		log.Errorf("Failed to broadcast Metamask donation: %v", err)
	}

	// Send webhook
	webhookEvent := webhooks.WebhookEvent{
		Type:      models.DonationReceived,
		EventData: donation,
	}
	webhooks.SendEventToWebhooks(webhookEvent)

	log.Infof("Metamask donation verified: %s - %.8f %s from %s (tx: %s)",
		donation.ID, float64(verifiedAmount)/100000000, currency, displayName, request.TransactionHash)

	WriteResponse(w, map[string]interface{}{
		"success":    true,
		"donationId": donationID,
	})
}
