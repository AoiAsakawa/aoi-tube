package webrtc

import (
	"encoding/json"
	"io"
	"net"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/pion/interceptor"
	"github.com/pion/logging"
	"github.com/pion/webrtc/v4"
	log "github.com/sirupsen/logrus"
)

// defaultWebRTCUDPPort is the single UDP port all WebRTC media (ICE) is muxed
// onto by default. Using one fixed port means the operator opens exactly one
// firewall port instead of a wide ephemeral UDP range.
const defaultWebRTCUDPPort = 52000

// SFU represents the WebRTC Selective Forwarding Unit.
type SFU struct {
	mu         sync.RWMutex
	viewers    map[string]*ViewerConnection
	videoTrack *webrtc.TrackLocalStaticRTP
	audioTrack *webrtc.TrackLocalStaticRTP
	pipeline   *mediaPipeline
	api        *webrtc.API
	maxViewers int
	enabled    bool
	iceServers []webrtc.ICEServer
}

// ViewerConnection represents a connected WebRTC viewer.
type ViewerConnection struct {
	ID             string
	PeerConnection *webrtc.PeerConnection
	ConnectedAt    time.Time
	ClientIP       string
	UserAgent      string
}

// SessionDescription is a wrapper for WebRTC session descriptions.
type SessionDescription struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

// ICECandidateMessage represents an ICE candidate for signaling.
type ICECandidateMessage struct {
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdpMid"`
	SDPMLineIndex uint16 `json:"sdpMLineIndex"`
}

var (
	sfu     *SFU
	sfuOnce sync.Once
)

// GetSFU returns the singleton SFU instance.
func GetSFU() *SFU {
	sfuOnce.Do(func() {
		sfu = &SFU{
			viewers: make(map[string]*ViewerConnection),
		}
		sfu.api = buildWebRTCAPI()
		sfu.loadConfig()
	})
	return sfu
}

// webRTCUDPPort returns the fixed UDP port WebRTC media is muxed onto, from
// OWNCAST_WEBRTC_UDP_PORT or the default.
func webRTCUDPPort() int {
	// Env var wins (deployment-level override), then the admin-configured value,
	// then the built-in default.
	if v := os.Getenv("OWNCAST_WEBRTC_UDP_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 && p < 65536 {
			return p
		}
	}
	if p := data.GetStreamProtocolConfig().WebRTCUDPPort; p > 0 && p < 65536 {
		return p
	}
	return defaultWebRTCUDPPort
}

// buildWebRTCAPI builds a webrtc.API that muxes all ICE traffic onto a single
// UDP port (so exactly one firewall port must be opened) and registers the
// default codecs (H.264/Opus). If the mux port cannot be bound it returns nil,
// and callers fall back to the default ephemeral-port peer connection.
func buildWebRTCAPI() *webrtc.API {
	// Register exactly the codecs the SFU actually sends — high-profile H.264 and
	// stereo Opus — instead of RegisterDefaultCodecs. Two reasons: (1) the default
	// Opus is registered mono (no stereo=1 in its fmtp), so browsers decoded the
	// stream as mono; (2) offering only one Opus with stereo=1 guarantees the
	// browser negotiates stereo rather than possibly picking a mono variant. High
	// profile (CABAC + 8x8) is a large quality win over constrained-baseline.
	m := &webrtc.MediaEngine{}
	videoRTCPFeedback := []webrtc.RTCPFeedback{
		{Type: "goog-remb", Parameter: ""},
		{Type: "ccm", Parameter: "fir"},
		{Type: "nack", Parameter: ""},
		{Type: "nack", Parameter: "pli"},
	}
	codecs := []struct {
		params webrtc.RTPCodecParameters
		typ    webrtc.RTPCodecType
	}{
		{webrtc.RTPCodecParameters{
			RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2, SDPFmtpLine: "minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1"},
			PayloadType:        111,
		}, webrtc.RTPCodecTypeAudio},
		{webrtc.RTPCodecParameters{
			RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeH264, ClockRate: 90000, SDPFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f", RTCPFeedback: videoRTCPFeedback},
			PayloadType:        102,
		}, webrtc.RTPCodecTypeVideo},
		{webrtc.RTPCodecParameters{
			RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: "video/rtx", ClockRate: 90000, SDPFmtpLine: "apt=102"},
			PayloadType:        103,
		}, webrtc.RTPCodecTypeVideo},
	}
	for _, c := range codecs {
		if err := m.RegisterCodec(c.params, c.typ); err != nil {
			log.Errorln("WebRTC: failed to register codec:", err)
			return nil
		}
	}

	// The default interceptors provide RTCP sender reports (browser jitter
	// buffer / AV clock sync) and NACK retransmission (packet-loss recovery).
	// Omitting them audibly degrades audio into ms-scale dropouts, so their
	// absence is treated the same as a codec registration failure.
	i := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(m, i); err != nil {
		log.Errorln("WebRTC: failed to register default interceptors:", err)
		return nil
	}

	settingEngine := webrtc.SettingEngine{}
	port := webRTCUDPPort()
	udpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: port})
	if err != nil {
		log.Warnf("WebRTC: could not bind UDP mux port %d (%v); falling back to ephemeral ports — the firewall must then allow a wide inbound UDP range", port, err)
		return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithInterceptorRegistry(i))
	}

	udpMux := webrtc.NewICEUDPMux(logging.NewDefaultLoggerFactory().NewLogger("ice"), udpConn)
	settingEngine.SetICEUDPMux(udpMux)
	log.Infof("WebRTC: ICE media muxed on UDP port %d — this port must be open inbound in the firewall", port)

	return webrtc.NewAPI(
		webrtc.WithMediaEngine(m),
		webrtc.WithInterceptorRegistry(i),
		webrtc.WithSettingEngine(settingEngine),
	)
}

