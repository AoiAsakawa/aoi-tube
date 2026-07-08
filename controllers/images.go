package controllers

import (
	"net/http"
	"path/filepath"
	"time"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
	"github.com/jellydator/ttlcache/v3"
)

const (
	contentTypeJPEG = "image/jpeg"
	contentTypeGIF  = "image/gif"
)

// previewThumbCache keeps the thumbnail and preview images in memory for a
// short time so busy landing pages don't hit the disk per request
// (upstream #3462). Capacity 2: one slot each for thumbnail and preview.
var previewThumbCache = ttlcache.New(
	ttlcache.WithTTL[string, []byte](15*time.Second),
	ttlcache.WithCapacity[string, []byte](2),
	ttlcache.WithDisableTouchOnHit[string, []byte](),
)

// getCachedImage returns the image bytes from the in-memory cache, falling
// back to disk and repopulating the cache entry.
func getCachedImage(imagePath string) ([]byte, error) {
	if item := previewThumbCache.Get(imagePath); item != nil {
		return item.Value(), nil
	}

	imageBytes, err := getImage(imagePath)
	if err != nil {
		return nil, err
	}
	previewThumbCache.Set(imagePath, imageBytes, 15*time.Second)
	return imageBytes, nil
}

// GetThumbnail will return the thumbnail image as a response.
func GetThumbnail(w http.ResponseWriter, r *http.Request) {
	// Don't leak stream content (test mode or auth-required streams) —
	// unauthorized viewers get the logo instead.
	if !canViewStream(r) {
		GetLogo(w, r)
		return
	}

	imageFilename := "thumbnail.jpg"
	imagePath := filepath.Join(config.TempDir, imageFilename)

	if !utils.DoesFileExists(imagePath) {
		// While live but before the first thumbnail exists (~20s), serve the
		// operator-uploaded live poster (falling back to the built-in "LIVE"
		// placeholder) instead of the logo, so the player poster doesn't show
		// branding as if it were content.
		if core.GetStatus().Online {
			if posterPath := data.GetLivePosterPath(); posterPath != "" {
				custom := filepath.Join("data", filepath.Base(posterPath))
				if imageBytes, err := getCachedImage(custom); err == nil {
					contentType := contentTypeJPEG
					if filepath.Ext(custom) == ".png" {
						contentType = "image/png"
					} else if filepath.Ext(custom) == ".gif" {
						contentType = contentTypeGIF
					}
					writeBytesAsImage(imageBytes, contentType, w, 5)
					return
				}
			}
			writeBytesAsImage(static.GetLivePlaceholder(), contentTypeJPEG, w, 5)
			return
		}
		GetLogo(w, r)
		return
	}

	imageBytes, err := getCachedImage(imagePath)
	if err != nil {
		GetLogo(w, r)
		return
	}

	cacheTime := utils.GetCacheDurationSecondsForPath(imagePath)
	writeBytesAsImage(imageBytes, contentTypeJPEG, w, cacheTime)
}

// GetLivePosterImage serves the currently-effective live poster: the
// operator-uploaded image when set, otherwise the built-in "LIVE" placeholder.
// Used by the player poster fallback and the admin settings preview.
func GetLivePosterImage(w http.ResponseWriter, r *http.Request) {
	if posterPath := data.GetLivePosterPath(); posterPath != "" {
		custom := filepath.Join("data", filepath.Base(posterPath))
		if imageBytes, err := getCachedImage(custom); err == nil {
			contentType := contentTypeJPEG
			switch filepath.Ext(custom) {
			case ".png":
				contentType = "image/png"
			case ".gif":
				contentType = contentTypeGIF
			}
			writeBytesAsImage(imageBytes, contentType, w, 5)
			return
		}
	}
	writeBytesAsImage(static.GetLivePlaceholder(), contentTypeJPEG, w, 5)
}

// GetPreview will return the preview gif as a response.
func GetPreview(w http.ResponseWriter, r *http.Request) {
	// See GetThumbnail: don't leak stream content.
	if !canViewStream(r) {
		GetLogo(w, r)
		return
	}

	imageFilename := "preview.gif"
	imagePath := filepath.Join(config.TempDir, imageFilename)

	if !utils.DoesFileExists(imagePath) {
		GetLogo(w, r)
		return
	}

	imageBytes, err := getCachedImage(imagePath)
	if err != nil {
		GetLogo(w, r)
		return
	}

	cacheTime := utils.GetCacheDurationSecondsForPath(imagePath)
	writeBytesAsImage(imageBytes, contentTypeGIF, w, cacheTime)
}
