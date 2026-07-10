package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
)

// GetCoinWalletStats returns the total outstanding coin liability (sum of every
// user's balance) — the basis for prepaid-instrument outstanding-balance
// reporting — plus the base currency coins are denominated against.
func GetCoinWalletStats(w http.ResponseWriter, r *http.Request) {
	outstanding, err := data.GetTotalOutstandingCoins()
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to read wallet stats")
		return
	}
	controllers.WriteResponse(w, map[string]interface{}{
		"outstanding":  outstanding,
		"baseCurrency": data.GetBaseCurrency(),
	})
}

// GetUserCoinWallet returns a user's balance and recent ledger for the admin
// panel (lookup by user id).
func GetUserCoinWallet(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		controllers.WriteSimpleResponse(w, false, "userId required")
		return
	}
	u := user.GetUserByID(userID)
	if u == nil {
		controllers.WriteSimpleResponse(w, false, "user not found")
		return
	}
	balance, err := data.GetWalletBalance(userID)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to read balance")
		return
	}
	ledger, _ := data.GetWalletLedger(userID, 100)
	controllers.WriteResponse(w, map[string]interface{}{
		"userId":      userID,
		"displayName": u.DisplayName,
		"balance":     balance,
		"ledger":      ledger,
	})
}

type adjustUserCoinsRequest struct {
	UserID string `json:"userId"`
	Delta  int64  `json:"delta"`
	Note   string `json:"note"`
}

// AdjustUserCoins applies an operator grant (delta > 0) or deduction (delta < 0)
// to a user's coin balance, recorded as an admin_adjust ledger entry. A
// deduction that would overdraw is refused.
func AdjustUserCoins(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}
	var req adjustUserCoinsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if req.UserID == "" || req.Delta == 0 {
		controllers.WriteSimpleResponse(w, false, "userId and a non-zero delta are required")
		return
	}
	if user.GetUserByID(req.UserID) == nil {
		controllers.WriteSimpleResponse(w, false, "user not found")
		return
	}

	ok, err := data.AdminAdjustWallet(req.UserID, req.Delta, req.Note)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "failed to adjust balance")
		return
	}
	if !ok {
		controllers.WriteSimpleResponse(w, false, "deduction would overdraw the balance")
		return
	}

	balance, _ := data.GetWalletBalance(req.UserID)
	controllers.WriteResponse(w, map[string]interface{}{"success": true, "balance": balance})
}
