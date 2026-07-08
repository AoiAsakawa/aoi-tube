package models

// TokushohoInfo represents an operator-authored legal disclosure page. It
// defaults to Japan's Act on Specified Commercial Transactions (Tokushoho)
// disclosure, but Title lets operators repurpose the page for any
// jurisdiction (e.g. an Impressum or a generic legal notice).
type TokushohoInfo struct {
	// Enabled indicates if the legal disclosure page is enabled.
	Enabled bool `json:"enabled"`
	// Title is an optional custom page title. When empty, clients fall back to
	// the localized "Legal disclosure (Tokushoho)" label.
	Title string `json:"title,omitempty"`
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
