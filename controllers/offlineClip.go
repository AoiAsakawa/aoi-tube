package controllers

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

const offlineClipPreviewFilename = "offline-clip-preview.mp4"

// GetOfflineClipPreview serves the currently-effective offline clip as a
// browser-playable MP4 for the admin settings preview. The runtime HLS path
// (/hls/0/offline.ts) is state-dependent — it does not exist while a stream
// is live and holds an fMP4 segment in LL-HLS mode — and MPEG-TS is not
// playable in a plain <video> element anyway, so this endpoint remuxes the
// custom clip (cached, refreshed on upload) or concatenates the built-in
// fMP4 init+media segments, which together form a valid fragmented MP4.
func GetOfflineClipPreview(w http.ResponseWriter, r *http.Request) {
	middleware.DisableCache(w)

	customClipPath := filepath.Join(config.DataDirectory, "offline.tsclip")
	if utils.DoesFileExists(customClipPath) {
		previewPath := filepath.Join(config.DataDirectory, offlineClipPreviewFilename)
		if isStale(customClipPath, previewPath) {
			if err := remuxClipToMP4(customClipPath, previewPath); err != nil {
				log.Warnln("unable to remux offline clip for preview:", err)
				serveDefaultOfflineClipPreview(w)
				return
			}
		}
		w.Header().Set("Content-Type", "video/mp4")
		http.ServeFile(w, r, previewPath)
		return
	}

	serveDefaultOfflineClipPreview(w)
}

func serveDefaultOfflineClipPreview(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "video/mp4")
	_, _ = w.Write(static.GetOfflineSegmentFmp4Init())
	_, _ = w.Write(static.GetOfflineSegmentFmp4())
}

// isStale reports whether the cached preview is missing or older than the
// uploaded clip it was generated from.
func isStale(sourcePath, previewPath string) bool {
	previewInfo, err := os.Stat(previewPath)
	if err != nil {
		return true
	}
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return true
	}
	return sourceInfo.ModTime().After(previewInfo.ModTime())
}

// remuxClipToMP4 converts the uploaded MPEG-TS offline clip into an MP4
// without re-encoding so the browser can play it directly.
func remuxClipToMP4(inputPath, outputPath string) error {
	ffmpegPath := utils.ValidatedFfmpegPath(data.GetFfMpegPath())

	// Use a unique temp file (not a fixed "<out>.tmp") so concurrent requests
	// during a stale cache can't interleave each other's ffmpeg writes; the
	// atomic rename then publishes whichever finishes.
	tmp, err := os.CreateTemp(filepath.Dir(outputPath), "offline-clip-*.mp4.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()

	cmd := exec.Command(ffmpegPath, // nolint: gosec
		"-hide_banner", "-loglevel", "error", "-y",
		"-i", inputPath,
		"-c", "copy",
		"-movflags", "+faststart",
		tmpPath,
	)
	if output, err := cmd.CombinedOutput(); err != nil {
		_ = os.Remove(tmpPath)
		log.Debugln("ffmpeg remux output:", string(output))
		return err
	}

	return utils.Move(tmpPath, outputPath)
}
