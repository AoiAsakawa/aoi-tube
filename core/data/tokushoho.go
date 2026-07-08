package data

import (
	"encoding/json"

	"github.com/aoiasakawa/aoitube/models"
)

const tokushohoKey = "tokushoho_info"

// GetTokushohoInfo returns the tokushoho (Act on Specified Commercial Transactions) information.
func GetTokushohoInfo() models.TokushohoInfo {
	data, err := _datastore.GetString(tokushohoKey)
	if err != nil || data == "" {
		return models.TokushohoInfo{}
	}

	var info models.TokushohoInfo
	if err := json.Unmarshal([]byte(data), &info); err != nil {
		return models.TokushohoInfo{}
	}
	return info
}

// SetTokushohoInfo saves the tokushoho information.
func SetTokushohoInfo(info models.TokushohoInfo) error {
	data, err := json.Marshal(info)
	if err != nil {
		return err
	}
	return _datastore.SetString(tokushohoKey, string(data))
}
