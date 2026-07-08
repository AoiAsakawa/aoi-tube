package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/core"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webrtc"
	"github.com/teris-io/shortid"
)

// maxWebRTCOfferBytes bounds the SDP offer body. Real offers are a few KB;
// 64 KiB is generous headroom without allowing an unbounded read.
const maxWebRTCOfferBytes = 64 * 1024

// WebRTCOfferRequest represents a WebRTC offer from a client.
type WebRTCOfferRequest struct {
	SDP string `json:"sdp"`
}

// WebRTCOfferResponse represents the answer to send back to client.
type WebRTCOfferResponse struct {
	ViewerID string `json:"viewerId"`
	SDP      string `json:"sdp"`
	Type     string `json:"type"`
}

// WebRTCICECandidateRequest represents an ICE candidate from client.
type WebRTCICECandidateRequest struct {
	ViewerID      string `json:"viewerId"`
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdpMid"`
	SDPMLineIndex uint16 `json:"sdpMLineIndex"`
}

// HandleWebRTCOffer handles WebRTC offer requests from viewers.
func HandleWebRTCOffer(w http.ResponseWriter, r *http.Request) {
	// Check if WebRTC is enabled
	if !data.GetWebRTCEnabled() {
		WriteSimpleResponse(w, false, "WebRTCストリーミングは無効です")
		return
	}

	// Check if stream is online
	if !core.GetStatus().Online {
		WriteSimpleResponse(w, false, "現在配信中ではありません")
		return
	}

	// Enforce the same viewer gating as the HLS/thumbnail paths: silent (test)
	// mode is admins/moderators only, and required social auth limits playback
	// to authenticated viewers. Without this the WebRTC path would leak the
	// live A/V of restricted streams to unauthenticated clients.
	if !canViewStream(r) {
		WriteSimpleResponse(w, false, "この配信を視聴する権限がありません")
		return
	}

	// Cap the offer body so a client can't stream an unbounded SDP.
	r.Body = http.MaxBytesReader(w, r.Body, maxWebRTCOfferBytes)

	// Parse request
	var request WebRTCOfferRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		BadRequestHandler(w, err)
		return
	}

	if request.SDP == "" {
		WriteSimpleResponse(w, false, "SDPが必要です")
		return
	}

	// Get SFU instance
	sfu := webrtc.GetSFU()

	// Check if we can accept more viewers
	if !sfu.CanAcceptViewer() {
		WriteSimpleResponse(w, false, "WebRTC視聴者の上限に達しました")
		return
	}

	// Generate viewer ID
	viewerID, _ := shortid.Generate()

	// Get client info
	clientIP := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		clientIP = xff
	}
	userAgent := r.Header.Get("User-Agent")

	// Create peer connection and get answer
	offer := webrtc.SessionDescription{
		Type: "offer",
		SDP:  request.SDP,
	}

	answer, err := sfu.CreateViewerConnection(viewerID, offer, clientIP, userAgent)
	if err != nil {
		switch err {
		case webrtc.ErrWebRTCDisabled:
			WriteSimpleResponse(w, false, "WebRTCストリーミングは無効です")
		case webrtc.ErrMaxViewersReached:
			WriteSimpleResponse(w, false, "WebRTC視聴者の上限に達しました")
		default:
			InternalErrorHandler(w, err)
		}
		return
	}

	// Send response
	response := WebRTCOfferResponse{
		ViewerID: viewerID,
		Type:     answer.Type,
		SDP:      answer.SDP,
	}

	WriteResponse(w, response)
}

// HandleWebRTCICECandidate handles ICE candidate trickling from viewers.
func HandleWebRTCICECandidate(w http.ResponseWriter, r *http.Request) {
	var request WebRTCICECandidateRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		BadRequestHandler(w, err)
		return
	}

	if request.ViewerID == "" {
		WriteSimpleResponse(w, false, "viewerIdが必要です")
		return
	}

	sfu := webrtc.GetSFU()

	candidate := webrtc.ICECandidateMessage{
		Candidate:     request.Candidate,
		SDPMid:        request.SDPMid,
		SDPMLineIndex: request.SDPMLineIndex,
	}

	if err := sfu.AddICECandidate(request.ViewerID, candidate); err != nil {
		if err == webrtc.ErrViewerNotFound {
			WriteSimpleResponse(w, false, "視聴者接続が見つかりません")
			return
		}
		InternalErrorHandler(w, err)
		return
	}

	WriteSimpleResponse(w, true, "ICE candidateを追加しました")
}

// HandleWebRTCDisconnect handles viewer disconnection.
func HandleWebRTCDisconnect(w http.ResponseWriter, r *http.Request) {
	viewerID := r.URL.Query().Get("viewerId")
	if viewerID == "" {
		WriteSimpleResponse(w, false, "viewerIdが必要です")
		return
	}

	sfu := webrtc.GetSFU()
	sfu.RemoveViewer(viewerID)

	WriteSimpleResponse(w, true, "切断しました")
}

// GetWebRTCConfig returns WebRTC configuration for the client.
func GetWebRTCConfig(w http.ResponseWriter, r *http.Request) {
	config := data.GetStreamProtocolConfig()

	response := map[string]interface{}{
		"enabled":    config.WebRTCEnabled,
		"iceServers": json.RawMessage(data.GetWebRTCICEServers()),
		"maxViewers": data.GetWebRTCMaxViewers(),
	}

	WriteResponse(w, response)
}

// GetWebRTCStats returns WebRTC statistics (admin only).
func GetWebRTCStats(w http.ResponseWriter, r *http.Request) {
	sfu := webrtc.GetSFU()
	stats := sfu.GetStats()
	WriteResponse(w, stats)
}
