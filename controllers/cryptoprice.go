package controllers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
	log "github.com/sirupsen/logrus"
)

// PriceCache stores cached crypto prices. prices holds the last known value per
// (coin,fiat) key and is kept as a fallback even after it goes stale, so the UI
// can still show a price when a provider is temporarily unavailable.
// failedUntil records a per-key cooldown after a fetch failure so a provider
// rate-limit (e.g. Coinpaprika's free 60/hour cap) isn't hammered by the
// client's retries.
type PriceCache struct {
	prices      map[string]float64
	updatedAt   time.Time
	failedUntil map[string]time.Time
	mu          sync.RWMutex
}

var priceCache = &PriceCache{
	prices:      make(map[string]float64),
	failedUntil: make(map[string]time.Time),
}

const priceCacheDuration = 60 * time.Second // Cache for 1 minute
// priceFailCooldown is how long we avoid re-hitting the price providers after a
// failure, so a rate-limited free API isn't re-called on every client retry.
const priceFailCooldown = 5 * time.Minute

// recordPriceFailure starts a cooldown for a (coin,fiat) key after a failed
// fetch so subsequent requests don't re-hit the providers until it expires.
func recordPriceFailure(cacheKey string) {
	priceCache.mu.Lock()
	priceCache.failedUntil[cacheKey] = time.Now().Add(priceFailCooldown)
	priceCache.mu.Unlock()
}

// lastKnownPrice returns the last successfully-fetched price for a key, if any.
func lastKnownPrice(cacheKey string) (float64, bool) {
	priceCache.mu.RLock()
	defer priceCache.mu.RUnlock()
	p, ok := priceCache.prices[cacheKey]
	return p, ok
}

// CoinGecko ID to CoinMarketCap ID mapping
var coinGeckoToCMC = map[string]string{
	"ethereum":                "1027",
	"bitcoin":                 "1",
	"matic-network":           "3890",  // Legacy MATIC
	"polygon-ecosystem-token": "28321", // POL (new Polygon token)
	"binancecoin":             "1839",
	"avalanche-2":             "5805",
	"tether":                  "825",
	"usd-coin":                "3408",
	"dai":                     "4943",
	"arbitrum":                "11841",
	"optimism":                "11840",
	"solana":                  "5426",
	"sei-network":             "23149",
	// Additional tokens
	"quickswap":         "8206",  // QUICK (Polygon)
	"pancakeswap-token": "7186",  // CAKE (BNB Chain)
	"gmx":               "11857", // GMX (Arbitrum)
	"magic":             "14783", // MAGIC (Arbitrum)
	"joe":               "11396", // JOE (Avalanche)
	"pangolin":          "8422",  // PNG (Avalanche)
}

// coinGeckoToPaprika maps CoinGecko IDs to Coinpaprika ticker IDs for the
// third-tier price fallback. Coins without an entry simply skip this tier.
var coinGeckoToPaprika = map[string]string{
	"ethereum":                "eth-ethereum",
	"bitcoin":                 "btc-bitcoin",
	"matic-network":           "matic-polygon",
	"polygon-ecosystem-token": "pol-polygon-ecosystem-token",
	"binancecoin":             "bnb-binance-coin",
	"avalanche-2":             "avax-avalanche",
	"tether":                  "usdt-tether",
	"usd-coin":                "usdc-usd-coin",
	"dai":                     "dai-dai",
	"arbitrum":                "arb-arbitrum",
	"optimism":                "op-optimism",
	"solana":                  "sol-solana",
	"sei-network":             "sei-sei",
	"pancakeswap-token":       "cake-pancakeswap",
	"gmx":                     "gmx-gmx",
	"pangolin":                "png-pangolin",
	"virbicoin":               "vbc-virbicoin",
}

// paprikaOnlyCoins are coins listed on Coinpaprika but not on CoinGecko or
// CoinMarketCap. Their price lookups skip straight to the Coinpaprika tier
// instead of burning retries against providers that will never know them.
// The map key is the internal (pseudo CoinGecko) coin ID.
var paprikaOnlyCoins = map[string]bool{
	"virbicoin": true,
}

// symbolToCoinGeckoID maps donation currency symbols to CoinGecko IDs for
// base-currency conversion at purchase-confirmation time.
var symbolToCoinGeckoID = map[string]string{
	"ETH":   "ethereum",
	"BTC":   "bitcoin",
	"MATIC": "matic-network",
	"POL":   "polygon-ecosystem-token",
	"BNB":   "binancecoin",
	"AVAX":  "avalanche-2",
	"USDT":  "tether",
	"USDC":  "usd-coin",
	"DAI":   "dai",
	"ARB":   "arbitrum",
	"OP":    "optimism",
	"SOL":   "solana",
	"SEI":   "sei-network",
	"VBC":   "virbicoin",
}

