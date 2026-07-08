package models

// DoneruConfig holds the Doneru configuration.
type DoneruConfig struct {
	// Enabled indicates if Doneru donations are enabled.
	Enabled bool `json:"enabled"`
	// CreatorURL is the Doneru creator page URL (e.g., https://doneru.jp/username).
	CreatorURL string `json:"creatorUrl"`
	// DisplayName is the name to show on the donation button.
	DisplayName string `json:"displayName,omitempty"`
}
