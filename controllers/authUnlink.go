package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/auth"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	log "github.com/sirupsen/logrus"
)

// UnlinkAuth removes a linked social account (by provider type) from the
// requesting user. When the last linked account is removed the user reverts to
// an anonymous session. Authenticated via the user access token (the middleware
// injects the resolved user), so a viewer can only unlink their own accounts.
func UnlinkAuth(u user.User, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var request struct {
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	authType := auth.Type(request.Type)
	if !auth.IsKnownType(authType) {
		WriteSimpleResponse(w, false, "unknown auth type")
		return
	}

	// Protect buyers: unlinking the last login method while holding a paid
	// archive would strand access to it on a new device (the purchase row
	// survives, but the user could no longer prove ownership). Require keeping
	// at least one login method in that case.
	if others, err := auth.CountOtherProviderAuths(u.ID, authType); err == nil && others == 0 {
		if hasPurchase, perr := data.UserHasPurchase(u.ID); perr == nil && hasPurchase {
			WriteResponse(w, map[string]interface{}{
				"success": false,
				"reason":  "has_purchases",
				"message": "cannot unlink your last login method while you have purchase history",
			})
			return
		}
	}

	remaining, err := auth.RevokeProviderAuth(u.ID, authType, auth.ActorSelf)
	if err != nil {
		log.Errorln("failed to unlink auth:", err)
		WriteSimpleResponse(w, false, "failed to unlink account")
		return
	}

	// Reverting to anonymous when nothing is linked keeps the authenticated
	// flag consistent with the (now empty) auth rows.
	if remaining == 0 {
		if err := user.SetUserAsUnauthenticated(u.ID); err != nil {
			log.Errorln("failed to clear authenticated status:", err)
		}
	}

	// Push refreshed connected-client-info so the viewer's own account panel
	// updates immediately (linked accounts and authenticated state).
	if err := chat.SendConnectedClientInfoToUser(u.ID); err != nil {
		log.Debugln("unable to refresh connected client info after unlink:", err)
	}

	WriteResponse(w, map[string]interface{}{
		"success":       true,
		"authenticated": remaining > 0,
		"authDetails":   auth.GetUserAuthDetails(u.ID),
	})
}
