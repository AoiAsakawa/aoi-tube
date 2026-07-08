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

	log "github.com/sirupsen/logrus"
)

// PriceCache stores cached crypto prices.
type PriceCache struct {
	prices    map[string]float64
	updatedAt time.Time
	mu        sync.RWMutex
}

var priceCache = &PriceCache{
	prices: make(map[string]float64),
}

const priceCacheDuration = 60 * time.Second // Cache for 1 minute

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

// symbolToCoinGeckoID maps donation currency symbols to CoinGecko IDs for
// JPY conversion at purchase-confirmation time.
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
}

// ConvertCryptoToJPY converts a 1e8-normalized crypto amount into whole JPY
// at the current market price. Returns 0 when no conversion is available
// (unknown symbol or price APIs unreachable); callers treat 0 as "no
// conversion" and fall back to displaying the raw crypto amount.
func ConvertCryptoToJPY(currencySymbol string, amount1e8 int64) int64 {
	coinID, ok := symbolToCoinGeckoID[strings.ToUpper(currencySymbol)]
	if !ok {
		return 0
	}
	price, err := fetchCoinGeckoPrice(coinID)
	if err != nil {
		log.Warnf("JPY conversion unavailable for %s: %v", currencySymbol, err)
		return 0
	}
	return int64(float64(amount1e8) / 1e8 * price)
}

// GetCryptoPrice returns the JPY price for a cryptocurrency.
func GetCryptoPrice(w http.ResponseWriter, r *http.Request) {
	coinID := r.URL.Query().Get("coin")
	if coinID == "" {
		coinID = "ethereum"
	}

	price, err := fetchCoinGeckoPrice(coinID)
	if err != nil {
		WriteResponse(w, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	WriteResponse(w, map[string]interface{}{
		"success":   true,
		"coinId":    coinID,
		"priceJpy":  price,
		"updatedAt": time.Now().Unix(),
	})
}

// GetMultipleCryptoPrices returns JPY prices for multiple cryptocurrencies.
func GetMultipleCryptoPrices(w http.ResponseWriter, r *http.Request) {
	// Common coins used in donations
	coinIDs := []string{"ethereum", "matic-network", "binancecoin", "tether", "usd-coin", "dai", "avalanche-2"}

	prices := make(map[string]float64)
	for _, coinID := range coinIDs {
		price, err := fetchCoinGeckoPrice(coinID)
		if err == nil {
			prices[coinID] = price
		}
	}

	WriteResponse(w, map[string]interface{}{
		"success":   true,
		"prices":    prices,
		"updatedAt": time.Now().Unix(),
	})
}

func fetchCoinGeckoPrice(coinID string) (float64, error) {
	// Check cache first
	priceCache.mu.RLock()
	if time.Since(priceCache.updatedAt) < priceCacheDuration {
		if price, ok := priceCache.prices[coinID]; ok {
			priceCache.mu.RUnlock()
			return price, nil
		}
	}
	priceCache.mu.RUnlock()

	// Try CoinGecko with retry logic
	var lastCoinGeckoErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			time.Sleep(time.Duration(250*(1<<attempt)) * time.Millisecond)
		}
		price, err := fetchFromCoinGecko(coinID)
		if err == nil {
			// Update cache
			priceCache.mu.Lock()
			priceCache.prices[coinID] = price
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
		price, err := fetchFromCoinMarketCap(coinID)
		if err == nil {
			// Update cache
			priceCache.mu.Lock()
			priceCache.prices[coinID] = price
			priceCache.updatedAt = time.Now()
			priceCache.mu.Unlock()
			return price, nil
		}
		lastCMCErr = err
	}

	// Both failed after retries
	return 0, fmt.Errorf("CoinGecko (3 retries): %v, CMC (3 retries): %v", lastCoinGeckoErr, lastCMCErr)
}

func fetchFromCoinGecko(coinID string) (float64, error) {
	url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=jpy", coinID)

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

	price, ok := coinData["jpy"]
	if !ok {
		return 0, fmt.Errorf("JPY price not found for %s", coinID)
	}

	return price, nil
}

func fetchFromCoinMarketCap(coinGeckoID string) (float64, error) {
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

	url := fmt.Sprintf("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=%s&convert=JPY", cmcID)

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

	jpyQuote, ok := coinData.Quote["JPY"]
	if !ok {
		return 0, fmt.Errorf("JPY price not found for %s in CMC", cmcID)
	}

	return jpyQuote.Price, nil
}
