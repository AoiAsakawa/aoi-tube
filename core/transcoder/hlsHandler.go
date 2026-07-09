package transcoder

import (
	"path/filepath"
	"strings"

	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/models"
)

// HLSHandler gets told about available HLS playlists and segments.
type HLSHandler struct {
	Storage models.StorageProvider
}

// SegmentWritten is fired when a HLS segment is written to disk.
func (h *HLSHandler) SegmentWritten(localFilePath string) {
	// Under LL-HLS the live stream is served from RAM by gohlslib, so the only
	// on-disk live segments are the recording/thumbnail mirror output. Those must
	// NOT be pushed to the live storage provider — under S3 offload it would
	// upload segments to the live prefix that nothing ever serves. The offline
	// clip is the exception: it's served through the storage provider while the
	// stream is down, so it still needs to be stored.
	if !IsLLHLSEnabled() || strings.Contains(filepath.Base(localFilePath), "-offline-") {
		h.Storage.SegmentWritten(localFilePath)
	}

	// Copy the finished segment into the VOD recording immediately, and again
	// on every rewrite: ffmpeg PUT retries truncate and rewrite a segment in
	// place, and copying only from the playlist handler raced those rewrites
	// and archived corrupt segments. No-op when recording is inactive.
	recording.Get().HandleSegmentWritten(localFilePath)
}

// VariantPlaylistWritten is fired when a HLS variant playlist is written to disk.
func (h *HLSHandler) VariantPlaylistWritten(localFilePath string) {
	h.Storage.VariantPlaylistWritten(localFilePath)

	// Mirror the freshly-written segments into the VOD recording if one is
	// active. This runs off the encode path (the file receiver already
	// persisted the segment) and is a no-op when recording is disabled.
	recording.Get().HandleVariantPlaylist(localFilePath)
}

// MasterPlaylistWritten is fired when a HLS master playlist is written to disk.
func (h *HLSHandler) MasterPlaylistWritten(localFilePath string) {
	h.Storage.MasterPlaylistWritten(localFilePath)
}
