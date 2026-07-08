package models

// PayPalConfig holds the PayPal API configuration.
type PayPalConfig struct {
	// Enabled indicates if PayPal payments are enabled.
	Enabled bool `json:"enabled"`
	// IsSandbox indicates if using sandbox/test environment.
	IsSandbox bool `json:"isSandbox"`
	// CurrencyCode is the currency code (e.g., USD, EUR, JPY).
	CurrencyCode string `json:"currencyCode"`
	// MerchantID is the PayPal merchant ID (optional).
	MerchantID string `json:"merchantId,omitempty"`

	// Sandbox credentials
	// SandboxClientID is the PayPal sandbox application client ID.
	SandboxClientID string `json:"sandboxClientId"`
	// SandboxClientSecret is the PayPal sandbox application client secret.
	SandboxClientSecret string `json:"sandboxClientSecret"`

	// Production credentials
	// ProductionClientID is the PayPal production application client ID.
	ProductionClientID string `json:"productionClientId"`
	// ProductionClientSecret is the PayPal production application client secret.
	ProductionClientSecret string `json:"productionClientSecret"`

	// Legacy fields for backward compatibility (deprecated, use Sandbox/Production fields)
	// ClientID is deprecated, use SandboxClientID or ProductionClientID instead.
	ClientID string `json:"clientId,omitempty"`
	// ClientSecret is deprecated, use SandboxClientSecret or ProductionClientSecret instead.
	ClientSecret string `json:"clientSecret,omitempty"`
}

// GetActiveClientID returns the client ID for the current environment (sandbox or production).
func (c PayPalConfig) GetActiveClientID() string {
	if c.IsSandbox {
		if c.SandboxClientID != "" {
			return c.SandboxClientID
		}
		return c.ClientID // Fallback to legacy field
	}
	if c.ProductionClientID != "" {
		return c.ProductionClientID
	}
	return c.ClientID // Fallback to legacy field
}

// GetActiveClientSecret returns the client secret for the current environment (sandbox or production).
func (c PayPalConfig) GetActiveClientSecret() string {
	if c.IsSandbox {
		if c.SandboxClientSecret != "" {
			return c.SandboxClientSecret
		}
		return c.ClientSecret // Fallback to legacy field
	}
	if c.ProductionClientSecret != "" {
		return c.ProductionClientSecret
	}
	return c.ClientSecret // Fallback to legacy field
}

// PayPalPaymentRequest represents a request to create a PayPal payment.
type PayPalPaymentRequest struct {
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

// PayPalPaymentResponse represents a response from PayPal.
type PayPalPaymentResponse struct {
	// Success indicates if the request was successful.
	Success bool `json:"success"`
	// OrderID is the PayPal order ID.
	OrderID string `json:"orderId,omitempty"`
	// ApprovalURL is the URL to redirect user for payment approval.
	ApprovalURL string `json:"approvalUrl,omitempty"`
	// ErrorMessage is the error message if failed.
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// PayPalWebhookPayload represents an incoming PayPal webhook event.
type PayPalWebhookPayload struct {
	// ID is the webhook event ID.
	ID string `json:"id"`
	// EventType is the type of event (e.g., CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED).
	EventType string `json:"event_type"`
	// Resource contains the event resource data.
	Resource PayPalWebhookResource `json:"resource"`
	// CreateTime is when the event was created.
	CreateTime string `json:"create_time"`
}

// PayPalWebhookResource represents the resource in a PayPal webhook.
type PayPalWebhookResource struct {
	// ID is the resource ID (order ID or capture ID).
	ID string `json:"id"`
	// Status is the resource status.
	Status string `json:"status"`
	// Amount contains the payment amount details.
	Amount *PayPalAmount `json:"amount,omitempty"`
	// PurchaseUnits contains purchase unit details (for orders).
	PurchaseUnits []PayPalPurchaseUnit `json:"purchase_units,omitempty"`
	// CustomID is the custom ID passed during order creation.
	CustomID string `json:"custom_id,omitempty"`
}

// PayPalAmount represents an amount in PayPal.
type PayPalAmount struct {
	// CurrencyCode is the currency code.
	CurrencyCode string `json:"currency_code"`
	// Value is the amount value as string.
	Value string `json:"value"`
}

// PayPalPurchaseUnit represents a purchase unit in PayPal order.
type PayPalPurchaseUnit struct {
	// ReferenceID is the reference ID.
	ReferenceID string `json:"reference_id,omitempty"`
	// Amount is the purchase amount.
	Amount PayPalAmount `json:"amount"`
	// CustomID is the custom ID.
	CustomID string `json:"custom_id,omitempty"`
	// Description is the item description.
	Description string `json:"description,omitempty"`
}

// PayPal supported currencies
var PayPalSupportedCurrencies = []string{
	"USD", // US Dollar
	"EUR", // Euro
	"GBP", // British Pound
	"CAD", // Canadian Dollar
	"AUD", // Australian Dollar
	"JPY", // Japanese Yen
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
}
