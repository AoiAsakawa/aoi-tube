package webrtc

import "errors"

var (
	// ErrWebRTCDisabled is returned when WebRTC is disabled.
	ErrWebRTCDisabled = errors.New("WebRTC streaming is disabled")
	// ErrMaxViewersReached is returned when the maximum number of WebRTC viewers is reached.
	ErrMaxViewersReached = errors.New("maximum WebRTC viewers reached")
	// ErrViewerNotFound is returned when a viewer connection is not found.
	ErrViewerNotFound = errors.New("viewer not found")
	// ErrNoActiveBroadcast is returned when there is no active broadcast.
	ErrNoActiveBroadcast = errors.New("no active broadcast")
)
