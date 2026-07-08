package transcoder

import (
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/models"
)

// HLSHandler gets told about available HLS playlists and segments.
type HLSHandler struct {
	Storage models.StorageProvider
}

// SegmentWritten is fired when a HLS segment is written to disk.
func (h *HLSHandler) SegmentWritten(localFilePath string) {
	h.Storage.SegmentWritten(localFilePath)

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
