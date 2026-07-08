package controllers

import (
	"fmt"
	"io"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
)

var staticServer = http.FileServer(http.FS(static.GetWeb()))

// serveWeb will serve web assets. Extensionless routes with no matching
// static file fall back to the app shell so client-side routing can take
// over after the SPA migration; with the current per-page static export
// every real page matches a file, so the fallback only affects true 404s.
func serveWeb(w http.ResponseWriter, r *http.Request) {
	requestPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

	// Any request that resolves to an HTML shell (extensionless directory
	// route like /admin, or an explicit .html) must never be cached: shells
	// reference hashed asset bundles, and a cached shell keeps pointing
	// browsers at stale bundles after every deploy.
	if strings.HasSuffix(requestPath, ".html") ||
		(filepath.Ext(requestPath) == "" && webPathExists(requestPath)) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	}

	if requestPath != "" && filepath.Ext(requestPath) == "" && !webPathExists(requestPath) {
		// Admin routes get the admin shell so its router handles the path.
		if strings.HasPrefix(requestPath, "admin") && serveWebFile(w, "admin/index.html") {
			return
		}

		nonceRandom, _ := utils.GenerateRandomString(5)
		middleware.SetHeaders(w, fmt.Sprintf("nonce-%s", nonceRandom))
		renderIndexHtml(w, nonceRandom)
		return
	}

	staticServer.ServeHTTP(w, r)
}

// webPathExists reports whether the embedded web filesystem can serve the
// given path directly or as a directory-style route with an index.html.
func webPathExists(p string) bool {
	webFS := static.GetWeb()
	if f, err := webFS.Open(p); err == nil {
		_ = f.Close()
		return true
	}
	if f, err := webFS.Open(path.Join(p, "index.html")); err == nil {
		_ = f.Close()
		return true
	}
	return false
}

// serveWebFile writes a file from the embedded web filesystem as HTML.
// Returns false when the file does not exist.
func serveWebFile(w http.ResponseWriter, p string) bool {
	webFS := static.GetWeb()
	f, err := webFS.Open(p)
	if err != nil {
		return false
	}
	defer f.Close()

	// The HTML shells must never be cached: they reference hashed asset
	// bundles, and a cached shell keeps pointing browsers at stale bundles
	// after every deploy (forcing users to hard-refresh).
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.Copy(w, f)
	return true
}
