package models

// DiscordConfiguration represents the configuration for the discord
// notification service.
type DiscordConfiguration struct {
	Enabled       bool   `json:"enabled"`
	Webhook       string `json:"webhook,omitempty"`
	GoLiveMessage string `json:"goLiveMessage,omitempty"`
}

// DiscordAuthConfiguration represents the configuration for Discord OAuth2 authentication.
type DiscordAuthConfiguration struct {
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

// XAuthConfiguration represents the configuration for X (Twitter) OAuth2 authentication.
type XAuthConfiguration struct {
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

// GoogleAuthConfiguration represents the configuration for Google OAuth2 authentication.
type GoogleAuthConfiguration struct {
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

// GitHubAuthConfiguration represents the configuration for GitHub OAuth2 authentication.
type GitHubAuthConfiguration struct {
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

// BrowserNotificationConfiguration represents the configuration for
// browser notifications.
type BrowserNotificationConfiguration struct {
	Enabled       bool   `json:"enabled"`
	GoLiveMessage string `json:"goLiveMessage,omitempty"`
}

// TwitterConfiguration represents the configuration for the Twitter/X
// notification service.
type TwitterConfiguration struct {
	Enabled           bool   `json:"enabled"`
	ConsumerKey       string `json:"consumerKey,omitempty"`
	ConsumerSecret    string `json:"consumerSecret,omitempty"`
	AccessToken       string `json:"accessToken,omitempty"`
	AccessTokenSecret string `json:"accessTokenSecret,omitempty"`
	GoLiveMessage     string `json:"goLiveMessage,omitempty"`
	Hashtags          string `json:"hashtags,omitempty"`
	IncludeTitle      bool   `json:"includeTitle"`
	IncludeServerName bool   `json:"includeServerName"`
}
