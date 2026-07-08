package models

import (
	"fmt"
	"slices"
	"time"
)

// Purchase item types. A purchase is either a Super Chat (highlighted chat
// message) or a screen effect played on every viewer's player.
const (
	// DonationItemSuperChat is a Super Chat purchase (default).
	DonationItemSuperChat = "superchat"
	// DonationItemEffect is a screen effect purchase.
	DonationItemEffect = "effect"
	// DonationItemArchive is a paid archive (pay-per-view VOD) purchase. The
	// confirmed row entitles ArchiveID's owner (UserID) to view that archive.
	DonationItemArchive = "archive"
)

// ValidEffectTypes are the screen effects that can be purchased, ordered by
// price ascending.
var ValidEffectTypes = []string{
	"confetti", "hearts", "stars", "fireworks", "celebration",
	"rainbow", "meteor", "goldrush",
}

// IsValidEffectType reports whether the given effect type can be purchased.
func IsValidEffectType(effectType string) bool {
	return slices.Contains(ValidEffectTypes, effectType)
}

// effectPrices are the fixed prices per screen effect in major currency
// units, keyed by currency code. Screen effects are fixed-price products;
// the server enforces these amounts and ignores the client-supplied amount.
// Currencies without an entry fall back to the USD price as an approximation.
var effectPrices = map[string]map[string]int64{
	// 300 JPY is the storefront-wide minimum price (operator decision); each
	// effect keeps a distinct price so the tiers never collide.
	"confetti":    {"JPY": 300, "USD": 3, "EUR": 3},
	"hearts":      {"JPY": 400, "USD": 4, "EUR": 4},
	"stars":       {"JPY": 500, "USD": 5, "EUR": 5},
	"fireworks":   {"JPY": 1000, "USD": 10, "EUR": 10},
	"celebration": {"JPY": 2000, "USD": 20, "EUR": 20},
	"rainbow":     {"JPY": 3000, "USD": 30, "EUR": 30},
	"meteor":      {"JPY": 5000, "USD": 50, "EUR": 50},
	"goldrush":    {"JPY": 10000, "USD": 100, "EUR": 100},
}

// GetEffectPrice returns the fixed price of a screen effect in major units
// of the given currency. ok is false for unknown effect types.
func GetEffectPrice(effectType, currency string) (int64, bool) {
	prices, ok := effectPrices[effectType]
	if !ok {
		return 0, false
	}
	if price, ok := prices[currency]; ok {
		return price, true
	}
	return prices["USD"], true
}

// Donation represents a viewer purchase (Super Chat or screen effect).
type Donation struct {
	// ID is the unique identifier of the donation.
	ID string `json:"id"`
	// UserID is the ID of the user who made the donation (if logged in).
	UserID string `json:"userId,omitempty"`
	// Amount is the donation amount in the smallest unit (e.g., cents, yen, or 1e8 for crypto).
	Amount int64 `json:"amount"`
	// Currency is the currency code (e.g., "JPY", "USD").
	Currency string `json:"currency"`
	// AmountJPY is the base-currency value of the purchase at confirmation
	// time, in stored units, used for crypto payments. The wire name predates
	// configurable base currencies and is kept so archived chat replays stay
	// readable; FiatCurrency names the actual currency. 0 means no conversion
	// was available; display then falls back to the raw crypto amount.
	AmountJPY int64 `json:"amountJpy,omitempty"`
	// FiatCurrency is the base currency AmountJPY was recorded in. Empty on
	// legacy rows, which are always JPY.
	FiatCurrency string `json:"fiatCurrency,omitempty"`
	// Message is an optional message from the donor.
	Message string `json:"message,omitempty"`
	// DisplayName is the name to display for the donation.
	DisplayName string `json:"displayName"`
	// IsAnonymous indicates if the donation should be shown anonymously.
	IsAnonymous bool `json:"isAnonymous"`
	// PaymentProvider is the payment service used (e.g., "stripe", "paypal", "manual").
	PaymentProvider string `json:"paymentProvider,omitempty"`
	// PaymentID is the external payment reference ID.
	PaymentID string `json:"paymentId,omitempty"`
	// ItemType is what was purchased: "superchat" (default) or "effect".
	ItemType string `json:"itemType,omitempty"`
	// EffectType is the screen effect purchased when ItemType is "effect".
	EffectType string `json:"effectType,omitempty"`
	// ArchiveID is the recorded session this purchase grants access to, when
	// ItemType is "archive".
	ArchiveID string `json:"archiveId,omitempty"`
	// IsTest marks purchases made through a sandbox/test-mode provider
	// configuration. Test purchases are excluded from revenue aggregates.
	IsTest bool `json:"isTest,omitempty"`
	// HiddenAt is when the donation was hidden (for moderation).
	HiddenAt *time.Time `json:"hiddenAt,omitempty"`
	// CreatedAt is when the donation was received.
	CreatedAt time.Time `json:"createdAt"`
}

