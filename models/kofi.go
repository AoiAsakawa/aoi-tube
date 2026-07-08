package models

import "time"

// KofiConfig holds the Ko-fi integration configuration.
type KofiConfig struct {
	// Enabled indicates if Ko-fi donations are enabled.
	Enabled bool `json:"enabled"`
	// VerificationToken is the secret token from Ko-fi webhook settings.
	// Used to verify incoming webhook requests.
	VerificationToken string `json:"verificationToken,omitempty"`
	// PageURL is the Ko-fi page URL (e.g., https://ko-fi.com/username).
	PageURL string `json:"pageUrl,omitempty"`
	// DisplayName is the name to show on the donation button.
	DisplayName string `json:"displayName,omitempty"`
}

// KofiWebhookPayload represents the webhook payload sent by Ko-fi.
// Documentation: https://ko-fi.com/manage/webhooks
type KofiWebhookPayload struct {
	// VerificationToken is used to verify the webhook is from Ko-fi.
	VerificationToken string `json:"verification_token"`
	// MessageID is the unique identifier for this webhook message.
	MessageID string `json:"message_id"`
	// Timestamp is when the transaction occurred.
	Timestamp time.Time `json:"timestamp"`
	// Type is the type of transaction: Donation, Subscription, Commission, Shop Order.
	Type string `json:"type"`
	// IsPublic indicates if the supporter chose to be public.
	IsPublic bool `json:"is_public"`
	// FromName is the name of the supporter.
	FromName string `json:"from_name"`
	// Message is the optional message from the supporter.
	Message string `json:"message"`
	// Amount is the amount as a string (e.g., "3.00").
	Amount string `json:"amount"`
	// URL is the Ko-fi URL related to this transaction.
	URL string `json:"url"`
	// Email is the supporter's email (if available).
	Email string `json:"email"`
	// Currency is the currency code (e.g., "USD", "EUR", "GBP").
	Currency string `json:"currency"`
	// IsSubscriptionPayment indicates if this is a subscription payment.
	IsSubscriptionPayment bool `json:"is_subscription_payment"`
	// IsFirstSubscriptionPayment indicates if this is the first subscription payment.
	IsFirstSubscriptionPayment bool `json:"is_first_subscription_payment"`
	// KofiTransactionID is Ko-fi's unique transaction identifier.
	KofiTransactionID string `json:"kofi_transaction_id"`
	// ShopItems contains shop item details if this is a shop order.
	ShopItems []KofiShopItem `json:"shop_items,omitempty"`
	// TierName is the name of the membership tier (for subscriptions).
	TierName string `json:"tier_name,omitempty"`
}

// KofiShopItem represents an item in a Ko-fi shop order.
type KofiShopItem struct {
	// DirectLinkCode is the code for the item.
	DirectLinkCode string `json:"direct_link_code"`
	// VariationName is the variation of the item if applicable.
	VariationName string `json:"variation_name,omitempty"`
	// Quantity is the number of items ordered.
	Quantity int `json:"quantity"`
}
