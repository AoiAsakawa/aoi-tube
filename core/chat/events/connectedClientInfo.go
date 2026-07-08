package events

import "github.com/aoiasakawa/aoitube/core/user"

// ConnectedClientInfo represents the information about a connected client.
type ConnectedClientInfo struct {
	Event
	User *user.User `json:"user"`
}
