package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// ExternalGetChatMessages gets all of the chat messages.
func ExternalGetChatMessages(integration user.ExternalAPIUser, w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	getChatMessages(w, r)
}

// GetChatMessages gets all of the chat messages.
func GetChatMessages(u user.User, w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	getChatMessages(w, r)
}

func getChatMessages(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		messages := chat.GetChatHistory()

		if err := json.NewEncoder(w).Encode(messages); err != nil {
			log.Debugln(err)
		}
	default:
		w.WriteHeader(http.StatusNotImplemented)
		if err := json.NewEncoder(w).Encode(j{"error": "method not implemented (PRs are accepted)"}); err != nil {
			InternalErrorHandler(w, err)
		}
	}
}

// WancommeComment represents a comment in OneComme format.
type WancommeComment struct {
	ID           string              `json:"id"`
	Service      string              `json:"service"`
	Name         string              `json:"name"`
	Comment      string              `json:"comment"`
	ProfileImage string              `json:"profileImage"`
	Timestamp    int64               `json:"timestamp"`
	Data         WancommeCommentData `json:"data"`
}

// WancommeCommentData holds additional data for a OneComme comment.
type WancommeCommentData struct {
	DisplayColor int    `json:"displayColor"`
	UserID       string `json:"userId"`
}

// WancommeResponse represents the response format for OneComme.
type WancommeResponse struct {
	Comments []WancommeComment `json:"comments"`
}

// GetPublicChatMessages gets all chat messages without authentication.
// This endpoint is for external tools like comment viewers (OneComme).
func GetPublicChatMessages(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	messages := chat.GetChatHistory()

	// Convert to OneComme format
	comments := make([]WancommeComment, 0)
	for _, msg := range messages {
		// Try to cast to UserMessageEvent (regular chat messages)
		if userMsg, ok := msg.(events.UserMessageEvent); ok {
			comment := WancommeComment{
				ID:           userMsg.ID,
				Service:      "aoitube",
				Name:         userMsg.User.DisplayName,
				Comment:      userMsg.Body,
				ProfileImage: "",
				Timestamp:    userMsg.Timestamp.UnixMilli(),
				Data: WancommeCommentData{
					DisplayColor: userMsg.User.DisplayColor,
					UserID:       userMsg.User.ID,
				},
			}
			comments = append(comments, comment)
		}
	}

	response := WancommeResponse{
		Comments: comments,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Debugln(err)
	}
}

// RegisterAnonymousChatUser will register a new user.
func RegisterAnonymousChatUser(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	if r.Method == "OPTIONS" {
		// All OPTIONS requests should have a wildcard CORS header.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	type registerAnonymousUserRequest struct {
		DisplayName string `json:"displayName"`
	}

	type registerAnonymousUserResponse struct {
		ID          string `json:"id"`
		AccessToken string `json:"accessToken"`
		DisplayName string `json:"displayName"`
	}

	decoder := json.NewDecoder(r.Body)
	var request registerAnonymousUserRequest
	if err := decoder.Decode(&request); err != nil { //nolint
		// this is fine. register a new user anyway.
	}

	if request.DisplayName == "" {
		request.DisplayName = r.Header.Get("X-Forwarded-User")
	}

	proposedNewDisplayName := utils.MakeSafeStringOfLength(request.DisplayName, config.MaxChatDisplayNameLength)
	newUser, accessToken, err := user.CreateAnonymousUser(proposedNewDisplayName)
	if err != nil {
		WriteSimpleResponse(w, false, err.Error())
		return
	}

	response := registerAnonymousUserResponse{
		ID:          newUser.ID,
		AccessToken: accessToken,
		DisplayName: newUser.DisplayName,
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)

	WriteResponse(w, response)
}
