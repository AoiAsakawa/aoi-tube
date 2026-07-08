package discord

import (
	"fmt"
	"net/http"

	"github.com/aoiasakawa/aoitube/auth"
	discord "github.com/aoiasakawa/aoitube/auth/discord"
	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/user"
	log "github.com/sirupsen/logrus"
)

// StartAuthFlow will begin the Discord OAuth flow for the current user.
func StartAuthFlow(u user.User, w http.ResponseWriter, r *http.Request) {
	type response struct {
		Redirect string `json:"redirect"`
	}

	accessToken := r.URL.Query().Get("accessToken")

	redirectURL, err := discord.StartAuthFlow(u.ID, accessToken, u.DisplayName)
	if err != nil {
		log.Errorln("Discord auth error:", err)
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	redirectResponse := response{
		Redirect: redirectURL.String(),
	}
	controllers.WriteResponse(w, redirectResponse)
}

// HandleRedirect will handle the redirect from Discord to continue the auth flow.
func HandleRedirect(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	errorParam := r.URL.Query().Get("error")

	if errorParam != "" {
		// User denied the auth
		msg := `認証がキャンセルされました。 <a href="/">戻る</a><hr/>`
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	if code == "" || state == "" {
		msg := `無効なリクエストです。 <a href="/">戻る</a><hr/>`
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	request, discordUser, err := discord.HandleCallback(code, state)
	if err != nil {
		log.Errorln("Discord callback error:", err)
		msg := fmt.Sprintf(`認証を完了できませんでした。<br>%s <a href="/">戻る</a><hr/>`, err.Error())
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	// Use Discord ID as auth token
	authToken := discordUser.ID

	// Check if a user with this auth already exists, if so, log them in.
	if existingUser := auth.GetUserByAuth(authToken, auth.Discord); existingUser != nil {
		log.Debugln("user with provided Discord auth already exists, logging them in")

		// Update the current user's access token to point to the existing user id.
		accessToken := request.CurrentAccessToken
		userID := existingUser.ID
		if err := user.SetAccessTokenToOwner(accessToken, userID); err != nil {
			controllers.WriteSimpleResponse(w, false, err.Error())
			return
		}

		// Update the authenticated timestamp
		if err := user.SetUserAsAuthenticated(userID); err != nil {
			log.Errorln(err)
		}

		if request.DisplayName != existingUser.DisplayName {
			loginMessage := fmt.Sprintf("**%s** is now authenticated as **%s**", request.DisplayName, existingUser.DisplayName)
			if err := chat.SendTranslatableSystemAction("userAuthenticatedAs", map[string]string{"newName": request.DisplayName, "oldName": existingUser.DisplayName}, loginMessage, true); err != nil {
				log.Errorln(err)
			}
		}

		http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
		return
	}

	// Get the current user
	u := user.GetUserByToken(request.CurrentAccessToken)
	if u == nil {
		msg := `ユーザーが見つかりませんでした。 <a href="/">戻る</a><hr/>`
		_ = controllers.WriteString(w, msg, http.StatusBadRequest)
		return
	}

	// Keep the existing random display name (don't change to Discord name)
	displayName := u.DisplayName

	// Save the Discord auth as new
	log.Debug("Discord auth does not already exist, saving it as a new one for the current user")
	if err := auth.AddAuth(u.ID, authToken, auth.Discord); err != nil {
		log.Errorln("Error saving Discord auth:", err)
		msg := fmt.Sprintf(`認証の保存に失敗しました。 <a href="/">戻る</a><hr/>`)
		_ = controllers.WriteString(w, msg, http.StatusInternalServerError)
		return
	}

	// Update the current user's authenticated flag so we can show it in the chat UI.
	if err := user.SetUserAsAuthenticated(u.ID); err != nil {
		log.Errorln("Error setting user as authenticated:", err)
	}

	// Send a system message about the authentication
	if err := chat.SendTranslatableSystemAction("userAuthenticatedWith", map[string]string{"name": displayName, "provider": "Discord"}, fmt.Sprintf("**%s** is now authenticated with Discord!", displayName), true); err != nil {
		log.Errorln(err)
	}

	// Redirect back to the site
	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}
