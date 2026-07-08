package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
)

// GetFAQPublic returns the public FAQ information.
func GetFAQPublic(w http.ResponseWriter, r *http.Request) {
	config := data.GetFAQConfig()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
