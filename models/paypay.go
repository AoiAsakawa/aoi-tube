package models

// PayPayConfig holds the PayPay API configuration.
type PayPayConfig struct {
	// Enabled indicates if PayPay payments are enabled.
	Enabled bool `json:"enabled"`
	// IsSandbox indicates if using sandbox environment.
	IsSandbox bool `json:"isSandbox"`

	// Sandbox credentials
	// SandboxAPIKey is the PayPay sandbox API Key.
	SandboxAPIKey string `json:"sandboxApiKey"`
	// SandboxAPISecret is the PayPay sandbox API Secret.
	SandboxAPISecret string `json:"sandboxApiSecret"`
	// SandboxMerchantID is the PayPay sandbox Merchant ID.
	SandboxMerchantID string `json:"sandboxMerchantId"`

	// Production credentials
	// ProductionAPIKey is the PayPay production API Key.
	ProductionAPIKey string `json:"productionApiKey"`
	// ProductionAPISecret is the PayPay production API Secret.
	ProductionAPISecret string `json:"productionApiSecret"`
	// ProductionMerchantID is the PayPay production Merchant ID.
	ProductionMerchantID string `json:"productionMerchantId"`

	// Legacy fields for backward compatibility (deprecated, use Sandbox/Production fields)
	// APIKey is deprecated, use SandboxAPIKey or ProductionAPIKey instead.
	APIKey string `json:"apiKey,omitempty"`
	// APISecret is deprecated, use SandboxAPISecret or ProductionAPISecret instead.
	APISecret string `json:"apiSecret,omitempty"`
	// MerchantID is deprecated, use SandboxMerchantID or ProductionMerchantID instead.
	MerchantID string `json:"merchantId,omitempty"`
}

// GetActiveAPIKey returns the API key for the current environment (sandbox or production).
func (c PayPayConfig) GetActiveAPIKey() string {
	if c.IsSandbox {
		if c.SandboxAPIKey != "" {
			return c.SandboxAPIKey
		}
		return c.APIKey // Fallback to legacy field
	}
	if c.ProductionAPIKey != "" {
		return c.ProductionAPIKey
	}
	return c.APIKey // Fallback to legacy field
}

// GetActiveAPISecret returns the API secret for the current environment (sandbox or production).
func (c PayPayConfig) GetActiveAPISecret() string {
	if c.IsSandbox {
		if c.SandboxAPISecret != "" {
			return c.SandboxAPISecret
		}
		return c.APISecret // Fallback to legacy field
	}
	if c.ProductionAPISecret != "" {
		return c.ProductionAPISecret
	}
	return c.APISecret // Fallback to legacy field
}

// GetActiveMerchantID returns the merchant ID for the current environment (sandbox or production).
func (c PayPayConfig) GetActiveMerchantID() string {
	if c.IsSandbox {
		if c.SandboxMerchantID != "" {
			return c.SandboxMerchantID
		}
		return c.MerchantID // Fallback to legacy field
	}
	if c.ProductionMerchantID != "" {
		return c.ProductionMerchantID
	}
	return c.MerchantID // Fallback to legacy field
}

// PayPayPaymentRequest represents a request to create a PayPay payment.
type PayPayPaymentRequest struct {
	// Amount is the payment amount in JPY.
	Amount int64 `json:"amount"`
	// OrderID is a unique order identifier.
	OrderID string `json:"orderId"`
	// Description is the payment description.
	Description string `json:"description,omitempty"`
	// RedirectURL is where to redirect after payment.
	RedirectURL string `json:"redirectUrl,omitempty"`
}

// PayPayPaymentResponse represents a response from PayPay API.
type PayPayPaymentResponse struct {
	// Success indicates if the request was successful.
	Success bool `json:"success"`
	// PaymentURL is the URL to redirect user for payment.
	PaymentURL string `json:"paymentUrl,omitempty"`
	// PaymentID is the PayPay payment identifier.
	PaymentID string `json:"paymentId,omitempty"`
	// QRCodeURL is the QR code image URL.
	QRCodeURL string `json:"qrCodeUrl,omitempty"`
	// ErrorCode is the error code if failed.
	ErrorCode string `json:"errorCode,omitempty"`
	// ErrorMessage is the error message if failed.
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// PayPayWebhookPayload represents an incoming PayPay webhook.
type PayPayWebhookPayload struct {
	// NotificationType is the type of notification.
	NotificationType string `json:"notification_type"`
	// MerchantPaymentID is the merchant's payment ID.
	MerchantPaymentID string `json:"merchant_payment_id"`
	// PaymentID is PayPay's payment ID.
	PaymentID string `json:"payment_id"`
	// State is the payment state.
	State string `json:"state"`
	// Amount is the payment amount.
	Amount struct {
		Amount   int32  `json:"amount"`
		Currency string `json:"currency"`
	} `json:"amount"`
}