// iceServerRaw is used to parse ICE servers with flexible urls field (string or []string).
type iceServerRaw struct {
	URLs       interface{} `json:"urls"`
	Username   string      `json:"username,omitempty"`
	Credential string      `json:"credential,omitempty"`
}

// loadConfig loads the WebRTC configuration from data store.
func (s *SFU) loadConfig() {
	config := data.GetStreamProtocolConfig()
	s.enabled = config.WebRTCEnabled
	s.maxViewers = data.GetWebRTCMaxViewers()

	// Parse ICE servers with flexible format support
	iceServersJSON := data.GetWebRTCICEServers()
	s.iceServers = parseICEServers(iceServersJSON)
}

// parseICEServers parses ICE servers JSON with flexible urls format support.
// Supports both "urls": "stun:..." and "urls": ["stun:..."] formats.
func parseICEServers(jsonStr string) []webrtc.ICEServer {
	defaultServers := []webrtc.ICEServer{
		{URLs: []string{"stun:stun.l.google.com:19302"}},
	}

	if jsonStr == "" {
		return defaultServers
	}

	var rawServers []iceServerRaw
	if err := json.Unmarshal([]byte(jsonStr), &rawServers); err != nil {
		log.Warnln("Failed to parse ICE servers JSON, using default:", err)
		return defaultServers
	}

	if len(rawServers) == 0 {
		return defaultServers
	}

	servers := make([]webrtc.ICEServer, 0, len(rawServers))
	for _, raw := range rawServers {
		var urls []string

		// Handle flexible urls format: string or []string
		switch v := raw.URLs.(type) {
		case string:
			if v != "" {
				urls = []string{v}
			}
		case []interface{}:
			for _, u := range v {
				if str, ok := u.(string); ok && str != "" {
					urls = append(urls, str)
				}
			}
		}

		if len(urls) > 0 {
			servers = append(servers, webrtc.ICEServer{
				URLs:       urls,
				Username:   raw.Username,
				Credential: raw.Credential,
			})
		}
	}

	if len(servers) == 0 {
		return defaultServers
	}

	return servers
}

// ReloadConfig reloads the WebRTC configuration.
func (s *SFU) ReloadConfig() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadConfig()
}

// IsEnabled returns whether WebRTC streaming is enabled.
func (s *SFU) IsEnabled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.enabled
}

// GetViewerCount returns the current number of WebRTC viewers.
func (s *SFU) GetViewerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.viewers)
}

// CanAcceptViewer checks if another viewer can be accepted.
func (s *SFU) CanAcceptViewer() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.maxViewers == 0 {
		return true // unlimited
	}
	return len(s.viewers) < s.maxViewers
}

