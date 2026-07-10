package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/router/middleware"
)

// GetMyWallet returns the authenticated viewer's coin balance, recent ledger,
// and the coin feature's public config (enabled + charge bonus + base currency).
// Coins are a per-account prepaid balance, so this requires a logged-in user
// (wired via RequireUserAccessToken).
func GetMyWallet(u user.User, w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	balance, err := data.GetWalletBalance(u.ID)
	if err != nil {
		WriteSimpleResponse(w, false, "unable to read wallet")
		return
	}
	ledger, err := data.GetWalletLedger(u.ID, 50)
	if err != nil {
		WriteSimpleResponse(w, false, "unable to read wallet history")
		return
	}

	WriteResponse(w, map[string]interface{}{
		"enabled":      data.GetCoinWalletEnabled(),
		"balance":      balance,
		"bonusPercent": data.GetCoinChargeBonusPercent(),
		"baseCurrency": data.GetBaseCurrency(),
		"ledger":       ledger,
	})
}
