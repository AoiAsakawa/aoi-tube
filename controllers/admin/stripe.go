package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetStripeConfig returns the Stripe configuration.
func GetStripeConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetStripeConfig()

	// Mask the secret keys for security
	if config.TestSecretKey != "" {
		config.TestSecretKey = "********"
	}
	if config.LiveSecretKey != "" {
		config.LiveSecretKey = "********"
	}
	if config.TestWebhookSecret != "" {
		config.TestWebhookSecret = "********"
	}
	if config.LiveWebhookSecret != "" {
		config.LiveWebhookSecret = "********"
	}

	controllers.WriteResponse(w, config)
}

// SetStripeConfig sets the Stripe configuration.
func SetStripeConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.StripeConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// If the secret keys are masked, don't update them
	existingConfig := data.GetStripeConfig()

	if config.TestSecretKey == "********" {
		config.TestSecretKey = existingConfig.TestSecretKey
	}
	if config.LiveSecretKey == "********" {
		config.LiveSecretKey = existingConfig.LiveSecretKey
	}
	if config.TestWebhookSecret == "********" {
		config.TestWebhookSecret = existingConfig.TestWebhookSecret
	}
	if config.LiveWebhookSecret == "********" {
		config.LiveWebhookSecret = existingConfig.LiveWebhookSecret
	}

	if err := data.SetStripeConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save Stripe config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "Stripe configuration saved")
}
