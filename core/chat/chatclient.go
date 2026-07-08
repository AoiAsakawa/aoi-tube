package chat

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
	"golang.org/x/time/rate"

	"github.com/aoiasakawa/aoitube/auth"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/geoip"
	"github.com/gorilla/websocket"
)

// Client represents a single chat client.
type Client struct {
	mu          sync.RWMutex
	Id          uint `json:"-"`
	accessToken string
	conn        *websocket.Conn
	User        *user.User `json:"user"`
	server      *Server
	IPAddress   string `json:"-"`
	// Buffered channel of outbound messages.
	send          chan []byte
	rateLimiter   *rate.Limiter
	messageFilter *ChatMessageFilter
	timeoutTimer  *time.Timer
	inTimeout     bool
	Geo           *geoip.GeoDetails `json:"geo"`
	MessageCount  int               `json:"messageCount"`
	UserAgent     string            `json:"userAgent"`
	ConnectedAt   time.Time         `json:"connectedAt"`
}

type chatClientEvent struct {
	data   []byte
	client *Client
}

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	// Larger messages get thrown away.
	// Messages > *2 the socket gets closed.
	maxMessageSize = config.MaxSocketPayloadSize
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,

	// Check origin to prevent WebSocket hijacking attacks.
	// Allow connections from the configured server URL and localhost.
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Allow requests without Origin header (non-browser clients)
		}

		// Parse the origin
		originURL, err := url.Parse(origin)
		if err != nil {
			log.Debugf("Invalid origin URL: %s", origin)
			return false
		}

		// Always allow localhost for development
		if originURL.Hostname() == "localhost" || originURL.Hostname() == "127.0.0.1" {
			return true
		}

		// Get configured server URL
		serverURL := data.GetServerURL()
		if serverURL == "" {
			// If no server URL configured, allow all origins (for initial setup)
			return true
		}

		// Parse server URL
		configuredURL, err := url.Parse(serverURL)
		if err != nil {
			log.Warnf("Invalid server URL configuration: %s", serverURL)
			return true // Allow if config is invalid
		}

		// Check if origin host matches configured server host
		if strings.EqualFold(originURL.Host, configuredURL.Host) {
			return true
		}

		log.Debugf("WebSocket origin check failed: origin=%s, expected=%s", origin, serverURL)
		return false
	},
}

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

func (c *Client) sendConnectedClientInfo() {
	// The connected-client-info event is sent only to this client, so it may
	// carry the user's own linked-account handles. Broadcast events reuse
	// c.User and must not leak them, so attach the details to a copy rather
	// than mutating the shared user.
	u := c.User
	if u != nil && u.Authenticated {
		userWithAuth := *u
		userWithAuth.AuthDetails = auth.GetUserAuthDetails(u.ID)
		u = &userWithAuth
	}

	payload := events.ConnectedClientInfo{
		Event: events.Event{
			Type: events.ConnectedUserInfo,
		},
		User: u,
	}

	payload.SetDefaults()
	c.sendPayload(payload)
}

func (c *Client) readPump() {
	// Allow 3 messages every two seconds.
	limit := rate.Every(2 * time.Second / 3)
	c.rateLimiter = rate.NewLimiter(limit, 1)
	c.messageFilter = NewMessageFilter()

	defer func() {
		c.close()
	}()

	// If somebody is sending 2x the max message size they're likely a bad actor
	// and should be disconnected. Below we throw away messages > max size.
	c.conn.SetReadLimit(maxMessageSize * 2)

	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { _ = c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.close()
			}
			break
		}

		// Throw away messages greater than max message size.
		if len(message) > maxMessageSize {
			c.sendAction("Sorry, that message exceeded the maximum size and can't be delivered.")
			continue
		}

		// Check if this client is temporarily blocked from sending messages.
		if c.inTimeout {
			continue
		}

		// Guard against floods.
		if !c.passesRateLimit() {
			log.Warnln("Client", c.Id, c.User.DisplayName, "has exceeded the messaging rate limiting thresholds and messages are being rejected temporarily.")
			c.startChatRejectionTimeout()

			continue
		}

		// Check if this message passes the optional language filter
		if data.GetChatSlurFilterEnabled() && !c.messageFilter.Allow(string(message)) {
			c.sendAction("Sorry, that message contained language that is not allowed in this chat.")
			continue
		}

		message = bytes.TrimSpace(bytes.ReplaceAll(message, newline, space))
		c.handleEvent(message)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The server closed the channel.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				log.Debugln(err)
			}

			// Optimization: Send multiple events in a single websocket message.
			// Add queued chat messages to the current websocket message.
			c.mu.RLock()
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write(newline)
				_, _ = w.Write(<-c.send)
			}
			c.mu.RUnlock()

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleEvent(data []byte) {
	c.server.inbound <- chatClientEvent{data: data, client: c}
}

func (c *Client) close() {
	log.Traceln("client closed:", c.User.DisplayName, c.Id, c.IPAddress)

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.send != nil {
		_ = c.conn.Close()
		c.server.unregister <- c.Id
		close(c.send)
		c.send = nil
	}
}

func (c *Client) passesRateLimit() bool {
	// If spam rate limiting is disabled, or the user is a moderator, always
	// allow the message (upstream #3523/#3534).
	if !data.GetChatSpamProtectionEnabled() || c.User.IsModerator() {
		return true
	}

	return c.rateLimiter.Allow() && !c.inTimeout
}

func (c *Client) startChatRejectionTimeout() {
	if c.timeoutTimer != nil {
		return
	}

	c.inTimeout = true
	c.timeoutTimer = time.NewTimer(10 * time.Second)
	go func(c *Client) {
		for range c.timeoutTimer.C {
			c.inTimeout = false
			c.timeoutTimer = nil
		}
	}(c)

	c.sendAction("You are temporarily blocked from sending chat messages due to perceived flooding.")
}

func (c *Client) sendPayload(payload interface{}) {
	var data []byte
	data, err := json.Marshal(payload)
	if err != nil {
		log.Errorln(err)
		return
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.send != nil {
		c.send <- data
	}
}

func (c *Client) sendAction(message string) {
	clientMessage := events.ActionEvent{
		MessageEvent: events.MessageEvent{
			Body: message,
		},
	}
	clientMessage.SetDefaults()
	clientMessage.RenderBody()
	c.sendPayload(clientMessage.GetBroadcastPayload())
}
