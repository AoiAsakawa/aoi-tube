package config

import (
	"time"

	"github.com/aoiasakawa/aoitube/models"
)

// Defaults will hold default configuration values.
type Defaults struct {
	Name                 string
	Title                string
	Summary              string
	ServerWelcomeMessage string
	Logo                 string
	Tags                 []string
	PageBodyContent      string

	DatabaseFilePath string
	WebServerPort    int
	WebServerIP      string
	RTMPServerPort   int
	AdminPassword    string
	StreamKeys       []models.StreamKey

	YPEnabled bool
	YPServer  string

	SegmentLengthSeconds int
	SegmentsInPlaylist   int
	StreamVariants       []models.StreamOutputVariant

	FederationUsername      string
	FederationGoLiveMessage string

	ChatEstablishedUserModeTimeDuration time.Duration
}

// GetDefaults will return default configuration values.
func GetDefaults() Defaults {
	return Defaults{
		Name:                 "New AoiTube Server",
		Summary:              "This is a new live video streaming server powered by AoiTube.",
		ServerWelcomeMessage: "",
		Logo:                 "logo.svg",
		AdminPassword:        "abc123",
		StreamKeys: []models.StreamKey{
			{Key: "abc123", Comment: "Default stream key"},
		},
		Tags: []string{
			"aoitube",
			"streaming",
		},

		PageBodyContent: `
# Welcome to AoiTube!

- This is a live stream powered by [AoiTube](https://github.com/AoiAsakawa/aoitube), a free and open source live streaming server based on [Owncast](https://owncast.online).

- If you're the owner of this server you should visit the admin and customize the content on this page.

<hr/>
	`,

		DatabaseFilePath: "data/owncast.db",

		YPEnabled: false,
		YPServer:  "https://owncast.directory",

		WebServerPort:  8080,
		WebServerIP:    "0.0.0.0",
		RTMPServerPort: 1935,

		ChatEstablishedUserModeTimeDuration: time.Minute * 15,

		StreamVariants: []models.StreamOutputVariant{
			{
				IsAudioPassthrough: true,
				VideoBitrate:       1200,
				Framerate:          24,
				CPUUsageLevel:      2,
			},
		},

		FederationUsername:      "streamer",
		FederationGoLiveMessage: "I've gone live!",
	}
}
