package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/aoiasakawa/aoitube/activitypub"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

type webConfigResponse struct {
	Name                 string                       `json:"name"`
	Summary              string                       `json:"summary"`
	OfflineMessage       string                       `json:"offlineMessage"`
	OfflineMediaURL      string                       `json:"offlineMediaUrl"`
	OfflineMediaType     string                       `json:"offlineMediaType"`
	Logo                 string                       `json:"logo"`
	Tags                 []string                     `json:"tags"`
	Version              string                       `json:"version"`
	NSFW                 bool                         `json:"nsfw"`
	SocketHostOverride   string                       `json:"socketHostOverride,omitempty"`
	ExtraPageContent     string                       `json:"extraPageContent"`
	StreamTitle          string                       `json:"streamTitle,omitempty"` // What's going on with the current stream
	SocialHandles        []models.SocialHandle        `json:"socialHandles"`
	ChatDisabled         bool                         `json:"chatDisabled"`
	ExternalActions      []models.ExternalAction      `json:"externalActions"`
	CustomStyles         string                       `json:"customStyles"`
	AppearanceVariables  map[string]string            `json:"appearanceVariables"`
	MaxSocketPayloadSize int                          `json:"maxSocketPayloadSize"`
	Federation           federationConfigResponse     `json:"federation"`
	Notifications        notificationsConfigResponse  `json:"notifications"`
	Authentication       authenticationConfigResponse `json:"authentication"`
	HideViewerCount      bool                         `json:"hideViewerCount"`
}

type federationConfigResponse struct {
	Enabled       bool   `json:"enabled"`
	Account       string `json:"account,omitempty"`
	FollowerCount int    `json:"followerCount,omitempty"`
}

type browserNotificationsConfigResponse struct {
	Enabled   bool   `json:"enabled"`
	PublicKey string `json:"publicKey,omitempty"`
}

type notificationsConfigResponse struct {
	Browser browserNotificationsConfigResponse `json:"browser"`
}

type authenticationConfigResponse struct {
	IndieAuthEnabled   bool `json:"indieAuthEnabled"`
	TwitterAuthEnabled bool `json:"twitterAuthEnabled"`
	RequireTwitterAuth bool `json:"requireTwitterAuth"`
	DiscordAuthEnabled bool `json:"discordAuthEnabled"`
	XAuthEnabled       bool `json:"xAuthEnabled"`
	GoogleAuthEnabled  bool `json:"googleAuthEnabled"`
	GitHubAuthEnabled  bool `json:"githubAuthEnabled"`
}

// GetWebConfig gets the status of the server.
func GetWebConfig(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	middleware.DisableCache(w)
	w.Header().Set("Content-Type", "application/json")

	configuration := getConfigResponse()

	if err := json.NewEncoder(w).Encode(configuration); err != nil {
		BadRequestHandler(w, err)
	}
}

func getConfigResponse() webConfigResponse {
	pageContent := utils.RenderPageContentMarkdown(data.GetExtraPageBodyContent())
	offlineMessage := utils.RenderSimpleMarkdown(data.GetCustomOfflineMessage())
	offlineMediaPath := data.GetOfflineMediaPath()
	offlineMediaURL := ""
	if offlineMediaPath != "" {
		uniqueness := data.GetOfflineMediaUniquenessString()
		if uniqueness != "" {
			offlineMediaURL = "/offline-media?random=" + uniqueness
		} else {
			offlineMediaURL = "/offline-media"
		}
	}
	socialHandles := data.GetSocialHandles()
	for i, handle := range socialHandles {
		platform := models.GetSocialHandle(handle.Platform)
		if platform != nil {
			handle.Icon = platform.Icon
			socialHandles[i] = handle
		}
	}

	serverSummary := data.GetServerSummary()

	var federationResponse federationConfigResponse
	federationEnabled := data.GetFederationEnabled()

	followerCount, _ := activitypub.GetFollowerCount()
	if federationEnabled {
		serverURLString := data.GetServerURL()
		serverURL, _ := url.Parse(serverURLString)
		account := fmt.Sprintf("%s@%s", data.GetDefaultFederationUsername(), serverURL.Host)
		federationResponse = federationConfigResponse{
			Enabled:       federationEnabled,
			FollowerCount: int(followerCount),
			Account:       account,
		}
	}

	browserPushEnabled := data.GetBrowserPushConfig().Enabled
	browserPushPublicKey, err := data.GetBrowserPushPublicKey()
	if err != nil {
		log.Errorln("unable to fetch browser push notifications public key", err)
		browserPushEnabled = false
	}

	notificationsResponse := notificationsConfigResponse{
		Browser: browserNotificationsConfigResponse{
			Enabled:   browserPushEnabled,
			PublicKey: browserPushPublicKey,
		},
	}

	twitterConfigured := data.GetTwitterConfig().ConsumerKey != ""
	// The client-facing flag must mirror the server-side playback/chat gate
	// (data.GetSocialAuthRequired: the flag plus ANY configured provider).
	// Tying it to the legacy Twitter OAuth 1.0a config left clients unaware
	// that auth was required, so they mounted a player that could only
	// receive denied (non-M3U8) playlist responses.
	requireTwitterAuth := data.GetSocialAuthRequired()

	// Check if Discord auth is configured
	discordAuthConfigured := data.GetDiscordAuthConfig().ClientID != ""

	// Check if X auth (OAuth 2.0) is configured
	xAuthConfigured := data.GetXAuthConfig().ClientID != ""

	// Check if Google auth is configured
	googleAuthConfigured := data.GetGoogleAuthConfig().ClientID != ""

	// Check if GitHub auth is configured
	githubAuthConfigured := data.GetGitHubAuthConfig().ClientID != ""

	authenticationResponse := authenticationConfigResponse{
		IndieAuthEnabled:   data.GetServerURL() != "",
		TwitterAuthEnabled: twitterConfigured,
		RequireTwitterAuth: requireTwitterAuth,
		DiscordAuthEnabled: discordAuthConfigured,
		XAuthEnabled:       xAuthConfigured,
		GoogleAuthEnabled:  googleAuthConfigured,
		GitHubAuthEnabled:  githubAuthConfigured,
	}

	return webConfigResponse{
		Name:                 data.GetServerName(),
		Summary:              serverSummary,
		OfflineMessage:       offlineMessage,
		OfflineMediaURL:      offlineMediaURL,
		OfflineMediaType:     data.GetOfflineMediaType(),
		Logo:                 "/logo",
		Tags:                 data.GetServerMetadataTags(),
		Version:              config.GetReleaseString(),
		NSFW:                 data.GetNSFW(),
		SocketHostOverride:   data.GetWebsocketOverrideHost(),
		ExtraPageContent:     pageContent,
		StreamTitle:          data.GetStreamTitle(),
		SocialHandles:        socialHandles,
		ChatDisabled:         data.GetChatDisabled(),
		ExternalActions:      data.GetExternalActions(),
		CustomStyles:         data.GetCustomStyles(),
		MaxSocketPayloadSize: config.MaxSocketPayloadSize,
		Federation:           federationResponse,
		Notifications:        notificationsResponse,
		Authentication:       authenticationResponse,
		AppearanceVariables:  data.GetCustomColorVariableValues(),
		HideViewerCount:      data.GetHideViewerCount(),
	}
}

// GetAllSocialPlatforms will return a list of all social platform types.
func GetAllSocialPlatforms(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	w.Header().Set("Content-Type", "application/json")

	platforms := models.GetAllSocialHandles()
	if err := json.NewEncoder(w).Encode(platforms); err != nil {
		InternalErrorHandler(w, err)
	}
}
