package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// SetDiscordNotificationConfiguration will set the discord notification configuration.
func SetDiscordNotificationConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.DiscordConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update discord config with provided values")
		return
	}

	if err := data.SetDiscordConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update discord config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated discord config with provided values")
}

// SetBrowserNotificationConfiguration will set the browser notification configuration.
func SetBrowserNotificationConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.BrowserNotificationConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update browser push config with provided values")
		return
	}

	if err := data.SetBrowserPushConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update browser push config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated browser push config with provided values")
}

// SetTwitterNotificationConfiguration will set the twitter notification configuration.
func SetTwitterNotificationConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.TwitterConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update twitter config with provided values")
		return
	}

	if err := data.SetTwitterConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update twitter config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated twitter config with provided values")
}

// SetDiscordAuthConfiguration will set the discord auth configuration.
func SetDiscordAuthConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.DiscordAuthConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update discord auth config with provided values")
		return
	}

	// A masked secret means "keep the existing one" — preserve it so saving
	// after a GET (which masks the secret) doesn't wipe the stored value.
	if config.Value.ClientSecret == maskedSecretValue {
		config.Value.ClientSecret = data.GetDiscordAuthConfig().ClientSecret
	}

	if err := data.SetDiscordAuthConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update discord auth config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated discord auth config with provided values")
}

// SetXAuthConfiguration will set the X auth configuration.
func SetXAuthConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.XAuthConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update X auth config with provided values")
		return
	}

	// A masked secret means "keep the existing one" — preserve it so saving
	// after a GET (which masks the secret) doesn't wipe the stored value.
	if config.Value.ClientSecret == maskedSecretValue {
		config.Value.ClientSecret = data.GetXAuthConfig().ClientSecret
	}

	if err := data.SetXAuthConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update X auth config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated X auth config with provided values")
}

// SetGoogleAuthConfiguration will set the Google auth configuration.
func SetGoogleAuthConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.GoogleAuthConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update Google auth config with provided values")
		return
	}

	// A masked secret means "keep the existing one" — preserve it so saving
	// after a GET (which masks the secret) doesn't wipe the stored value.
	if config.Value.ClientSecret == maskedSecretValue {
		config.Value.ClientSecret = data.GetGoogleAuthConfig().ClientSecret
	}

	if err := data.SetGoogleAuthConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update Google auth config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated Google auth config with provided values")
}

// SetGitHubAuthConfiguration will set the GitHub auth configuration.
func SetGitHubAuthConfiguration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type request struct {
		Value models.GitHubAuthConfiguration `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var config request
	if err := decoder.Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update GitHub auth config with provided values")
		return
	}

	// A masked secret means "keep the existing one" — preserve it so saving
	// after a GET (which masks the secret) doesn't wipe the stored value.
	if config.Value.ClientSecret == maskedSecretValue {
		config.Value.ClientSecret = data.GetGitHubAuthConfig().ClientSecret
	}

	if err := data.SetGitHubAuthConfig(config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update GitHub auth config with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "updated GitHub auth config with provided values")
}
