package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetFAQConfig returns the FAQ configuration.
func GetFAQConfig(w http.ResponseWriter, r *http.Request) {
	config := data.GetFAQConfig()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// SetFAQConfig sets the FAQ configuration.
func SetFAQConfig(w http.ResponseWriter, r *http.Request) {
	var config models.FAQConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := data.SetFAQConfig(config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]bool{"success": true}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
