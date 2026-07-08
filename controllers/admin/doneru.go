package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetDoneruConfig returns the Doneru configuration.
func GetDoneruConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	config := data.GetDoneruConfig()
	controllers.WriteResponse(w, config)
}

// SetDoneruConfig sets the Doneru configuration.
func SetDoneruConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var config models.DoneruConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if err := data.SetDoneruConfig(config); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save Doneru config: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "Doneru configuration saved")
}
