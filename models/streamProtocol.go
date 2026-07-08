package models

// StreamProtocol represents the streaming protocol type.
type StreamProtocol string

const (
	// StreamProtocolHLS is the standard HLS protocol.
	StreamProtocolHLS StreamProtocol = "hls"
	// StreamProtocolLLHLS is the Low-Latency HLS protocol.
	StreamProtocolLLHLS StreamProtocol = "llhls"
	// StreamProtocolWebRTC is the WebRTC protocol for ultra-low latency.
	StreamProtocolWebRTC StreamProtocol = "webrtc"
)

// StreamProtocolConfig holds configuration for streaming protocols.
type StreamProtocolConfig struct {
	// HLS settings
	HLSEnabled bool `json:"hlsEnabled"`
	// LL-HLS settings
	LLHLSEnabled      bool `json:"llhlsEnabled"`
	LLHLSPartDuration int  `json:"llhlsPartDuration"` // Part duration in milliseconds (default: 200)
	LLHLSPartHoldBack int  `json:"llhlsPartHoldBack"` // Part hold-back time in parts (default: 3)
	// WebRTC settings
	WebRTCEnabled    bool   `json:"webrtcEnabled"`
	WebRTCICEServers string `json:"webrtcIceServers"` // JSON array of ICE servers
	WebRTCMaxViewers int    `json:"webrtcMaxViewers"` // Maximum concurrent WebRTC viewers (0 = unlimited)
}

// DefaultStreamProtocolConfig returns default streaming protocol configuration.
func DefaultStreamProtocolConfig() StreamProtocolConfig {
	return StreamProtocolConfig{
		HLSEnabled:        true,
		LLHLSEnabled:      false,
		LLHLSPartDuration: 200, // 200ms parts
		LLHLSPartHoldBack: 3,   // 3 parts hold-back
		WebRTCEnabled:     false,
		WebRTCICEServers:  `[{"urls": ["stun:stun.l.google.com:19302"]}]`,
		WebRTCMaxViewers:  50,
	}
}

// LLHLSLatencyLevel represents LL-HLS specific latency configurations.
type LLHLSLatencyLevel struct {
	Level            int `json:"level"`
	PartDurationMS   int `json:"partDurationMs"`   // Part duration in milliseconds
	SegmentDurationS int `json:"segmentDurationS"` // Segment duration in seconds
	PartHoldBack     int `json:"partHoldBack"`     // Number of parts to hold back
}

// GetLLHLSLatencyConfigs returns available LL-HLS latency configurations.
func GetLLHLSLatencyConfigs() map[int]LLHLSLatencyLevel {
	return map[int]LLHLSLatencyLevel{
		0: {Level: 0, PartDurationMS: 100, SegmentDurationS: 1, PartHoldBack: 2},  // Ultra-low: ~0.5s
		1: {Level: 1, PartDurationMS: 200, SegmentDurationS: 1, PartHoldBack: 3},  // Low: ~1s
		2: {Level: 2, PartDurationMS: 333, SegmentDurationS: 2, PartHoldBack: 3},  // Medium: ~2s (default)
		3: {Level: 3, PartDurationMS: 500, SegmentDurationS: 2, PartHoldBack: 4},  // High: ~3s
		4: {Level: 4, PartDurationMS: 1000, SegmentDurationS: 4, PartHoldBack: 3}, // Standard: ~5s
	}
}

// GetLLHLSLatencyLevel returns the LL-HLS latency level at index.
func GetLLHLSLatencyLevel(index int) LLHLSLatencyLevel {
	configs := GetLLHLSLatencyConfigs()
	if level, ok := configs[index]; ok {
		return level
	}
	return configs[2] // Default to medium
}

// ICEServer represents a WebRTC ICE server configuration.
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}
