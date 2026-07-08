package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	paypayEnabledKey    = "paypay_enabled"
	paypayAPIKeyKey     = "paypay_api_key"
	paypayAPISecretKey  = "paypay_api_secret"
	paypayMerchantIDKey = "paypay_merchant_id"
	paypaySandboxKey    = "paypay_is_sandbox"

	// Per-environment credentials (the legacy keys above act as a fallback)
	paypaySandboxAPIKeyKey        = "paypay_sandbox_api_key"
	paypaySandboxAPISecretKey     = "paypay_sandbox_api_secret" // nolint:gosec
	paypaySandboxMerchantIDKey    = "paypay_sandbox_merchant_id"
	paypayProductionAPIKeyKey     = "paypay_production_api_key"
	paypayProductionAPISecretKey  = "paypay_production_api_secret" // nolint:gosec
	paypayProductionMerchantIDKey = "paypay_production_merchant_id"
)

// GetPayPayConfig returns the PayPay configuration.
func GetPayPayConfig() models.PayPayConfig {
	enabled, _ := _datastore.GetBool(paypayEnabledKey)
	apiKey, _ := _datastore.GetString(paypayAPIKeyKey)
	apiSecret, _ := _datastore.GetString(paypayAPISecretKey)
	merchantID, _ := _datastore.GetString(paypayMerchantIDKey)
	isSandbox, _ := _datastore.GetBool(paypaySandboxKey)

	sandboxAPIKey, _ := _datastore.GetString(paypaySandboxAPIKeyKey)
	sandboxAPISecret, _ := _datastore.GetString(paypaySandboxAPISecretKey)
	sandboxMerchantID, _ := _datastore.GetString(paypaySandboxMerchantIDKey)
	productionAPIKey, _ := _datastore.GetString(paypayProductionAPIKeyKey)
	productionAPISecret, _ := _datastore.GetString(paypayProductionAPISecretKey)
	productionMerchantID, _ := _datastore.GetString(paypayProductionMerchantIDKey)

	return models.PayPayConfig{
		Enabled:              enabled,
		IsSandbox:            isSandbox,
		SandboxAPIKey:        sandboxAPIKey,
		SandboxAPISecret:     sandboxAPISecret,
		SandboxMerchantID:    sandboxMerchantID,
		ProductionAPIKey:     productionAPIKey,
		ProductionAPISecret:  productionAPISecret,
		ProductionMerchantID: productionMerchantID,
		APIKey:               apiKey,
		APISecret:            apiSecret,
		MerchantID:           merchantID,
	}
}

// SetPayPayConfig saves the PayPay configuration.
func SetPayPayConfig(config models.PayPayConfig) error {
	if err := _datastore.SetBool(paypayEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayAPIKeyKey, config.APIKey); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayAPISecretKey, config.APISecret); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayMerchantIDKey, config.MerchantID); err != nil {
		return err
	}
	if err := _datastore.SetBool(paypaySandboxKey, config.IsSandbox); err != nil {
		return err
	}
	if err := _datastore.SetString(paypaySandboxAPIKeyKey, config.SandboxAPIKey); err != nil {
		return err
	}
	if err := _datastore.SetString(paypaySandboxAPISecretKey, config.SandboxAPISecret); err != nil {
		return err
	}
	if err := _datastore.SetString(paypaySandboxMerchantIDKey, config.SandboxMerchantID); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayProductionAPIKeyKey, config.ProductionAPIKey); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayProductionAPISecretKey, config.ProductionAPISecret); err != nil {
		return err
	}
	if err := _datastore.SetString(paypayProductionMerchantIDKey, config.ProductionMerchantID); err != nil {
		return err
	}
	return nil
}

// SetPayPayEnabled sets whether PayPay is enabled.
func SetPayPayEnabled(enabled bool) error {
	return _datastore.SetBool(paypayEnabledKey, enabled)
}

// SetPayPayAPIKey sets the PayPay API Key.
func SetPayPayAPIKey(apiKey string) error {
	return _datastore.SetString(paypayAPIKeyKey, apiKey)
}

// SetPayPayAPISecret sets the PayPay API Secret.
func SetPayPayAPISecret(apiSecret string) error {
	return _datastore.SetString(paypayAPISecretKey, apiSecret)
}

// SetPayPayMerchantID sets the PayPay Merchant ID.
func SetPayPayMerchantID(merchantID string) error {
	return _datastore.SetString(paypayMerchantIDKey, merchantID)
}

// SetPayPaySandbox sets whether to use sandbox mode.
func SetPayPaySandbox(isSandbox bool) error {
	return _datastore.SetBool(paypaySandboxKey, isSandbox)
}
