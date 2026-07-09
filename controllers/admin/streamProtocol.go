package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webrtc"
	"github.com/aoiasakawa/aoitube/models"
)

// StreamProtocolConfigRequest is the request body for updating stream protocol config.
type StreamProtocolConfigRequest struct {
	HLSEnabled        bool   `json:"hlsEnabled"`
	LLHLSEnabled      bool   `json:"llhlsEnabled"`
	LLHLSPartDuration int    `json:"llhlsPartDuration"`
	WebRTCEnabled     bool   `json:"webrtcEnabled"`
	WebRTCICEServers  string `json:"webrtcIceServers"`
	WebRTCMaxViewers  int    `json:"webrtcMaxViewers"`
	WebRTCUDPPort     int    `json:"webrtcUdpPort"`

	ExternalStreamEnabled bool   `json:"externalStreamEnabled"`
	ExternalStreamURL     string `json:"externalStreamUrl"`
}

// GetStreamProtocolConfig returns the current stream protocol configuration.
func GetStreamProtocolConfig(w http.ResponseWriter, r *http.Request) {
	config := data.GetStreamProtocolConfig()
	llhlsLevel := data.GetLLHLSLatencyLevel()

	// Report the effective UDP port so existing installs (saved before this field
	// existed, so stored as 0) show the real default rather than a blank/zero.
	udpPort := config.WebRTCUDPPort
	if udpPort <= 0 {
		udpPort = 52000
	}

	response := map[string]interface{}{
		"hlsEnabled":            config.HLSEnabled,
		"llhlsEnabled":          config.LLHLSEnabled,
		"llhlsPartDuration":     config.LLHLSPartDuration,
		"llhlsPartHoldBack":     config.LLHLSPartHoldBack,
		"llhlsLatencyLevel":     llhlsLevel.Level,
		"webrtcEnabled":         config.WebRTCEnabled,
		"webrtcIceServers":      config.WebRTCICEServers,
		"webrtcMaxViewers":      config.WebRTCMaxViewers,
		"webrtcUdpPort":         udpPort,
		"externalStreamEnabled": config.ExternalStreamEnabled,
		"externalStreamUrl":     config.ExternalStreamURL,
	}

	controllers.WriteResponse(w, response)
}

// SetStreamProtocolConfig updates the stream protocol configuration.
func SetStreamProtocolConfig(w http.ResponseWriter, r *http.Request) {
	var request StreamProtocolConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		controllers.BadRequestHandler(w, err)
		return
	}

	// Validate ICE servers JSON if provided - support flexible format
	if request.WebRTCICEServers != "" {
		var rawServers []map[string]interface{}
		if err := json.Unmarshal([]byte(request.WebRTCICEServers), &rawServers); err != nil {
			controllers.WriteSimpleResponse(w, false, "無効なICEサーバー設定です: JSONの形式が正しくありません")
			return
		}
		// Basic validation: ensure at least one server has urls
		for _, server := range rawServers {
			if _, ok := server["urls"]; !ok {
				controllers.WriteSimpleResponse(w, false, "無効なICEサーバー設定です: 各サーバーにはurlsフィールドが必要です")
				return
			}
		}
	}

	// Get current config and update
	config := data.GetStreamProtocolConfig()
	config.HLSEnabled = request.HLSEnabled
	config.LLHLSEnabled = request.LLHLSEnabled
	if request.LLHLSPartDuration > 0 {
		config.LLHLSPartDuration = request.LLHLSPartDuration
	}
	config.WebRTCEnabled = request.WebRTCEnabled
	if request.WebRTCICEServers != "" {
		config.WebRTCICEServers = request.WebRTCICEServers
	}
	if request.WebRTCMaxViewers > 0 {
		config.WebRTCMaxViewers = request.WebRTCMaxViewers
	}
	if request.WebRTCUDPPort > 0 {
		if request.WebRTCUDPPort < 1024 || request.WebRTCUDPPort > 65535 {
			controllers.WriteSimpleResponse(w, false, "WebRTC UDPポートは1024〜65535の範囲で指定してください")
			return
		}
		config.WebRTCUDPPort = request.WebRTCUDPPort
	}
	config.ExternalStreamEnabled = request.ExternalStreamEnabled
	config.ExternalStreamURL = strings.TrimSpace(request.ExternalStreamURL)

	if err := data.SetStreamProtocolConfig(config); err != nil {
		controllers.InternalErrorHandler(w, err)
		return
	}

	// Reload the SFU so its runtime state matches the saved config. When WebRTC
	// is turned off (including mid-stream), also stop any running media pipeline.
	sfu := webrtc.GetSFU()
	sfu.ReloadConfig()
	if !config.WebRTCEnabled {
		sfu.StopMedia()
	}

	controllers.WriteSimpleResponse(w, true, "ストリーミングプロトコル設定を更新しました")
}

