package models

// SupportedFiatCurrencies are the fiat currency codes accepted anywhere a
// currency can be configured (base currency, provider currency, archive
// pricing, manual purchase entry). Must stay in sync with FIAT_CURRENCIES in
// web/interfaces/donation.model.ts.
var SupportedFiatCurrencies = []string{
	"JPY", "USD", "EUR", "GBP", "CAD", "AUD", "CNY", "HKD",
	"SGD", "TWD", "KRW", "THB", "PHP", "MYR", "INR", "BRL",
	"MXN", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "NZD",
}

// IsSupportedFiatCurrency reports whether code is a supported fiat currency.
func IsSupportedFiatCurrency(code string) bool {
	for _, c := range SupportedFiatCurrencies {
		if c == code {
			return true
		}
	}
	return false
}

// zeroDecimalCurrencies are supported fiat currencies with no minor unit
// (ISO 4217 exponent 0). Amounts in these currencies are stored in major
// units; every other fiat currency is stored in minor units (cents).
var zeroDecimalCurrencies = map[string]bool{
	"JPY": true,
	"KRW": true,
}

// IsZeroDecimalCurrency reports whether amounts in the given fiat currency
// are stored in major units instead of minor units.
func IsZeroDecimalCurrency(code string) bool {
	return zeroDecimalCurrencies[code]
}

// FiatToStoredUnits converts a major-unit fiat value into the DB-stored
// representation: major units for zero-decimal currencies, minor units
// (hundredths) otherwise.
func FiatToStoredUnits(majorAmount float64, currency string) int64 {
	if IsZeroDecimalCurrency(currency) {
		return int64(majorAmount)
	}
	return int64(majorAmount * 100)
}
