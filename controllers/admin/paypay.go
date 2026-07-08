package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetPayPayConfig returns the PayPay configuration.
func GetPayPayConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetPayPayConfig()

	// Mask the API secrets for security
	if config.APISecret != "" {
		config.APISecret = "********"
	}
	if config.SandboxAPISecret != "" {
		config.SandboxAPISecret = "********"
	}
	if config.ProductionAPISecret != "" {
		config.ProductionAPISecret = "********"
	}

	controllers.WriteResponse(w, config)
}

// SetPayPayConfig sets the PayPay configuration.
func SetPayPayConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.PayPayConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// If a secret comes back masked, keep the stored value
	existingConfig := data.GetPayPayConfig()
	if config.APISecret == "********" {
		config.APISecret = existingConfig.APISecret
	}
	if config.SandboxAPISecret == "********" {
		config.SandboxAPISecret = existingConfig.SandboxAPISecret
	}
	if config.ProductionAPISecret == "********" {
		config.ProductionAPISecret = existingConfig.ProductionAPISecret
	}

	if err := data.SetPayPayConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save PayPay config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "PayPay configuration saved")
}
