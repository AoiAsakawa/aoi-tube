package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	kofiEnabledKey           = "kofi_enabled"
	kofiVerificationTokenKey = "kofi_verification_token"
	kofiPageURLKey           = "kofi_page_url"
	kofiDisplayNameKey       = "kofi_display_name"
)

// GetKofiConfig returns the Ko-fi configuration.
func GetKofiConfig() models.KofiConfig {
	enabled, _ := _datastore.GetBool(kofiEnabledKey)
	verificationToken, _ := _datastore.GetString(kofiVerificationTokenKey)
	pageURL, _ := _datastore.GetString(kofiPageURLKey)
	displayName, _ := _datastore.GetString(kofiDisplayNameKey)

	return models.KofiConfig{
		Enabled:           enabled,
		VerificationToken: verificationToken,
		PageURL:           pageURL,
		DisplayName:       displayName,
	}
}

// SetKofiConfig saves the Ko-fi configuration.
func SetKofiConfig(config models.KofiConfig) error {
	if err := _datastore.SetBool(kofiEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetString(kofiVerificationTokenKey, config.VerificationToken); err != nil {
		return err
	}
	if err := _datastore.SetString(kofiPageURLKey, config.PageURL); err != nil {
		return err
	}
	if err := _datastore.SetString(kofiDisplayNameKey, config.DisplayName); err != nil {
		return err
	}
	return nil
}

// SetKofiEnabled sets whether Ko-fi is enabled.
func SetKofiEnabled(enabled bool) error {
	return _datastore.SetBool(kofiEnabledKey, enabled)
}

// SetKofiVerificationToken sets the Ko-fi verification token.
func SetKofiVerificationToken(token string) error {
	return _datastore.SetString(kofiVerificationTokenKey, token)
}

// SetKofiPageURL sets the Ko-fi page URL.
func SetKofiPageURL(pageURL string) error {
	return _datastore.SetString(kofiPageURLKey, pageURL)
}

// SetKofiDisplayName sets the Ko-fi display name.
func SetKofiDisplayName(displayName string) error {
	return _datastore.SetString(kofiDisplayNameKey, displayName)
}
