package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/router/middleware"
)

// GetWebManifest returns the web app manifest built from the configured
// server name and logo so installed/pinned instances carry the site's own
// branding instead of the AoiTube defaults.
func GetWebManifest(w http.ResponseWriter, r *http.Request) {
	name := data.GetServerName()
	if name == "" {
		name = "AoiTube"
	}

	manifest := map[string]interface{}{
		"name":             name,
		"short_name":       name,
		"start_url":        "/",
		"display":          "standalone",
		"background_color": "#0d0d14",
		"icons": []map[string]string{
			{"src": "/logo/external", "sizes": "any", "type": "image/png"},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)
	_ = json.NewEncoder(w).Encode(manifest)
}
