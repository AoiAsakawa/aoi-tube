package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
)

// GetTokushohoPublic returns the tokushoho information for public display.
// Only returns data if tokushoho is enabled.
func GetTokushohoPublic(w http.ResponseWriter, r *http.Request) {
	if r.Method != GET {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	info := data.GetTokushohoInfo()

	// Always return the info (with enabled flag)
	// Frontend will check the enabled flag
	WriteResponse(w, info)
}
