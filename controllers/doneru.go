package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
)

// GetDoneruStatus returns Doneru enabled status and config for public.
func GetDoneruStatus(w http.ResponseWriter, r *http.Request) {
	config := data.GetDoneruConfig()
	WriteResponse(w, map[string]interface{}{
		"enabled":     config.Enabled,
		"creatorUrl":  config.CreatorURL,
		"displayName": config.DisplayName,
	})
}