// CreateViewerConnection creates a new WebRTC peer connection for a viewer.
func (s *SFU) CreateViewerConnection(viewerID string, offer SessionDescription, clientIP, userAgent string) (*SessionDescription, error) {
	// Read the config under the lock, then release it: the expensive part
	// (peer-connection setup + ICE gathering, which does STUN network I/O)
	// must NOT hold the SFU lock, or one slow/hung gather would stall every
	// other SFU operation (new viewers, ICE candidates, RemoveViewer, stats).
	s.mu.Lock()
	if !s.enabled {
		s.mu.Unlock()
		return nil, ErrWebRTCDisabled
	}
	if s.maxViewers > 0 && len(s.viewers) >= s.maxViewers {
		s.mu.Unlock()
		return nil, ErrMaxViewersReached
	}
	config := webrtc.Configuration{
		ICEServers: s.iceServers,
	}
	api := s.api
	videoTrack := s.videoTrack
	audioTrack := s.audioTrack
	s.mu.Unlock()

	// Create a new peer connection using the SFU's API, which muxes ICE onto a
	// single UDP port (so only one firewall port must be open). Fall back to the
	// package default if the API could not be built.
	var peerConnection *webrtc.PeerConnection
	var err error
	if api != nil {
		peerConnection, err = api.NewPeerConnection(config)
	} else {
		peerConnection, err = webrtc.NewPeerConnection(config)
	}
	if err != nil {
		return nil, err
	}

	// Add tracks if available (snapshotted under the lock above).
	if videoTrack != nil {
		_, err = peerConnection.AddTrack(videoTrack)
		if err != nil {
			peerConnection.Close()
			return nil, err
		}
	}

	if audioTrack != nil {
		_, err = peerConnection.AddTrack(audioTrack)
		if err != nil {
			peerConnection.Close()
			return nil, err
		}
	}

	// Handle connection state changes
	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Debugf("WebRTC viewer %s connection state: %s", viewerID, state.String())

		if state == webrtc.PeerConnectionStateFailed ||
			state == webrtc.PeerConnectionStateDisconnected ||
			state == webrtc.PeerConnectionStateClosed {
			s.RemoveViewer(viewerID)
		}
	})

	// Set the remote description (offer from client)
	sdpType := webrtc.SDPTypeOffer
	if offer.Type == "answer" {
		sdpType = webrtc.SDPTypeAnswer
	}

	err = peerConnection.SetRemoteDescription(webrtc.SessionDescription{
		Type: sdpType,
		SDP:  offer.SDP,
	})
	if err != nil {
		peerConnection.Close()
		return nil, err
	}

	// Create answer
	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		peerConnection.Close()
		return nil, err
	}

	// Set local description
	err = peerConnection.SetLocalDescription(answer)
	if err != nil {
		peerConnection.Close()
		return nil, err
	}

	// Wait for ICE gathering to complete (network I/O — done without the lock).
	gatherComplete := webrtc.GatheringCompletePromise(peerConnection)
	<-gatherComplete

	// Re-acquire the lock only to register the viewer. Re-check enabled and the
	// cap since they may have changed while gathering ran unlocked.
	s.mu.Lock()
	if !s.enabled {
		s.mu.Unlock()
		peerConnection.Close()
		return nil, ErrWebRTCDisabled
	}
	if s.maxViewers > 0 && len(s.viewers) >= s.maxViewers {
		s.mu.Unlock()
		peerConnection.Close()
		return nil, ErrMaxViewersReached
	}
	s.viewers[viewerID] = &ViewerConnection{
		ID:             viewerID,
		PeerConnection: peerConnection,
		ConnectedAt:    time.Now(),
		ClientIP:       clientIP,
		UserAgent:      userAgent,
	}
	total := len(s.viewers)
	s.mu.Unlock()

	log.Infof("WebRTC viewer connected: %s (total: %d)", viewerID, total)

	return &SessionDescription{
		Type: "answer",
		SDP:  peerConnection.LocalDescription().SDP,
	}, nil
}

// AddICECandidate adds an ICE candidate to a viewer's peer connection.
func (s *SFU) AddICECandidate(viewerID string, candidate ICECandidateMessage) error {
	s.mu.RLock()
	viewer, exists := s.viewers[viewerID]
	s.mu.RUnlock()

	if !exists {
		return ErrViewerNotFound
	}

	iceCandidate := webrtc.ICECandidateInit{
		Candidate:     candidate.Candidate,
		SDPMid:        &candidate.SDPMid,
		SDPMLineIndex: &candidate.SDPMLineIndex,
	}

	return viewer.PeerConnection.AddICECandidate(iceCandidate)
}

// RemoveViewer removes a viewer connection.
func (s *SFU) RemoveViewer(viewerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if viewer, exists := s.viewers[viewerID]; exists {
		viewer.PeerConnection.Close()
		delete(s.viewers, viewerID)
		log.Infof("WebRTC viewer disconnected: %s (total: %d)", viewerID, len(s.viewers))
	}
}

