package controllers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
)

// GetNotificationThumbnail will return the notification thumbnail image.
func GetNotificationThumbnail(w http.ResponseWriter, r *http.Request) {
	filename := data.GetNotificationThumbnailPath()
	if filename == "" {
		// No custom notification thumbnail set, fall back to logo
		GetCompatibleLogo(w, r)
		return
	}

	mediaPath := filepath.Join(config.DataDirectory, filename)
	if _, err := os.Stat(mediaPath); os.IsNotExist(err) {
		// File doesn't exist, fall back to logo
		GetCompatibleLogo(w, r)
		return
	}

	// Set content type based on extension
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".gif":
		w.Header().Set("Content-Type", "image/gif")
	case ".webp":
		w.Header().Set("Content-Type", "image/webp")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	// Allow caching for external services like Discord
	w.Header().Set("Cache-Control", "public, max-age=3600")

	http.ServeFile(w, r, mediaPath)
}