// ConvertCryptoToFiat converts a 1e8-normalized crypto amount into the
// server's base fiat currency at the current market price, returning the
// value in DB-stored units (major units for zero-decimal currencies, minor
// units otherwise) together with the currency code. Returns 0 when no
// conversion is available (unknown symbol or price APIs unreachable);
// callers treat 0 as "no conversion" and fall back to displaying the raw
// crypto amount.
func ConvertCryptoToFiat(currencySymbol string, amount1e8 int64) (int64, string) {
	fiat := data.GetBaseCurrency()
	coinID, ok := symbolToCoinGeckoID[strings.ToUpper(currencySymbol)]
	if !ok {
		return 0, fiat
	}
	price, err := fetchCoinGeckoPrice(coinID, fiat)
	if err != nil {
		log.Warnf("%s conversion unavailable for %s: %v", fiat, currencySymbol, err)
		return 0, fiat
	}
	return models.FiatToStoredUnits(float64(amount1e8)/1e8*price, fiat), fiat
}

// GetCryptoPrice returns the base-currency price for a cryptocurrency.
func GetCryptoPrice(w http.ResponseWriter, r *http.Request) {
	coinID := r.URL.Query().Get("coin")
	if coinID == "" {
		coinID = "ethereum"
	}

	fiat := data.GetBaseCurrency()
	price, err := fetchCoinGeckoPrice(coinID, fiat)
	if err != nil {
		WriteResponse(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	response := map[string]interface{}{
		"success":   true,
		"coinId":    coinID,
		"price":     price,
		"currency":  fiat,
		"updatedAt": time.Now().Unix(),
	}
	// Deprecated alias kept for external consumers of the public API.
	if fiat == "JPY" {
		response["priceJpy"] = price
	}
	WriteResponse(w, response)
}

// GetMultipleCryptoPrices returns base-currency prices for multiple cryptocurrencies.
func GetMultipleCryptoPrices(w http.ResponseWriter, r *http.Request) {
	// Common coins used in donations
	coinIDs := []string{"ethereum", "matic-network", "binancecoin", "tether", "usd-coin", "dai", "avalanche-2"}

	fiat := data.GetBaseCurrency()
	prices := make(map[string]float64)
	for _, coinID := range coinIDs {
		price, err := fetchCoinGeckoPrice(coinID, fiat)
		if err == nil {
			prices[coinID] = price
		}
	}

	WriteResponse(w, map[string]interface{}{
		"success":   true,
		"prices":    prices,
		"currency":  fiat,
		"updatedAt": time.Now().Unix(),
	})
}

func fetchCoinGeckoPrice(coinID, fiat string) (float64, error) {
	// Cache per (coin, fiat) pair so a base-currency change never serves a
	// price quoted in the previous currency.
	cacheKey := coinID + ":" + fiat

	// Check cache first
	priceCache.mu.RLock()
	if time.Since(priceCache.updatedAt) < priceCacheDuration {
		if price, ok := priceCache.prices[cacheKey]; ok {
			priceCache.mu.RUnlock()
			return price, nil
		}
	}
	// Negative cache: after a recent failure (e.g. a provider rate-limit), don't
	// re-hit the providers until the cooldown expires; serve the last-known
	// price if we have one so the UI still shows a value.
	if until, failed := priceCache.failedUntil[cacheKey]; failed && time.Now().Before(until) {
		price, ok := priceCache.prices[cacheKey]
		priceCache.mu.RUnlock()
		if ok {
			return price, nil
		}
		return 0, fmt.Errorf("price temporarily unavailable (provider cooldown)")
	}
	priceCache.mu.RUnlock()

	// Coins only Coinpaprika knows go straight to that tier. Its free tier is
	// rate-limited (60/hour), so a single attempt — combined with the negative
	// cache above — avoids burning the quota on retries.
	if paprikaOnlyCoins[coinID] {
		price, err := fetchFromCoinpaprika(coinID, fiat)
		if err == nil {
			priceCache.mu.Lock()
			priceCache.prices[cacheKey] = price
			priceCache.updatedAt = time.Now()
			priceCache.mu.Unlock()
			return price, nil
		}
		recordPriceFailure(cacheKey)
		if last, ok := lastKnownPrice(cacheKey); ok {
			return last, nil // serve stale rather than failing the UI
		}
		return 0, fmt.Errorf("Coinpaprika: %v", err)
	}

	// Try CoinGecko with retry logic
	var lastCoinGeckoErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			time.Sleep(time.Duration(250*(1<<attempt)) * time.Millisecond)
		}
		price, err := fetchFromCoinGecko(coinID, fiat)
		if err == nil {
			// Update cache
			priceCache.mu.Lock()
			priceCache.prices[cacheKey] = price
			priceCache.updatedAt = time.Now()
			priceCache.mu.Unlock()
			return price, nil
		}
		lastCoinGeckoErr = err
	}

	// CoinGecko failed after retries, try CoinMarketCap with retry logic
	var lastCMCErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			time.Sleep(time.Duration(250*(1<<attempt)) * time.Millisecond)
		}
		price, err := fetchFromCoinMarketCap(coinID, fiat)
		if err == nil {
			// Update cache
			priceCache.mu.Lock()
			priceCache.prices[cacheKey] = price
			priceCache.updatedAt = time.Now()
			priceCache.mu.Unlock()
			return price, nil
		}
		lastCMCErr = err
	}

	// CMC failed too, try Coinpaprika with retry logic
	var lastPaprikaErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			time.Sleep(time.Duration(250*(1<<attempt)) * time.Millisecond)
		}
		price, err := fetchFromCoinpaprika(coinID, fiat)
		if err == nil {
			// Update cache
			priceCache.mu.Lock()
			priceCache.prices[cacheKey] = price
			priceCache.updatedAt = time.Now()
			priceCache.mu.Unlock()
			return price, nil
		}
		lastPaprikaErr = err
	}

	// All providers failed: start a cooldown and serve the last-known price if
	// we have one so the UI keeps working.
	recordPriceFailure(cacheKey)
	if last, ok := lastKnownPrice(cacheKey); ok {
		return last, nil
	}
	return 0, fmt.Errorf("CoinGecko (3 retries): %v, CMC (3 retries): %v, Coinpaprika (3 retries): %v",
		lastCoinGeckoErr, lastCMCErr, lastPaprikaErr)
}

