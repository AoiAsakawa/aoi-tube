package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetPayPalConfig returns the PayPal configuration.
func GetPayPalConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetPayPalConfig()

	// Mask every secret before sending the config to the admin browser.
	const masked = "********"
	if config.ClientSecret != "" {
		config.ClientSecret = masked
	}
	if config.SandboxClientSecret != "" {
		config.SandboxClientSecret = masked
	}
	if config.ProductionClientSecret != "" {
		config.ProductionClientSecret = masked
	}

	controllers.WriteResponse(w, config)
}

// SetPayPalConfig sets the PayPal configuration.
func SetPayPalConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.PayPalConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// If any secret came back masked, keep the stored value instead of overwriting
	// it with the "********" placeholder.
	const masked = "********"
	existingConfig := data.GetPayPalConfig()
	if config.ClientSecret == masked {
		config.ClientSecret = existingConfig.ClientSecret
	}
	if config.SandboxClientSecret == masked {
		config.SandboxClientSecret = existingConfig.SandboxClientSecret
	}
	if config.ProductionClientSecret == masked {
		config.ProductionClientSecret = existingConfig.ProductionClientSecret
	}

	if err := data.SetPayPalConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save PayPal config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "PayPal configuration saved")
}