// DonationEvent represents a donation event sent via WebSocket.
type DonationEvent struct {
	// Type is the event type (DONATION).
	Type EventType `json:"type"`
	// ID is the unique identifier.
	ID string `json:"id"`
	// Timestamp is when the event occurred.
	Timestamp time.Time `json:"timestamp"`
	// Donation is the donation data.
	Donation *Donation `json:"donation"`
}

// DonationSummary provides aggregate donation statistics.
type DonationSummary struct {
	// TotalAmount is the sum of all donations.
	TotalAmount int64 `json:"totalAmount"`
	// Currency is the currency of the total.
	Currency string `json:"currency"`
	// Count is the number of donations.
	Count int64 `json:"count"`
}

// DonationCurrencyStat summarizes purchases in one currency.
type DonationCurrencyStat struct {
	Currency  string `json:"currency"`
	Total     int64  `json:"total"`
	ThisMonth int64  `json:"thisMonth"`
	LastMonth int64  `json:"lastMonth"`
	Count     int64  `json:"count"`
	Average   int64  `json:"average"`
}

// DonationProviderStat summarizes purchases per payment provider and currency.
type DonationProviderStat struct {
	Provider string `json:"provider"`
	Currency string `json:"currency"`
	Total    int64  `json:"total"`
	Count    int64  `json:"count"`
}

// DonationItemStat summarizes purchases per item (Super Chat / each effect).
type DonationItemStat struct {
	ItemType   string `json:"itemType"`
	EffectType string `json:"effectType,omitempty"`
	Count      int64  `json:"count"`
}

// DonationDailyStat is one day of purchase totals for charting.
type DonationDailyStat struct {
	Date     string `json:"date"`
	Currency string `json:"currency"`
	Total    int64  `json:"total"`
	Count    int64  `json:"count"`
}

// DonationStats is the aggregate payload for the admin purchases dashboard.
// Test purchases are excluded from every series except TestCount.
type DonationStats struct {
	Currencies       []DonationCurrencyStat `json:"currencies"`
	Providers        []DonationProviderStat `json:"providers"`
	Items            []DonationItemStat     `json:"items"`
	Daily            []DonationDailyStat    `json:"daily"`
	UniquePurchasers int64                  `json:"uniquePurchasers"`
	TestCount        int64                  `json:"testCount"`
	// BaseCurrency is the server's configured base currency; CryptoFiatTotal
	// is expressed in it.
	BaseCurrency string `json:"baseCurrency"`
	// CryptoFiatTotal is the base-currency value of crypto purchases recorded
	// at their confirmation time (purchases recorded under a different base
	// currency or without a conversion are not included).
	CryptoFiatTotal int64 `json:"cryptoFiatTotal"`
}

// FormatAmount returns the formatted amount string based on currency.
func (d *Donation) FormatAmount() string {
	switch d.Currency {
	case "JPY":
		return "¥" + formatNumber(int64(d.Amount))
	case "USD":
		return "$" + formatDecimal(int64(d.Amount), 2)
	case "EUR":
		return "€" + formatDecimal(int64(d.Amount), 2)
	// Crypto currencies - stored as 1e8 units
	case "BTC", "ETH", "MATIC", "BNB", "AVAX", "VBC":
		return formatCrypto(int64(d.Amount), d.Currency)
	case "USDT", "USDC", "DAI":
		return formatCrypto(int64(d.Amount), d.Currency)
	default:
		// Try crypto format for unknown currencies
		cryptoAmount := float64(d.Amount) / 100000000
		if cryptoAmount < 1000 {
			return formatCrypto(int64(d.Amount), d.Currency)
		}
		return formatNumber(int64(d.Amount)) + " " + d.Currency
	}
}

func formatCrypto(amount int64, currency string) string {
	// Amount is stored as 1e8 units (like satoshi)
	cryptoAmount := float64(amount) / 100000000
	var formatted string
	if cryptoAmount < 0.0001 {
		formatted = formatFloat(cryptoAmount, 8)
	} else if cryptoAmount < 0.01 {
		formatted = formatFloat(cryptoAmount, 6)
	} else if cryptoAmount < 1 {
		formatted = formatFloat(cryptoAmount, 4)
	} else {
		formatted = formatFloat(cryptoAmount, 2)
	}
	return formatted + " " + currency
}

func formatFloat(f float64, decimals int) string {
	// Simple float formatting
	format := "%." + string('0'+byte(decimals)) + "f"
	return fmt.Sprintf(format, f)
}

func formatNumber(n int64) string {
	// Simple number formatting without external dependencies
	s := ""
	for n > 0 {
		if len(s) > 0 && len(s)%4 == 3 {
			s = "," + s
		}
		s = string('0'+byte(n%10)) + s
		n /= 10
	}
	if s == "" {
		return "0"
	}
	return s
}

func formatDecimal(n int64, decimals int) string {
	// For currencies that use decimal places (stored as cents)
	whole := n / 100
	frac := n % 100
	if decimals == 2 {
		return formatNumber(whole) + "." + padLeft(frac, 2)
	}
	return formatNumber(whole)
}

func padLeft(n int64, width int) string {
	s := formatNumber(n)
	for len(s) < width {
		s = "0" + s
	}
	return s
}
