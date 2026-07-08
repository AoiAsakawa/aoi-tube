package models

// TokushohoInfo represents the legally required business disclosure information
// under the Act on Specified Commercial Transactions (Tokushoho disclosure).
type TokushohoInfo struct {
	// Enabled indicates if the tokushoho page is enabled.
	Enabled bool `json:"enabled"`
	// MarkdownContent is the full content in Markdown format.
	MarkdownContent string `json:"markdownContent"`
	// Legacy fields (kept for backward compatibility)
	BusinessName       string `json:"businessName,omitempty"`
	RepresentativeName string `json:"representativeName,omitempty"`
	Address            string `json:"address,omitempty"`
	PhoneNumber        string `json:"phoneNumber,omitempty"`
	Email              string `json:"email,omitempty"`
	PriceDescription   string `json:"priceDescription,omitempty"`
	PaymentMethod      string `json:"paymentMethod,omitempty"`
	PaymentTiming      string `json:"paymentTiming,omitempty"`
	DeliveryTiming     string `json:"deliveryTiming,omitempty"`
	RefundPolicy       string `json:"refundPolicy,omitempty"`
	AdditionalNotes    string `json:"additionalNotes,omitempty"`
}
