package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	faqEnabledKey         = "faq_enabled"
	faqMarkdownContentKey = "faq_markdown_content"
)

// GetFAQConfig returns the FAQ configuration.
func GetFAQConfig() models.FAQConfig {
	enabled, _ := _datastore.GetBool(faqEnabledKey)
	markdownContent, _ := _datastore.GetString(faqMarkdownContentKey)

	return models.FAQConfig{
		Enabled:         enabled,
		MarkdownContent: markdownContent,
	}
}

// SetFAQConfig sets the FAQ configuration.
func SetFAQConfig(config models.FAQConfig) error {
	if err := _datastore.SetBool(faqEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetString(faqMarkdownContentKey, config.MarkdownContent); err != nil {
		return err
	}
	return nil
}