func fetchFromCoinGecko(coinID, fiat string) (float64, error) {
	vsCurrency := strings.ToLower(fiat)
	url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=%s", coinID, vsCurrency)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch price: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("CoinGecko API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	var result map[string]map[string]float64
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}

	coinData, ok := result[coinID]
	if !ok {
		return 0, fmt.Errorf("coin %s not found in response", coinID)
	}

	price, ok := coinData[vsCurrency]
	if !ok {
		return 0, fmt.Errorf("%s price not found for %s", fiat, coinID)
	}

	return price, nil
}

func fetchFromCoinMarketCap(coinGeckoID, fiat string) (float64, error) {
	// Get CMC API key from environment
	apiKey := os.Getenv("CMC_API_KEY")
	if apiKey == "" {
		return 0, fmt.Errorf("CMC_API_KEY not set")
	}

	// Convert CoinGecko ID to CMC ID
	cmcID, ok := coinGeckoToCMC[coinGeckoID]
	if !ok {
		return 0, fmt.Errorf("no CMC mapping for %s", coinGeckoID)
	}

	url := fmt.Sprintf("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=%s&convert=%s", cmcID, fiat)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("X-CMC_PRO_API_KEY", apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch price: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("CMC API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Data map[string]struct {
			Quote map[string]struct {
				Price float64 `json:"price"`
			} `json:"quote"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}

	coinData, ok := result.Data[cmcID]
	if !ok {
		return 0, fmt.Errorf("coin %s not found in CMC response", cmcID)
	}

	quote, ok := coinData.Quote[fiat]
	if !ok {
		return 0, fmt.Errorf("%s price not found for %s in CMC", fiat, cmcID)
	}

	return quote.Price, nil
}

// fetchFromCoinpaprika fetches a price from the free Coinpaprika API (no key
// required). Third-tier fallback after CoinGecko and CoinMarketCap.
func fetchFromCoinpaprika(coinGeckoID, fiat string) (float64, error) {
	paprikaID, ok := coinGeckoToPaprika[coinGeckoID]
	if !ok {
		return 0, fmt.Errorf("no Coinpaprika mapping for %s", coinGeckoID)
	}

	url := fmt.Sprintf("https://api.coinpaprika.com/v1/tickers/%s?quotes=%s", paprikaID, fiat)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch price: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("Coinpaprika API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Quotes map[string]struct {
			Price float64 `json:"price"`
		} `json:"quotes"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}

	quote, ok := result.Quotes[fiat]
	if !ok || quote.Price <= 0 {
		return 0, fmt.Errorf("%s price not found for %s in Coinpaprika", fiat, paprikaID)
	}

	return quote.Price, nil
}
