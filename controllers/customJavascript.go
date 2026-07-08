package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
)

// ServeCustomJavascript will serve optional custom Javascript.
func ServeCustomJavascript(w http.ResponseWriter, r *http.Request) {
	js := data.GetCustomJavascript()
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	_, _ = w.Write([]byte(js))
}
