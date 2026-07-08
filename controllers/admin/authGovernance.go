package admin

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/auth"
	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/user"
	log "github.com/sirupsen/logrus"
)

// GetUserAuthEvents returns the append-only authentication audit log for a user
// (link / unlink / reactivate / overwrite / merge), newest first.
func GetUserAuthEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.GET {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		controllers.WriteSimpleResponse(w, false, "userId is required")
		return
	}
	controllers.WriteResponse(w, map[string]interface{}{
		"events": auth.GetAuthEvents(userID),
	})
}

// ReactivateUserAuth restores a specific revoked (unlinked) social account for a
// user — the operator's manual-recovery action, e.g. to give a buyer back access
// after an accidental unlink. Re-marks the user authenticated.
func ReactivateUserAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}
	var request struct {
		UserID string `json:"userId"`
		Type   string `json:"type"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if request.UserID == "" || request.Token == "" || !auth.IsKnownType(auth.Type(request.Type)) {
		controllers.WriteSimpleResponse(w, false, "userId, token and a valid type are required")
		return
	}

	if !auth.ReactivateAuth(request.UserID, request.Token, auth.Type(request.Type), auth.ActorAdmin) {
		controllers.WriteSimpleResponse(w, false, "no matching revoked account to reactivate")
		return
	}
	if err := user.SetUserAsAuthenticated(request.UserID); err != nil {
		log.Errorln("failed to re-mark user authenticated after reactivation:", err)
	}
	if err := chat.SendConnectedClientInfoToUser(request.UserID); err != nil {
		log.Debugln("unable to refresh connected client info after reactivation:", err)
	}

	controllers.WriteResponse(w, map[string]interface{}{
		"success":     true,
		"authDetails": auth.GetUserAuthDetailsForAdmin(request.UserID),
	})
}

// MergeUsers consolidates a source user's identity into a target user: auth
// links, audit history, access tokens and purchases move to the target, the
// target keeps one active account per provider, and the source is disabled.
// Used to reunite a person's duplicate identities under one account.
func MergeUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}
	var request struct {
		SourceUserID string `json:"sourceUserId"`
		TargetUserID string `json:"targetUserId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if request.SourceUserID == "" || request.TargetUserID == "" {
		controllers.WriteSimpleResponse(w, false, "sourceUserId and targetUserId are required")
		return
	}
	if request.SourceUserID == request.TargetUserID {
		controllers.WriteSimpleResponse(w, false, "cannot merge a user into itself")
		return
	}
	target := user.GetUserByID(request.TargetUserID)
	if target == nil {
		controllers.WriteSimpleResponse(w, false, "target user not found")
		return
	}
	source := user.GetUserByID(request.SourceUserID)
	if source == nil {
		controllers.WriteSimpleResponse(w, false, "source user not found")
		return
	}
	// Don't consolidate onto a disabled/merged-away target, and never merge
	// service (API) accounts.
	if target.DisabledAt != nil {
		controllers.WriteSimpleResponse(w, false, "target account is disabled")
		return
	}
	if user.IsAPIUser(request.SourceUserID) || user.IsAPIUser(request.TargetUserID) {
		controllers.WriteSimpleResponse(w, false, "cannot merge API accounts")
		return
	}

	// Atomic merge: auth links, purchases, tokens, messages, source-disable and
	// the audit markers all commit together (or roll back).
	if err := auth.MergeUsers(request.SourceUserID, request.TargetUserID, auth.ActorAdmin); err != nil {
		log.Errorln("failed to merge accounts:", err)
		controllers.WriteSimpleResponse(w, false, "failed to merge accounts")
		return
	}

	controllers.WriteSimpleResponse(w, true, "accounts merged")
}
