package models

// StripeConfig holds the Stripe API configuration.
type StripeConfig struct {
	// Enabled indicates if Stripe payments are enabled.
	Enabled bool `json:"enabled"`
	// IsTestMode indicates if using test/sandbox environment.
	IsTestMode bool `json:"isTestMode"`
	// CurrencyCode is the currency code (e.g., USD, EUR, JPY).
	CurrencyCode string `json:"currencyCode"`

	// Test credentials
	// TestPublishableKey is the Stripe test publishable key.
	TestPublishableKey string `json:"testPublishableKey"`
	// TestSecretKey is the Stripe test secret key.
	TestSecretKey string `json:"testSecretKey"`
	// TestWebhookSecret is the Stripe test webhook signing secret.
	TestWebhookSecret string `json:"testWebhookSecret"`

	// Production credentials
	// LivePublishableKey is the Stripe live publishable key.
	LivePublishableKey string `json:"livePublishableKey"`
	// LiveSecretKey is the Stripe live secret key.
	LiveSecretKey string `json:"liveSecretKey"`
	// LiveWebhookSecret is the Stripe live webhook signing secret.
	LiveWebhookSecret string `json:"liveWebhookSecret"`
}

// GetActivePublishableKey returns the publishable key for the current environment.
func (c StripeConfig) GetActivePublishableKey() string {
	if c.IsTestMode {
		return c.TestPublishableKey
	}
	return c.LivePublishableKey
}

// GetActiveSecretKey returns the secret key for the current environment.
func (c StripeConfig) GetActiveSecretKey() string {
	if c.IsTestMode {
		return c.TestSecretKey
	}
	return c.LiveSecretKey
}

// GetActiveWebhookSecret returns the webhook secret for the current environment.
func (c StripeConfig) GetActiveWebhookSecret() string {
	if c.IsTestMode {
		return c.TestWebhookSecret
	}
	return c.LiveWebhookSecret
}

// StripePaymentRequest represents a request to create a Stripe payment.
type StripePaymentRequest struct {
	// Amount is the payment amount.
	Amount float64 `json:"amount"`
	// Currency is the currency code (USD, EUR, JPY, etc.).
	Currency string `json:"currency"`
	// Description is the payment description.
	Description string `json:"description,omitempty"`
	// DisplayName is the donor's display name.
	DisplayName string `json:"displayName,omitempty"`
	// Message is the donation message.
	Message string `json:"message,omitempty"`
	// IsAnonymous indicates if the donation is anonymous.
	IsAnonymous bool `json:"isAnonymous,omitempty"`
}

// StripePaymentResponse represents a response from Stripe payment creation.
type StripePaymentResponse struct {
	// Success indicates if the request was successful.
	Success bool `json:"success"`
	// SessionID is the Stripe Checkout Session ID.
	SessionID string `json:"sessionId,omitempty"`
	// URL is the URL to redirect user for payment.
	URL string `json:"url,omitempty"`
	// ErrorMessage is the error message if failed.
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// StripeWebhookEvent represents an incoming Stripe webhook event.
type StripeWebhookEvent struct {
	// ID is the webhook event ID.
	ID string `json:"id"`
	// Type is the type of event (e.g., checkout.session.completed).
	Type string `json:"type"`
	// Data contains the event data.
	Data StripeWebhookData `json:"data"`
	// Created is the timestamp when the event was created.
	Created int64 `json:"created"`
}

// StripeWebhookData represents the data in a Stripe webhook event.
type StripeWebhookData struct {
	// Object contains the event object data.
	Object StripeCheckoutSession `json:"object"`
}

// StripeCheckoutSession represents a Stripe Checkout Session.
type StripeCheckoutSession struct {
	// ID is the session ID.
	ID string `json:"id"`
	// PaymentIntent is the payment intent ID.
	PaymentIntent string `json:"payment_intent"`
	// PaymentStatus is the payment status.
	PaymentStatus string `json:"payment_status"`
	// Status is the session status.
	Status string `json:"status"`
	// AmountTotal is the total amount in smallest currency unit.
	AmountTotal int64 `json:"amount_total"`
	// Currency is the currency code.
	Currency string `json:"currency"`
	// Metadata contains custom metadata.
	Metadata map[string]string `json:"metadata"`
	// CustomerDetails contains customer information.
	CustomerDetails *StripeCustomerDetails `json:"customer_details"`
}

// StripeCustomerDetails contains customer information from Stripe.
type StripeCustomerDetails struct {
	// Email is the customer's email.
	Email string `json:"email"`
	// Name is the customer's name.
	Name string `json:"name"`
}

// Stripe supported currencies
var StripeSupportedCurrencies = []string{
	"USD", // US Dollar
	"EUR", // Euro
	"GBP", // British Pound
	"CAD", // Canadian Dollar
	"AUD", // Australian Dollar
	"JPY", // Japanese Yen
	"CHF", // Swiss Franc
	"CNY", // Chinese Yuan
	"HKD", // Hong Kong Dollar
	"SGD", // Singapore Dollar
	"TWD", // Taiwan Dollar
	"KRW", // Korean Won
	"THB", // Thai Baht
	"PHP", // Philippine Peso
	"MYR", // Malaysian Ringgit
	"INR", // Indian Rupee
	"BRL", // Brazilian Real
	"MXN", // Mexican Peso
	"SEK", // Swedish Krona
	"NOK", // Norwegian Krone
	"DKK", // Danish Krone
	"PLN", // Polish Zloty
	"CZK", // Czech Koruna
	"NZD", // New Zealand Dollar
}
