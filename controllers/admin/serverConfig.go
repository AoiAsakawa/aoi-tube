package admin

import (
	"encoding/json"
	"net/http"
	"path/filepath"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/transcoder"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// GetServerConfig gets the config details of the server.
func GetServerConfig(w http.ResponseWriter, r *http.Request) {
	ffmpeg := utils.ValidatedFfmpegPath(data.GetFfMpegPath())
	usernameBlocklist := data.GetForbiddenUsernameList()
	usernameSuggestions := data.GetSuggestedUsernamesList()

	videoQualityVariants := make([]models.StreamOutputVariant, 0)
	for _, variant := range data.GetStreamOutputVariants() {
		videoQualityVariants = append(videoQualityVariants, models.StreamOutputVariant{
			Name:               variant.GetName(),
			IsAudioPassthrough: variant.GetIsAudioPassthrough(),
			IsVideoPassthrough: variant.IsVideoPassthrough,
			Framerate:          variant.GetFramerate(),
			VideoBitrate:       variant.VideoBitrate,
			AudioBitrate:       variant.AudioBitrate,
			CPUUsageLevel:      variant.CPUUsageLevel,
			ScaledWidth:        variant.ScaledWidth,
			ScaledHeight:       variant.ScaledHeight,
		})
	}
	response := serverConfigAdminResponse{
		InstanceDetails: webConfigResponse{
			Name:                      data.GetServerName(),
			Summary:                   data.GetServerSummary(),
			Tags:                      data.GetServerMetadataTags(),
			ExtraPageContent:          data.GetExtraPageBodyContent(),
			StreamTitle:               data.GetStreamTitle(),
			WelcomeMessage:            data.GetServerWelcomeMessage(),
			OfflineMessage:            data.GetCustomOfflineMessage(),
			OfflineMediaPath:          data.GetOfflineMediaPath(),
			OfflineMediaType:          data.GetOfflineMediaType(),
			HasCustomOfflineClip:      utils.DoesFileExists(filepath.Join(config.DataDirectory, "offline.tsclip")),
			HasCustomLivePoster:       data.GetLivePosterPath() != "",
			NotificationThumbnailPath: data.GetNotificationThumbnailPath(),
			Logo:                      data.GetLogoPath(),
			SocialHandles:             data.GetSocialHandles(),
			NSFW:                      data.GetNSFW(),
			CustomStyles:              data.GetCustomStyles(),
			CustomJavascript:          data.GetCustomJavascript(),
			AppearanceVariables:       data.GetCustomColorVariableValues(),
		},
		FFmpegPath: ffmpeg,
		// Note: AdminPassword is not included in response for security reasons
		StreamKeys:          data.GetStreamKeys(),
		StreamKeyOverridden: config.TemporaryStreamKey != "",
		WebServerPort:       config.WebServerPort,
		WebServerIP:         config.WebServerIP,
		RTMPServerPort:      data.GetRTMPPortNumber(),
		RTMPS: rtmpsConfigResponse{
			Enabled:  data.GetRTMPSEnabled(),
			Port:     data.GetRTMPSPortNumber(),
			CertPath: data.GetRTMPSCertPath(),
			KeyPath:  data.GetRTMPSKeyPath(),
		},
		ChatDisabled:              data.GetChatDisabled(),
		SilentStreamMode:          data.GetSilentStreamMode(),
		RecordingEnabled:          data.GetRecordingEnabled(),
		RecordingStoreOnS3:        data.GetRecordingStoreOnS3(),
		BackupEnabled:             data.GetBackupEnabled(),
		BackupIntervalHours:       data.GetBackupIntervalHours(),
		BackupRetentionCount:      data.GetBackupRetentionCount(),
		BackupStoreOnS3:           data.GetBackupStoreOnS3(),
		RecordingRetentionCount:   data.GetRecordingRetentionCount(),
		ChatJoinMessagesEnabled:   data.GetChatJoinMessagesEnabled(),
		SocketHostOverride:        data.GetWebsocketOverrideHost(),
		ChatEstablishedUserMode:   data.GetChatEstbalishedUsersOnlyMode(),
		ChatSpamProtectionEnabled: data.GetChatSpamProtectionEnabled(),
		ChatSlurFilterEnabled:     data.GetChatSlurFilterEnabled(),
		RequireTwitterAuth:        data.GetRequireTwitterAuth(),
		DiscordAuth:               maskOAuthSecret(data.GetDiscordAuthConfig()),
		XAuth:                     maskOAuthSecret(data.GetXAuthConfig()),
		GoogleAuth:                maskOAuthSecret(data.GetGoogleAuthConfig()),
		GitHubAuth:                maskOAuthSecret(data.GetGitHubAuthConfig()),
		HideViewerCount:           data.GetHideViewerCount(),
		VideoSettings: videoSettings{
			VideoQualityVariants: videoQualityVariants,
			LatencyLevel:         data.GetStreamLatencyLevel().Level,
		},
		YP: yp{
			Enabled:     data.GetDirectoryEnabled(),
			InstanceURL: data.GetServerURL(),
		},
		S3:                 data.GetS3Config(),
		ExternalActions:    data.GetExternalActions(),
		SupportedCodecs:    transcoder.GetCodecs(ffmpeg),
		VideoCodec:         data.GetVideoCodec(),
		ForbiddenUsernames: usernameBlocklist,
		SuggestedUsernames: usernameSuggestions,
		Federation: federationConfigResponse{
			Enabled:        data.GetFederationEnabled(),
			IsPrivate:      data.GetFederationIsPrivate(),
			Username:       data.GetFederationUsername(),
			GoLiveMessage:  data.GetFederationGoLiveMessage(),
			ShowEngagement: data.GetFederationShowEngagement(),
			BlockedDomains: data.GetBlockedFederatedDomains(),
		},
		Notifications: notificationsConfigResponse{
			Discord: data.GetDiscordConfig(),
			Browser: data.GetBrowserPushConfig(),
			Twitter: data.GetTwitterConfig(),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Errorln(err)
	}
}

// maskedSecretValue is returned in place of a stored secret on admin GETs;
// the matching SET handlers treat this value as "keep the existing secret".
const maskedSecretValue = "********"

// maskOAuthSecret blanks the client secret of an OAuth config for the admin
// GET response so secrets aren't shipped to the browser on every config load.
// The four OAuth config structs are distinct types with identical fields, so
// a small type switch keeps this generic without reflection.
func maskOAuthSecret[T models.DiscordAuthConfiguration | models.XAuthConfiguration | models.GoogleAuthConfiguration | models.GitHubAuthConfiguration](cfg T) T {
	switch c := any(cfg).(type) {
	case models.DiscordAuthConfiguration:
		if c.ClientSecret != "" {
			c.ClientSecret = maskedSecretValue
		}
		return any(c).(T)
	case models.XAuthConfiguration:
		if c.ClientSecret != "" {
			c.ClientSecret = maskedSecretValue
		}
		return any(c).(T)
	case models.GoogleAuthConfiguration:
		if c.ClientSecret != "" {
			c.ClientSecret = maskedSecretValue
		}
		return any(c).(T)
	case models.GitHubAuthConfiguration:
		if c.ClientSecret != "" {
			c.ClientSecret = maskedSecretValue
		}
		return any(c).(T)
	}
	return cfg
}

type serverConfigAdminResponse struct {
	InstanceDetails           webConfigResponse               `json:"instanceDetails"`
	FFmpegPath                string                          `json:"ffmpegPath"`
	StreamKeys                []models.StreamKey              `json:"streamKeys"`
	StreamKeyOverridden       bool                            `json:"streamKeyOverridden"`
	WebServerPort             int                             `json:"webServerPort"`
	WebServerIP               string                          `json:"webServerIP"`
	RTMPServerPort            int                             `json:"rtmpServerPort"`
	RTMPS                     rtmpsConfigResponse             `json:"rtmps"`
	S3                        models.S3                       `json:"s3"`
	VideoSettings             videoSettings                   `json:"videoSettings"`
	YP                        yp                              `json:"yp"`
	ChatDisabled              bool                            `json:"chatDisabled"`
	SilentStreamMode          bool                            `json:"silentStreamMode"`
	RecordingEnabled          bool                            `json:"recordingEnabled"`
	RecordingStoreOnS3        bool                            `json:"recordingStoreOnS3"`
	BackupEnabled             bool                            `json:"backupEnabled"`
	BackupIntervalHours       int                             `json:"backupIntervalHours"`
	BackupRetentionCount      int                             `json:"backupRetentionCount"`
	BackupStoreOnS3           bool                            `json:"backupStoreOnS3"`
	RecordingRetentionCount   int                             `json:"recordingRetentionCount"`
	ChatJoinMessagesEnabled   bool                            `json:"chatJoinMessagesEnabled"`
	ChatEstablishedUserMode   bool                            `json:"chatEstablishedUserMode"`
	ChatSpamProtectionEnabled bool                            `json:"chatSpamProtectionEnabled"`
	ChatSlurFilterEnabled     bool                            `json:"chatSlurFilterEnabled"`
	RequireTwitterAuth        bool                            `json:"requireTwitterAuth"`
	DiscordAuth               models.DiscordAuthConfiguration `json:"discordAuth"`
	XAuth                     models.XAuthConfiguration       `json:"xAuth"`
	GoogleAuth                models.GoogleAuthConfiguration  `json:"googleAuth"`
	GitHubAuth                models.GitHubAuthConfiguration  `json:"githubAuth"`
	ExternalActions           []models.ExternalAction         `json:"externalActions"`
	SupportedCodecs           []string                        `json:"supportedCodecs"`
	VideoCodec                string                          `json:"videoCodec"`
	ForbiddenUsernames        []string                        `json:"forbiddenUsernames"`
	Federation                federationConfigResponse        `json:"federation"`
	SuggestedUsernames        []string                        `json:"suggestedUsernames"`
	SocketHostOverride        string                          `json:"socketHostOverride,omitempty"`
	Notifications             notificationsConfigResponse     `json:"notifications"`
	HideViewerCount           bool                            `json:"hideViewerCount"`
}

type videoSettings struct {
	VideoQualityVariants []models.StreamOutputVariant `json:"videoQualityVariants"`
	LatencyLevel         int                          `json:"latencyLevel"`
}

type webConfigResponse struct {
	Name                      string                `json:"name"`
	Summary                   string                `json:"summary"`
	WelcomeMessage            string                `json:"welcomeMessage"`
	OfflineMessage            string                `json:"offlineMessage"`
	OfflineMediaPath          string                `json:"offlineMediaPath"`
	OfflineMediaType          string                `json:"offlineMediaType"`
	HasCustomOfflineClip      bool                  `json:"hasCustomOfflineClip"`
	HasCustomLivePoster       bool                  `json:"hasCustomLivePoster"`
	NotificationThumbnailPath string                `json:"notificationThumbnailPath"`
	Logo                      string                `json:"logo"`
	Tags                      []string              `json:"tags"`
	Version                   string                `json:"version"`
	NSFW                      bool                  `json:"nsfw"`
	ExtraPageContent          string                `json:"extraPageContent"`
	StreamTitle               string                `json:"streamTitle"` // What's going on with the current stream
	SocialHandles             []models.SocialHandle `json:"socialHandles"`
	CustomStyles              string                `json:"customStyles"`
	CustomJavascript          string                `json:"customJavascript"`
	AppearanceVariables       map[string]string     `json:"appearanceVariables"`
}

type yp struct {
	Enabled      bool   `json:"enabled"`
	InstanceURL  string `json:"instanceUrl"` // The public URL the directory should link to
	YPServiceURL string `json:"-"`           // The base URL to the YP API to register with (optional)
}

type federationConfigResponse struct {
	Enabled        bool     `json:"enabled"`
	IsPrivate      bool     `json:"isPrivate"`
	Username       string   `json:"username"`
	GoLiveMessage  string   `json:"goLiveMessage"`
	ShowEngagement bool     `json:"showEngagement"`
	BlockedDomains []string `json:"blockedDomains"`
}

type notificationsConfigResponse struct {
	Browser models.BrowserNotificationConfiguration `json:"browser"`
	Discord models.DiscordConfiguration             `json:"discord"`
	Twitter models.TwitterConfiguration             `json:"twitter"`
}

type rtmpsConfigResponse struct {
	Enabled  bool   `json:"enabled"`
	Port     int    `json:"port"`
	CertPath string `json:"certPath"`
	KeyPath  string `json:"keyPath"`
}
