package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
)

// IndexHandler handles the default index route.
func IndexHandler(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	isIndexRequest := r.URL.Path == "/" || filepath.Base(r.URL.Path) == "index.html" || filepath.Base(r.URL.Path) == ""

	if utils.IsUserAgentAPlayer(r.UserAgent()) && isIndexRequest {
		http.Redirect(w, r, "/hls/stream.m3u8", http.StatusTemporaryRedirect)
		return
	}

	// Set a cache control max-age header
	middleware.SetCachingHeaders(w, r)

	nonceRandom, _ := utils.GenerateRandomString(5)

	// Set our global HTTP headers
	middleware.SetHeaders(w, fmt.Sprintf("nonce-%s", nonceRandom))

	if isIndexRequest {
		// The HTML shell must never be cached: it references hashed asset
		// bundles, and a cached shell keeps pointing browsers at stale
		// bundles after every deploy.
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		renderIndexHtml(w, nonceRandom)
		return
	}

	serveWeb(w, r)
}

func renderIndexHtml(w http.ResponseWriter, nonce string) {
	type serverSideContent struct {
		Name             string
		Summary          string
		RequestedURL     string
		TagsString       string
		ThumbnailURL     string
		Thumbnail        string
		Image            string
		StatusJSON       string
		ServerConfigJSON string
		Nonce            string
		LogoUniqueness   string
	}

	status := getStatusResponse()
	sb, err := json.Marshal(status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	config := getConfigResponse()
	cb, err := json.Marshal(config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Link-preview image (og:image). Prefer the operator's notification
	// thumbnail; fall back to the live thumbnail/logo. The uniqueness value
	// is appended as a cache buster: X/Discord cache card images by URL, so
	// uploads (and resets) must change the URL to ever show up in previews.
	previewImage := "/thumbnail.jpg"
	if data.GetNotificationThumbnailPath() != "" {
		previewImage = "/notification-thumbnail"
	}
	if u := data.GetNotificationThumbnailUniquenessString(); u != "" {
		previewImage += "?u=" + u
	}

	content := serverSideContent{
		Name:             data.GetServerName(),
		Summary:          data.GetServerSummary(),
		RequestedURL:     data.GetServerURL(),
		TagsString:       strings.Join(data.GetServerMetadataTags(), ","),
		ThumbnailURL:     previewImage,
		Thumbnail:        previewImage,
		Image:            "/logo/external",
		StatusJSON:       string(sb),
		ServerConfigJSON: string(cb),
		Nonce:            nonce,
		LogoUniqueness:   data.GetLogoUniquenessString(),
	}

	index, err := static.GetWebIndexTemplate()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := index.Execute(w, content); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
