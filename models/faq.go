package models

// FAQConfig represents the FAQ configuration.
type FAQConfig struct {
	Enabled         bool   `json:"enabled"`
	MarkdownContent string `json:"markdownContent"`
}