// SetLLHLSLatencyLevel sets the LL-HLS latency level.
func SetLLHLSLatencyLevel(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Level int `json:"level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		controllers.BadRequestHandler(w, err)
		return
	}

	if request.Level < 0 || request.Level > 4 {
		controllers.WriteSimpleResponse(w, false, "レイテンシーレベルは0-4の範囲で指定してください")
		return
	}

	if err := data.SetLLHLSLatencyLevel(float64(request.Level)); err != nil {
		controllers.InternalErrorHandler(w, err)
		return
	}

	controllers.WriteSimpleResponse(w, true, "LL-HLSレイテンシーレベルを更新しました")
}

// GetLLHLSLatencyLevels returns available LL-HLS latency level options.
func GetLLHLSLatencyLevels(w http.ResponseWriter, r *http.Request) {
	levels := models.GetLLHLSLatencyConfigs()

	response := make([]map[string]interface{}, 0, len(levels))
	for _, level := range levels {
		response = append(response, map[string]interface{}{
			"level":            level.Level,
			"partDurationMs":   level.PartDurationMS,
			"segmentDurationS": level.SegmentDurationS,
			"partHoldBack":     level.PartHoldBack,
			"description":      getLLHLSLevelDescription(level.Level),
		})
	}

	controllers.WriteResponse(w, response)
}

// getLLHLSLevelDescription returns a human-readable description for the latency level.
func getLLHLSLevelDescription(level int) string {
	descriptions := map[int]string{
		0: "超低遅延 (~0.5秒) - 最も低い遅延、高い帯域幅が必要",
		1: "低遅延 (~1秒) - 低い遅延、安定した接続が必要",
		2: "中程度 (~2秒) - バランスの取れた設定（デフォルト）",
		3: "標準 (~3秒) - 安定した視聴体験",
		4: "高信頼性 (~5秒) - 最も安定、バッファリング重視",
	}
	if desc, ok := descriptions[level]; ok {
		return desc
	}
	return "不明なレベル"
}

// GetWebRTCStats returns WebRTC streaming statistics.
func GetWebRTCStats(w http.ResponseWriter, r *http.Request) {
	sfu := webrtc.GetSFU()
	stats := sfu.GetStats()
	controllers.WriteResponse(w, stats)
}

// DisconnectWebRTCViewer disconnects a specific WebRTC viewer.
func DisconnectWebRTCViewer(w http.ResponseWriter, r *http.Request) {
	viewerID := r.URL.Query().Get("viewerId")
	if viewerID == "" {
		controllers.WriteSimpleResponse(w, false, "viewerIdが必要です")
		return
	}

	sfu := webrtc.GetSFU()
	sfu.RemoveViewer(viewerID)

	controllers.WriteSimpleResponse(w, true, "視聴者を切断しました")
}

// DisconnectAllWebRTCViewers disconnects all WebRTC viewers while leaving the
// media pipeline running, so viewers can reconnect without a stream restart.
func DisconnectAllWebRTCViewers(w http.ResponseWriter, r *http.Request) {
	sfu := webrtc.GetSFU()
	sfu.DisconnectAllViewers()

	controllers.WriteSimpleResponse(w, true, "すべてのWebRTC視聴者を切断しました")
}
