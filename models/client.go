package models

import (
	"time"

	"github.com/aoiasakawa/aoitube/geoip"
)

// ConnectedClientsResponse is the response of the currently connected chat clients.
type ConnectedClientsResponse struct {
	Clients []Client `json:"clients"`
}

// Client represents a single chat client.
type Client struct {
	ConnectedAt  time.Time         `json:"connectedAt"`
	LastSeen     time.Time         `json:"-"`
	MessageCount int               `json:"messageCount"`
	UserAgent    string            `json:"userAgent"`
	IPAddress    string            `json:"ipAddress"`
	Username     *string           `json:"username"`
	ClientID     string            `json:"clientID"`
	Geo          *geoip.GeoDetails `json:"geo"`
}
