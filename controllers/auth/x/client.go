package x

import (
	"fmt"
	"net/http"

	"github.com/aoiasakawa/aoitube/auth"
	xauth "github.com/aoiasakawa/aoitube/auth/x"
	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/user"
	log "github.com/sirupsen/logrus"
)

// StartAuthFlow will begin the X OAuth 2.0 flow for the current user.
func StartAuthFlow(u user.User, w http.ResponseWriter, r *http.Request) {
	type response struct {
		Redirect string `json:"redirect"`
	}

	accessToken := r.URL.Query().Get("accessToken")

	redirectURL, err := xauth.StartAuthFlow(u.ID, accessToken, u.DisplayName)
	if err != nil {
		log.Errorln("X auth error:", err)
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	redirectResponse := response{
		Redirect: redirectURL.String(),
	}
	controllers.WriteResponse(w, redirectResponse)
}

// HandleRedirect will handle the redirect from X to continue the auth flow.
func HandleRedirect(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	errorParam := r.URL.Query().Get("error")

	if errorParam != "" || code == "" || state == "" {
		// User denied the auth or error occurred
		msg := `認証がキャンセルされました。 <a href="/">戻る</a><hr/>`
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	request, xUser, err := xauth.HandleCallback(code, state)
	if err != nil {
		log.Errorln("X callback error:", err)
		msg := `認証を完了できませんでした。 <a href="/">戻る</a><hr/>`
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	// Use X ID as auth token
	authToken := "x:" + xUser.ID

	// Check if a user with this auth already exists, if so, log them in.
	if u := auth.FindLinkedUser(authToken, auth.X, auth.ActorSelf); u != nil {
		// Handle existing auth.
		log.Debugln("user with provided X auth already exists, logging them in")

		// Update the current user's access token to point to the existing user id.
		accessToken := request.CurrentAccessToken
		userID := u.ID
		if err := user.SetAccessTokenToOwner(accessToken, userID); err != nil {
			controllers.WriteSimpleResponse(w, false, err.Error())
			return
		}

		// Update the authenticated timestamp
		if err := user.SetUserAsAuthenticated(userID); err != nil {
			log.Errorln(err)
		}

		// Refresh the stored handle (fills it in for accounts linked before the
		// handle column existed, and keeps it current if the @name changed) and
		// collapse any duplicate X links down to this one account.
		auth.UpdateAuthHandle(authToken, auth.X, "@"+xUser.Username)
		auth.PruneDuplicateProviderAuths(userID, authToken, auth.X, auth.ActorSelf)

		if request.DisplayName != u.DisplayName {
			loginMessage := fmt.Sprintf("**%s** is now authenticated as **%s**", request.DisplayName, u.DisplayName)
			if err := chat.SendTranslatableSystemAction("userAuthenticatedAs", map[string]string{"newName": request.DisplayName, "oldName": u.DisplayName}, loginMessage, true); err != nil {
				log.Errorln(err)
			}
		}

		http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
		return
	}

	// Otherwise, save this as new auth.
	log.Debug("X auth does not already exist, saving it as a new one for the current user")
	if err := auth.SetSoleProviderAuth(request.UserID, authToken, auth.X, "@"+xUser.Username, auth.ActorSelf); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Update the current user's authenticated flag so we can show it in the chat UI.
	if err := user.SetUserAsAuthenticated(request.UserID); err != nil {
		log.Errorln(err)
	}

	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}
