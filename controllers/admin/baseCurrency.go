package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetBaseCurrency returns the server's base fiat currency configuration.
func GetBaseCurrency(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	controllers.WriteResponse(w, map[string]interface{}{
		"baseCurrency":        data.GetBaseCurrency(),
		"supportedCurrencies": models.SupportedFiatCurrencies,
	})
}

// SetBaseCurrency sets the server's base fiat currency.
func SetBaseCurrency(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	type request struct {
		BaseCurrency string `json:"baseCurrency"`
	}
	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if err := data.SetBaseCurrency(req.BaseCurrency); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "base currency updated")
}
