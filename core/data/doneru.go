package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	doneruEnabledKey     = "doneru_enabled"
	doneruCreatorURLKey  = "doneru_creator_url"
	doneruDisplayNameKey = "doneru_display_name"
)

// GetDoneruConfig returns the Doneru configuration.
func GetDoneruConfig() models.DoneruConfig {
	enabled, _ := _datastore.GetBool(doneruEnabledKey)
	creatorURL, _ := _datastore.GetString(doneruCreatorURLKey)
	displayName, _ := _datastore.GetString(doneruDisplayNameKey)

	return models.DoneruConfig{
		Enabled:     enabled,
		CreatorURL:  creatorURL,
		DisplayName: displayName,
	}
}

// SetDoneruConfig saves the Doneru configuration.
func SetDoneruConfig(config models.DoneruConfig) error {
	if err := _datastore.SetBool(doneruEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetString(doneruCreatorURLKey, config.CreatorURL); err != nil {
		return err
	}
	if err := _datastore.SetString(doneruDisplayNameKey, config.DisplayName); err != nil {
		return err
	}
	return nil
}

// SetDoneruEnabled sets whether Doneru is enabled.
func SetDoneruEnabled(enabled bool) error {
	return _datastore.SetBool(doneruEnabledKey, enabled)
}

// SetDoneruCreatorURL sets the Doneru creator URL.
func SetDoneruCreatorURL(creatorURL string) error {
	return _datastore.SetString(doneruCreatorURLKey, creatorURL)
}

// SetDoneruDisplayName sets the Doneru display name.
func SetDoneruDisplayName(displayName string) error {
	return _datastore.SetString(doneruDisplayNameKey, displayName)
}
