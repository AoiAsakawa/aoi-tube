package controllers

import (
	"net/http"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
)

// isAdminRequest reports whether the request carries valid admin Basic auth
// (injected by the admin reverse proxy).
func isAdminRequest(r *http.Request) bool {
	username, password, ok := r.BasicAuth()
	return ok && username == "admin" && data.VerifyAdminPassword(password)
}

// requestChatUser resolves the chat user attached to the request, if any.
func requestChatUser(r *http.Request) *user.User {
	token := r.URL.Query().Get("accessToken")
	if token == "" {
		return nil
	}
	return user.GetUserByToken(token)
}

// canViewSilentStream reports whether this request may see the stream while
// silent (test) stream mode is enabled. Admins authenticate with Basic auth;
// moderators authenticate with their chat access token. When silent mode is
// off everyone may view.
func canViewSilentStream(r *http.Request) bool {
	if !data.GetSilentStreamMode() {
		return true
	}

	if isAdminRequest(r) {
		return true
	}

	if u := requestChatUser(r); u != nil && u.IsEnabled() && u.IsModerator() {
		return true
	}

	return false
}

// canViewStream reports whether this request may access stream content
// (playback, thumbnails, previews). Two gates apply on top of each other:
//   - silent (test) stream mode: admins and moderators only
//   - required social auth: socially-authenticated users, moderators, admins
func canViewStream(r *http.Request) bool {
	if !canViewSilentStream(r) {
		return false
	}

	if data.GetSocialAuthRequired() {
		if isAdminRequest(r) {
			return true
		}
		u := requestChatUser(r)
		return u != nil && u.IsEnabled() && (u.Authenticated || u.IsModerator())
	}

	return true
}
