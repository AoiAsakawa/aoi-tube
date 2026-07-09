package controllers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/aoiasakawa/aoitube/core"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
)

// GetStatus gets the status of the server.
func GetStatus(w http.ResponseWriter, r *http.Request) {
	response := getStatusResponse()

	// While silent (test) stream mode is on, everyone except admins and
	// moderators sees the server as offline.
	if !canViewSilentStream(r) {
		response.Online = false
		response.ViewerCount = 0
		response.LastConnectTime = nil
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		InternalErrorHandler(w, err)
	}
}

func getStatusResponse() webStatusResponse {
	status := core.GetStatus()

	// Fetch the current streaming protocol information
	protocolConfig := data.GetStreamProtocolConfig()
	protocolInfo := ProtocolInfo{
		HLSEnabled:    protocolConfig.HLSEnabled,
		LLHLSEnabled:  protocolConfig.LLHLSEnabled,
		WebRTCEnabled: protocolConfig.WebRTCEnabled,
	}

	// ActiveProtocol/ExpectedLatency describe the default delivery the standard
	// player uses (HLS or LL-HLS). WebRTC is opt-in per viewer, so it is NOT
	// folded in here — advertising it made the badge read "LL-HLS+WebRTC" for
	// viewers actually watching LL-HLS. Availability is surfaced separately via
	// WebRTCEnabled (which gates the client's low-latency toggle); the WebRTC
	// player shows its own badge when a viewer switches to it.
	if protocolConfig.LLHLSEnabled {
		protocolInfo.ActiveProtocol = "ll-hls"
		protocolInfo.ExpectedLatency = "2-5s"
	} else {
		protocolInfo.ActiveProtocol = "hls"
		protocolInfo.ExpectedLatency = "10-30s"
	}

	online := status.Online

	// External stream source: viewers play the external managed service's HLS URL
	// directly (AoiTube does no local transcoding), and online status comes from
	// polling that URL rather than the RTMP connect signal.
	externalURL := ""
	if protocolConfig.ExternalStreamEnabled && protocolConfig.ExternalStreamURL != "" {
		ensureExternalStreamPoller()
		externalURL = protocolConfig.ExternalStreamURL
		online = isExternalStreamOnline()
		protocolInfo.ActiveProtocol = "external"
		// The external service delivers HLS; WebRTC is an AoiTube-served path, so
		// don't advertise it (it would offer a low-latency toggle that can't work).
		protocolInfo.WebRTCEnabled = false
	}

	response := webStatusResponse{
		Online:             online,
		ServerTime:         time.Now(),
		LastConnectTime:    status.LastConnectTime,
		LastDisconnectTime: status.LastDisconnectTime,
		VersionNumber:      status.VersionNumber,
		StreamTitle:        status.StreamTitle,
		Protocol:           protocolInfo,
		SilentMode:         data.GetSilentStreamMode(),
		ExternalStreamURL:  externalURL,
	}
	if !data.GetHideViewerCount() {
		response.ViewerCount = status.ViewerCount
	}
	return response
}

// ProtocolInfo contains information about the active streaming protocol.
type ProtocolInfo struct {
	ActiveProtocol  string `json:"activeProtocol"`
	ExpectedLatency string `json:"expectedLatency"`
	HLSEnabled      bool   `json:"hlsEnabled"`
	LLHLSEnabled    bool   `json:"llhlsEnabled"`
	WebRTCEnabled   bool   `json:"webrtcEnabled"`
}

type webStatusResponse struct {
	Online             bool            `json:"online"`
	ViewerCount        int             `json:"viewerCount,omitempty"`
	ServerTime         time.Time       `json:"serverTime"`
	LastConnectTime    *utils.NullTime `json:"lastConnectTime"`
	LastDisconnectTime *utils.NullTime `json:"lastDisconnectTime"`

	VersionNumber string       `json:"versionNumber"`
	StreamTitle   string       `json:"streamTitle"`
	Protocol      ProtocolInfo `json:"protocol"`
	// SilentMode is true while the operator runs a silent (test) broadcast;
	// the viewer UI shows a TEST badge instead of LIVE. Only authorized
	// viewers can watch such streams anyway.
	SilentMode bool `json:"silentMode"`
	// ExternalStreamURL is the external managed-service HLS URL viewers play when
	// the external stream source is enabled; empty otherwise (self-hosted).
	ExternalStreamURL string `json:"externalStreamUrl,omitempty"`
}
