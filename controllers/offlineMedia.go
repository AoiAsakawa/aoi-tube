package controllers

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// GetOfflineMedia will return the configured offline media (image or mp4) as a response.
// If no offline media is configured it returns 404.
func GetOfflineMedia(w http.ResponseWriter, r *http.Request) {
	filename := data.GetOfflineMediaPath()
	if filename == "" {
		http.NotFound(w, r)
		return
	}

	mediaPath := filepath.Join(config.DataDirectory, filename)
	mediaBytes, err := os.ReadFile(mediaPath) //nolint: gosec
	if err != nil {
		http.NotFound(w, r)
		return
	}

	contentType := "application/octet-stream"
	switch filepath.Ext(filename) {
	case ".mp4":
		contentType = "video/mp4"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	case ".webp":
		contentType = "image/webp"
	}

	cacheTime := utils.GetCacheDurationSecondsForPath(mediaPath)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(mediaBytes)))
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(cacheTime))

	if _, err := w.Write(mediaBytes); err != nil {
		log.Println("unable to write offline media")
	}
}
