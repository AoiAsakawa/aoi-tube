package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetKofiConfig returns the Ko-fi configuration.
func GetKofiConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetKofiConfig()

	// Mask the verification token (a shared secret) before returning to the browser.
	if config.VerificationToken != "" {
		config.VerificationToken = "********"
	}

	controllers.WriteResponse(w, config)
}

// SetKofiConfig sets the Ko-fi configuration.
func SetKofiConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.KofiConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// If the verification token came back masked, keep the stored value.
	if config.VerificationToken == "********" {
		existingConfig := data.GetKofiConfig()
		config.VerificationToken = existingConfig.VerificationToken
	}

	if err := data.SetKofiConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save Ko-fi config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "Ko-fi configuration saved")
}
