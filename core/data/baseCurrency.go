package data

import (
	"errors"

	"github.com/aoiasakawa/aoitube/models"
)

const baseCurrencyKey = "base_currency"

// GetBaseCurrency returns the server's base fiat currency: the currency
// crypto purchases are converted into for tiering and revenue reporting, and
// the default currency wherever none is configured. Defaults to JPY.
func GetBaseCurrency() string {
	currency, _ := _datastore.GetString(baseCurrencyKey)
	if currency == "" {
		return "JPY"
	}
	return currency
}

// SetBaseCurrency sets the server's base fiat currency.
func SetBaseCurrency(currency string) error {
	if !models.IsSupportedFiatCurrency(currency) {
		return errors.New("unsupported base currency")
	}
	return _datastore.SetString(baseCurrencyKey, currency)
}
