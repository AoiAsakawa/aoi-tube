package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetMetamaskConfig returns the Metamask configuration.
func GetMetamaskConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetMetamaskConfig()
	controllers.WriteResponse(w, config)
}

// SetMetamaskConfig saves the Metamask configuration.
func SetMetamaskConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.MetamaskConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	// Validate wallet address format (basic check)
	if config.Enabled && config.WalletAddress != "" {
		if !strings.HasPrefix(config.WalletAddress, "0x") || len(config.WalletAddress) != 42 {
			controllers.WriteSimpleResponse(w, false, "無効なウォレットアドレスです")
			return
		}
	}

	if err := data.SetMetamaskConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save metamask config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "Metamask設定を保存しました")
}
