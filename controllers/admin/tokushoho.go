package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

// GetTokushohoInfo returns the tokushoho information for admin.
func GetTokushohoInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	info := data.GetTokushohoInfo()
	controllers.WriteResponse(w, info)
}

// SetTokushohoInfo saves the tokushoho information.
func SetTokushohoInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var info models.TokushohoInfo
	if err := json.NewDecoder(r.Body).Decode(&info); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	if err := data.SetTokushohoInfo(info); err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to save tokushoho info: "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "特定商取引法に基づく表記を保存しました")
}
