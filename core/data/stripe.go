package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	stripeEnabledKey  = "stripe_enabled"
	stripeTestModeKey = "stripe_is_test_mode"
	stripeCurrencyKey = "stripe_currency_code"

	// Test credentials
	stripeTestPublishableKeyKey = "stripe_test_publishable_key"
	stripeTestSecretKeyKey      = "stripe_test_secret_key"
	stripeTestWebhookSecretKey  = "stripe_test_webhook_secret"

	// Live credentials
	stripeLivePublishableKeyKey = "stripe_live_publishable_key"
	stripeLiveSecretKeyKey      = "stripe_live_secret_key"
	stripeLiveWebhookSecretKey  = "stripe_live_webhook_secret"
)

// GetStripeConfig returns the Stripe configuration.
func GetStripeConfig() models.StripeConfig {
	enabled, _ := _datastore.GetBool(stripeEnabledKey)
	isTestMode, _ := _datastore.GetBool(stripeTestModeKey)
	currencyCode, _ := _datastore.GetString(stripeCurrencyKey)

	// Get test credentials
	testPublishableKey, _ := _datastore.GetString(stripeTestPublishableKeyKey)
	testSecretKey, _ := _datastore.GetString(stripeTestSecretKeyKey)
	testWebhookSecret, _ := _datastore.GetString(stripeTestWebhookSecretKey)

	// Get live credentials
	livePublishableKey, _ := _datastore.GetString(stripeLivePublishableKeyKey)
	liveSecretKey, _ := _datastore.GetString(stripeLiveSecretKeyKey)
	liveWebhookSecret, _ := _datastore.GetString(stripeLiveWebhookSecretKey)

	// Default to JPY if not set
	if currencyCode == "" {
		currencyCode = "JPY"
	}

	// Default to test mode
	if !enabled {
		isTestMode = true
	}

	return models.StripeConfig{
		Enabled:            enabled,
		IsTestMode:         isTestMode,
		CurrencyCode:       currencyCode,
		TestPublishableKey: testPublishableKey,
		TestSecretKey:      testSecretKey,
		TestWebhookSecret:  testWebhookSecret,
		LivePublishableKey: livePublishableKey,
		LiveSecretKey:      liveSecretKey,
		LiveWebhookSecret:  liveWebhookSecret,
	}
}

// SetStripeConfig saves the Stripe configuration.
func SetStripeConfig(config models.StripeConfig) error {
	if err := _datastore.SetBool(stripeEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetBool(stripeTestModeKey, config.IsTestMode); err != nil {
		return err
	}
	if err := _datastore.SetString(stripeCurrencyKey, config.CurrencyCode); err != nil {
		return err
	}

	// Save test credentials
	if err := _datastore.SetString(stripeTestPublishableKeyKey, config.TestPublishableKey); err != nil {
		return err
	}
	if err := _datastore.SetString(stripeTestSecretKeyKey, config.TestSecretKey); err != nil {
		return err
	}
	if err := _datastore.SetString(stripeTestWebhookSecretKey, config.TestWebhookSecret); err != nil {
		return err
	}

	// Save live credentials
	if err := _datastore.SetString(stripeLivePublishableKeyKey, config.LivePublishableKey); err != nil {
		return err
	}
	if err := _datastore.SetString(stripeLiveSecretKeyKey, config.LiveSecretKey); err != nil {
		return err
	}
	if err := _datastore.SetString(stripeLiveWebhookSecretKey, config.LiveWebhookSecret); err != nil {
		return err
	}

	return nil
}

// SetStripeEnabled sets whether Stripe is enabled.
func SetStripeEnabled(enabled bool) error {
	return _datastore.SetBool(stripeEnabledKey, enabled)
}

// SetStripeTestMode sets whether to use test mode.
func SetStripeTestMode(isTestMode bool) error {
	return _datastore.SetBool(stripeTestModeKey, isTestMode)
}

// SetStripeCurrencyCode sets the Stripe currency code.
func SetStripeCurrencyCode(currencyCode string) error {
	return _datastore.SetString(stripeCurrencyKey, currencyCode)
}

// SetStripeTestPublishableKey sets the Stripe test publishable key.
func SetStripeTestPublishableKey(key string) error {
	return _datastore.SetString(stripeTestPublishableKeyKey, key)
}

// SetStripeTestSecretKey sets the Stripe test secret key.
func SetStripeTestSecretKey(key string) error {
	return _datastore.SetString(stripeTestSecretKeyKey, key)
}

// SetStripeTestWebhookSecret sets the Stripe test webhook secret.
func SetStripeTestWebhookSecret(secret string) error {
	return _datastore.SetString(stripeTestWebhookSecretKey, secret)
}

// SetStripeLivePublishableKey sets the Stripe live publishable key.
func SetStripeLivePublishableKey(key string) error {
	return _datastore.SetString(stripeLivePublishableKeyKey, key)
}

// SetStripeLiveSecretKey sets the Stripe live secret key.
func SetStripeLiveSecretKey(key string) error {
	return _datastore.SetString(stripeLiveSecretKeyKey, key)
}

// SetStripeLiveWebhookSecret sets the Stripe live webhook secret.
func SetStripeLiveWebhookSecret(secret string) error {
	return _datastore.SetString(stripeLiveWebhookSecretKey, secret)
}
