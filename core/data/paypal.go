package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	paypalEnabledKey      = "paypal_enabled"
	paypalClientIDKey     = "paypal_client_id"     // Legacy, deprecated
	paypalClientSecretKey = "paypal_client_secret" // Legacy, deprecated
	paypalSandboxKey      = "paypal_is_sandbox"
	paypalCurrencyCodeKey = "paypal_currency_code"
	paypalMerchantIDKey   = "paypal_merchant_id"

	// Sandbox credentials
	paypalSandboxClientIDKey     = "paypal_sandbox_client_id"
	paypalSandboxClientSecretKey = "paypal_sandbox_client_secret"

	// Production credentials
	paypalProductionClientIDKey     = "paypal_production_client_id"
	paypalProductionClientSecretKey = "paypal_production_client_secret"
)

// GetPayPalConfig returns the PayPal configuration.
func GetPayPalConfig() models.PayPalConfig {
	enabled, _ := _datastore.GetBool(paypalEnabledKey)
	isSandbox, _ := _datastore.GetBool(paypalSandboxKey)
	currencyCode, _ := _datastore.GetString(paypalCurrencyCodeKey)
	merchantID, _ := _datastore.GetString(paypalMerchantIDKey)

	// Get sandbox credentials
	sandboxClientID, _ := _datastore.GetString(paypalSandboxClientIDKey)
	sandboxClientSecret, _ := _datastore.GetString(paypalSandboxClientSecretKey)

	// Get production credentials
	productionClientID, _ := _datastore.GetString(paypalProductionClientIDKey)
	productionClientSecret, _ := _datastore.GetString(paypalProductionClientSecretKey)

	// Legacy fields for backward compatibility
	legacyClientID, _ := _datastore.GetString(paypalClientIDKey)
	legacyClientSecret, _ := _datastore.GetString(paypalClientSecretKey)

	// Default to USD if not set
	if currencyCode == "" {
		currencyCode = "USD"
	}

	return models.PayPalConfig{
		Enabled:                enabled,
		IsSandbox:              isSandbox,
		CurrencyCode:           currencyCode,
		MerchantID:             merchantID,
		SandboxClientID:        sandboxClientID,
		SandboxClientSecret:    sandboxClientSecret,
		ProductionClientID:     productionClientID,
		ProductionClientSecret: productionClientSecret,
		ClientID:               legacyClientID,
		ClientSecret:           legacyClientSecret,
	}
}

// SetPayPalConfig saves the PayPal configuration.
func SetPayPalConfig(config models.PayPalConfig) error {
	if err := _datastore.SetBool(paypalEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetBool(paypalSandboxKey, config.IsSandbox); err != nil {
		return err
	}
	if err := _datastore.SetString(paypalCurrencyCodeKey, config.CurrencyCode); err != nil {
		return err
	}
	if err := _datastore.SetString(paypalMerchantIDKey, config.MerchantID); err != nil {
		return err
	}

	// Save sandbox credentials
	if err := _datastore.SetString(paypalSandboxClientIDKey, config.SandboxClientID); err != nil {
		return err
	}
	if err := _datastore.SetString(paypalSandboxClientSecretKey, config.SandboxClientSecret); err != nil {
		return err
	}

	// Save production credentials
	if err := _datastore.SetString(paypalProductionClientIDKey, config.ProductionClientID); err != nil {
		return err
	}
	if err := _datastore.SetString(paypalProductionClientSecretKey, config.ProductionClientSecret); err != nil {
		return err
	}

	// Also save to legacy fields for backward compatibility (use active credentials)
	if err := _datastore.SetString(paypalClientIDKey, config.GetActiveClientID()); err != nil {
		return err
	}
	if err := _datastore.SetString(paypalClientSecretKey, config.GetActiveClientSecret()); err != nil {
		return err
	}

	return nil
}

// SetPayPalEnabled sets whether PayPal is enabled.
func SetPayPalEnabled(enabled bool) error {
	return _datastore.SetBool(paypalEnabledKey, enabled)
}

// SetPayPalClientID sets the PayPal client ID.
func SetPayPalClientID(clientID string) error {
	return _datastore.SetString(paypalClientIDKey, clientID)
}

// SetPayPalClientSecret sets the PayPal client secret.
func SetPayPalClientSecret(clientSecret string) error {
	return _datastore.SetString(paypalClientSecretKey, clientSecret)
}

// SetPayPalSandbox sets whether to use sandbox mode.
func SetPayPalSandbox(isSandbox bool) error {
	return _datastore.SetBool(paypalSandboxKey, isSandbox)
}

// SetPayPalCurrencyCode sets the PayPal currency code.
func SetPayPalCurrencyCode(currencyCode string) error {
	return _datastore.SetString(paypalCurrencyCodeKey, currencyCode)
}

// SetPayPalMerchantID sets the PayPal merchant ID.
func SetPayPalMerchantID(merchantID string) error {
	return _datastore.SetString(paypalMerchantIDKey, merchantID)
}
