package controllers

import (
	"net/http"
	"strconv"

	"github.com/aoiasakawa/aoitube/core/data"
)

// GetTopSupporters returns the public supporter ranking: the highest-spending
// named viewers by total Super Chat + effect amount. Read-only and
// unauthenticated (the same names already appear publicly in chat); archive
// purchases and anonymous/test donations are excluded.
func GetTopSupporters(w http.ResponseWriter, r *http.Request) {
	limit := 10
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	supporters, err := data.GetTopSupporters(limit)
	if err != nil {
		InternalErrorHandler(w, err)
		return
	}

	WriteResponse(w, map[string]interface{}{
		"supporters":   supporters,
		"baseCurrency": data.GetBaseCurrency(),
	})
}