// PlayEndClipAndStop plays the end-of-stream clip through the current media
// pipeline's tracks (so already-connected viewers see it), then tears the SFU
// down — unless a new broadcast replaced the pipeline in the meantime, in
// which case the new session is left untouched. Blocks for the clip duration;
// call from a goroutine.
func (s *SFU) PlayEndClipAndStop(ffmpegPath, clipPath string) {
	s.mu.Lock()
	pipeline := s.pipeline
	hasViewers := len(s.viewers) > 0
	s.mu.Unlock()

	if pipeline != nil && hasViewers && ffmpegPath != "" && clipPath != "" {
		log.Infoln("WebRTC: playing end-of-stream clip to connected viewers")
		if err := pipeline.playClipBlocking(ffmpegPath, clipPath, 30*time.Second); err != nil {
			log.Warnln("WebRTC end clip playback:", err)
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pipeline != pipeline {
		// A new broadcast already started its own pipeline; don't kill it.
		return
	}
	s.stopMediaLocked()
	for id, viewer := range s.viewers {
		viewer.PeerConnection.Close()
		delete(s.viewers, id)
	}
	log.Infoln("WebRTC SFU stopped after end clip")
}

// SetVideoTrack sets the video track to forward to viewers.
func (s *SFU) SetVideoTrack(track *webrtc.TrackLocalStaticRTP) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.videoTrack = track
}

// SetAudioTrack sets the audio track to forward to viewers.
func (s *SFU) SetAudioTrack(track *webrtc.TrackLocalStaticRTP) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audioTrack = track
}

// StartMedia spins up the FFmpeg→RTP pipeline that feeds the SFU's video and
// audio tracks from the live FLV stream. It is a no-op-with-error when WebRTC
// is disabled. Any previously running pipeline is replaced. Callers pass the
// validated FFmpeg path and a reader delivering the headerless FLV stream (a
// non-blocking tee of the RTMP input, so a stalled encoder never back-pressures
// the HLS transcoder).
func (s *SFU) StartMedia(ffmpegPath string, stream io.Reader) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return ErrWebRTCDisabled
	}

	if s.pipeline != nil {
		s.pipeline.stop()
		s.pipeline = nil
	}

	pipeline, err := newMediaPipeline()
	if err != nil {
		return err
	}
	if err := pipeline.start(ffmpegPath, stream); err != nil {
		pipeline.stop()
		return err
	}

	s.pipeline = pipeline
	s.videoTrack = pipeline.videoTrack
	s.audioTrack = pipeline.audioTrack
	return nil
}

// StopMedia tears down the media pipeline and clears the forwarded tracks. It
// leaves existing viewer connections in place (they simply stop receiving
// media); use Stop to also disconnect viewers.
func (s *SFU) StopMedia() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopMediaLocked()
}

// stopMediaLocked stops the pipeline and nils the tracks. Callers must hold s.mu.
func (s *SFU) stopMediaLocked() {
	if s.pipeline != nil {
		s.pipeline.stop()
		s.pipeline = nil
	}
	s.videoTrack = nil
	s.audioTrack = nil
}

// DisconnectAllViewers closes every viewer connection but keeps the media
// pipeline running, so newly connecting viewers still receive the stream.
func (s *SFU) DisconnectAllViewers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for id, viewer := range s.viewers {
		viewer.PeerConnection.Close()
		delete(s.viewers, id)
	}

	log.Infoln("WebRTC all viewers disconnected")
}

// Stop stops the media pipeline and closes all WebRTC viewer connections.
func (s *SFU) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.stopMediaLocked()

	for id, viewer := range s.viewers {
		viewer.PeerConnection.Close()
		delete(s.viewers, id)
	}

	log.Infoln("WebRTC SFU stopped")
}

// GetStats returns statistics about WebRTC connections.
func (s *SFU) GetStats() WebRTCStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	viewers := make([]ViewerStats, 0, len(s.viewers))
	for _, v := range s.viewers {
		viewers = append(viewers, ViewerStats{
			ID:          v.ID,
			ConnectedAt: v.ConnectedAt,
			ClientIP:    v.ClientIP,
		})
	}

	return WebRTCStats{
		Enabled:     s.enabled,
		ViewerCount: len(s.viewers),
		MaxViewers:  s.maxViewers,
		Viewers:     viewers,
	}
}

// WebRTCStats contains statistics about WebRTC streaming.
type WebRTCStats struct {
	Enabled     bool          `json:"enabled"`
	ViewerCount int           `json:"viewerCount"`
	MaxViewers  int           `json:"maxViewers"`
	Viewers     []ViewerStats `json:"viewers"`
}

// ViewerStats contains information about a single viewer.
type ViewerStats struct {
	ID          string    `json:"id"`
	ConnectedAt time.Time `json:"connectedAt"`
	ClientIP    string    `json:"clientIp"`
}
