package chat

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/gorilla/websocket"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/geoip"
	"github.com/aoiasakawa/aoitube/utils"
)

var _server *Server

// chatPartMessageDelay is how long to wait after a disconnect before sending
// a part message, so quick reconnects (e.g. page reloads) don't spam chat.
const chatPartMessageDelay = 10 * time.Second

// Server represents an instance of the chat server.
type Server struct {
	mu                       sync.RWMutex
	seq                      uint
	clients                  map[uint]*Client
	maxSocketConnectionLimit int64

	// send outbound message payload to all clients
	outbound chan []byte

	// receive inbound message payload from all clients
	inbound chan chatClientEvent

	// unregister requests from clients.
	unregister chan uint // the ChatClient id

	geoipClient *geoip.Client

	// a map of user IDs and timers that fire for chat part messages.
	userPartedTimers map[string]*time.Timer
}

// NewChat will return a new instance of the chat server.
func NewChat() *Server {
	maximumConcurrentConnectionLimit := getMaximumConcurrentConnectionLimit()
	setSystemConcurrentConnectionLimit(maximumConcurrentConnectionLimit)

	server := &Server{
		clients:                  map[uint]*Client{},
		outbound:                 make(chan []byte),
		inbound:                  make(chan chatClientEvent),
		unregister:               make(chan uint),
		maxSocketConnectionLimit: maximumConcurrentConnectionLimit,
		geoipClient:              geoip.NewClient(),
		userPartedTimers:         map[string]*time.Timer{},
	}

	return server
}

// Run will start the chat server.
func (s *Server) Run() {
	for {
		select {
		case clientID := <-s.unregister:
			if client, ok := s.clients[clientID]; ok {
				s.mu.Lock()
				delete(s.clients, clientID)
				s.mu.Unlock()
				s.handleClientDisconnected(client)
			}

		case message := <-s.inbound:
			s.eventReceived(message)
		}
	}
}

// Addclient registers new connection as a User.
func (s *Server) Addclient(conn *websocket.Conn, user *user.User, accessToken string, userAgent string, ipAddress string, countryHint string) *Client {
	client := &Client{
		server:      s,
		conn:        conn,
		User:        user,
		IPAddress:   ipAddress,
		accessToken: accessToken,
		send:        make(chan []byte, 256),
		UserAgent:   userAgent,
		ConnectedAt: time.Now(),
	}

	shouldSendJoinedMessages := data.GetChatJoinMessagesEnabled()

	s.mu.Lock()
	{
		// If there is a pending part-message timer for this user then cancel
		// it and skip the joined message — they reconnected quickly.
		if timer, ok := s.userPartedTimers[user.ID]; ok {
			timer.Stop()
			delete(s.userPartedTimers, user.ID)
			shouldSendJoinedMessages = false
		}

		client.Id = s.seq
		s.clients[client.Id] = client
		s.seq++
	}
	s.mu.Unlock()

	log.Traceln("Adding client", client.Id, "total count:", len(s.clients))

	go client.writePump()
	go client.readPump()

	client.sendConnectedClientInfo()

	if getStatus().Online {
		if shouldSendJoinedMessages {
			s.sendUserJoinedMessage(client)
		}
		s.sendWelcomeMessageToClient(client)
	}

	// Asynchronously, optionally, fetch GeoIP data. A country hint from a
	// trusted edge proxy (Cloudflare) overrides the local database result.
	go func(client *Client) {
		client.Geo = geoip.ApplyCountryHint(s.geoipClient.GetGeoFromIP(ipAddress), countryHint)
	}(client)

	return client
}

func (s *Server) sendUserJoinedMessage(c *Client) {
	userJoinedEvent := events.UserJoinedEvent{}
	userJoinedEvent.SetDefaults()
	userJoinedEvent.User = c.User
	userJoinedEvent.ClientID = c.Id

	if err := s.Broadcast(userJoinedEvent.GetBroadcastPayload()); err != nil {
		log.Errorln("error adding client to chat server", err)
	}

	// Send chat user joined webhook
	webhooks.SendChatEventUserJoined(userJoinedEvent)
}

// handleClientDisconnected schedules a chat part message after a client
// disconnects, unless the user is still connected from another client
// (upstream #3291).
func (s *Server) handleClientDisconnected(c *Client) {
	if clients, _ := GetClientsForUser(c.User.ID); len(clients) > 0 {
		// This user is still connected to chat with another client.
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.userPartedTimers[c.User.ID] = time.AfterFunc(chatPartMessageDelay, func() {
		s.sendUserPartedMessage(c)
	})
}

func (s *Server) sendUserPartedMessage(c *Client) {
	s.mu.Lock()
	if _, ok := s.userPartedTimers[c.User.ID]; !ok {
		// The timer was cancelled by a quick reconnect.
		s.mu.Unlock()
		return
	}
	delete(s.userPartedTimers, c.User.ID)
	s.mu.Unlock()

	userPartEvent := events.UserPartEvent{}
	userPartEvent.SetDefaults()
	userPartEvent.User = c.User
	userPartEvent.ClientID = c.Id

	// Part messages are toggled together with join messages.
	if data.GetChatJoinMessagesEnabled() && getStatus().Online {
		if err := s.Broadcast(userPartEvent.GetBroadcastPayload()); err != nil {
			log.Errorln("error sending chat part message", err)
		}
	}

	// Send chat user parted webhook.
	webhooks.SendChatEventUserParted(userPartEvent)
}

// checkWsOrigin verifies the Origin header of incoming websocket connections.
// Requests without an Origin header ("null" included) are allowed so desktop
// integrations (comment viewers, OBS browser sources, bots) keep working;
// browser connections must come from this server's own origin (the request
// Host — which reverse proxies forward — or the configured server URL).
// Additional origins can be allowed via the OWNCAST_ALLOWED_WS_ORIGINS
// environment variable (comma-separated hostnames, or "*" to allow all).
func checkWsOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" || strings.EqualFold(origin, "null") {
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil || originURL.Hostname() == "" {
		return false
	}
	originHost := originURL.Hostname()

	// Same host as the request (reverse proxies pass the public Host through).
	requestHost := r.Host
	if host, _, splitErr := net.SplitHostPort(r.Host); splitErr == nil {
		requestHost = host
	}
	if strings.EqualFold(originHost, requestHost) {
		return true
	}

	// The configured public server URL.
	if serverURL, parseErr := url.Parse(data.GetServerURL()); parseErr == nil && serverURL.Hostname() != "" {
		if strings.EqualFold(originHost, serverURL.Hostname()) {
			return true
		}
	}

	// Extra origins via environment variable.
	for _, allowed := range strings.Split(os.Getenv("OWNCAST_ALLOWED_WS_ORIGINS"), ",") {
		allowed = strings.TrimSpace(allowed)
		if allowed != "" && (allowed == "*" || strings.EqualFold(allowed, originHost)) {
			return true
		}
	}

	log.Warnln("rejecting websocket connection from unexpected origin:", origin)
	return false
}

// HandleClientConnection is fired when a single client connects to the websocket.
func (s *Server) HandleClientConnection(w http.ResponseWriter, r *http.Request) {
	if data.GetChatDisabled() {
		_, _ = w.Write([]byte(events.ChatDisabled))
		return
	}

	ipAddress := utils.GetIPAddressFromRequest(r)
	// Check if this client's IP address is banned. If so send a rejection.
	if blocked, err := data.IsIPAddressBanned(ipAddress); blocked {
		log.Debugln("Client ip address has been blocked. Rejecting.")

		w.WriteHeader(http.StatusForbidden)
		return
	} else if err != nil {
		log.Errorln("error determining if IP address is blocked: ", err)
	}

	// Limit concurrent chat connections
	if int64(len(s.clients)) >= s.maxSocketConnectionLimit {
		log.Warnln("rejecting incoming client connection as it exceeds the max client count of", s.maxSocketConnectionLimit)
		_, _ = w.Write([]byte(events.ErrorMaxConnectionsExceeded))
		return
	}

	upgrader.CheckOrigin = checkWsOrigin

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Debugln(err)
		return
	}

	accessToken := r.URL.Query().Get("accessToken")
	if accessToken == "" {
		log.Errorln("Access token is required")
		// Return HTTP status code
		_ = conn.Close()
		return
	}

	// A user is required to use the websocket
	user := user.GetUserByToken(accessToken)
	if user == nil {
		// Send error that registration is required
		_ = conn.WriteJSON(events.EventPayload{
			"type": events.ErrorNeedsRegistration,
		})
		_ = conn.Close()
		return
	}

	// User is disabled therefore we should disconnect.
	if user.DisabledAt != nil {
		log.Traceln("Disabled user", user.ID, user.DisplayName, "rejected")
		_ = conn.WriteJSON(events.EventPayload{
			"type": events.ErrorUserDisabled,
		})
		_ = conn.Close()
		return
	}

	// When social authentication is required, chat (including reading it) is
	// limited to authenticated users and moderators. The frontend keeps
	// unauthenticated visitors behind the auth-required modal.
	if data.GetSocialAuthRequired() && !user.Authenticated && !user.IsModerator() {
		log.Traceln("Unauthenticated user", user.ID, user.DisplayName, "rejected: social auth is required")
		_ = conn.Close()
		return
	}

	userAgent := r.UserAgent()
	countryHint := utils.GetCountryHintFromRequest(r)

	s.Addclient(conn, user, accessToken, userAgent, ipAddress, countryHint)
}

// Broadcast sends message to all connected clients.
func (s *Server) Broadcast(payload events.EventPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Capture the event into the active VOD recording (no-op when not
	// recording) so it can be replayed in sync with the archived video.
	recording.Get().RecordEvent(payload)

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, client := range s.clients {
		if client == nil {
			continue
		}

		select {
		case client.send <- data:
		default:
			go client.close()
		}
	}

	return nil
}

// Send will send a single payload to a single connected client.
func (s *Server) Send(payload events.EventPayload, client *Client) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Errorln(err)
		return
	}

	client.send <- data
}

// DisconnectClients will forcefully disconnect all clients belonging to a user by ID.
func (s *Server) DisconnectClients(clients []*Client) {
	for _, client := range clients {
		log.Traceln("Disconnecting client", client.User.ID, "owned by", client.User.DisplayName)

		go func(client *Client) {
			event := events.UserDisabledEvent{}
			event.SetDefaults()

			// Send this disabled event specifically to this single connected client
			// to let them know they've been banned.
			_server.Send(event.GetBroadcastPayload(), client)

			// Give the socket time to send out the above message.
			// Unfortunately I don't know of any way to get a real callback to know when
			// the message was successfully sent, so give it a couple seconds.
			time.Sleep(2 * time.Second)

			// Forcefully disconnect if still valid.
			if client != nil {
				client.close()
			}
		}(client)
	}
}

// SendConnectedClientInfoToUser will find all the connected clients assigned to a user
// and re-send each the connected client info.
func SendConnectedClientInfoToUser(userID string) error {
	clients, err := GetClientsForUser(userID)
	if err != nil {
		return err
	}

	// Get an updated reference to the user.
	user := user.GetUserByID(userID)
	if user == nil {
		return fmt.Errorf("user not found")
	}

	for _, client := range clients {
		// Update the client's reference to its user.
		client.User = user
		// Send the update to the client.
		client.sendConnectedClientInfo()
	}

	return nil
}

// SendActionToUser will send system action text to all connected clients
// assigned to a user ID.
func SendActionToUser(userID string, text string) error {
	clients, err := GetClientsForUser(userID)
	if err != nil {
		return err
	}

	for _, client := range clients {
		_server.sendActionToClient(client, text)
	}

	return nil
}

func (s *Server) eventReceived(event chatClientEvent) {
	c := event.client
	u := c.User

	// If established chat user only mode is enabled and the user is not old
	// enough then reject this event and send them an informative message.
	if u != nil && data.GetChatEstbalishedUsersOnlyMode() && time.Since(event.client.User.CreatedAt) < config.GetDefaults().ChatEstablishedUserModeTimeDuration && !u.IsModerator() {
		s.sendActionToClient(c, "You have not been an established chat participant long enough to take part in chat. Please enjoy the stream and try again later.")
		return
	}

	// Social auth is also enforced when the connection is registered, but
	// guard every event too so enabling the setting mid-stream takes effect
	// for connections that joined before it was turned on (upstream #4762).
	if data.GetSocialAuthRequired() && (u == nil || (!u.Authenticated && !u.IsModerator())) {
		s.sendActionToClient(c, "Authentication is required to participate in chat.")
		return
	}

	var typecheck map[string]interface{}
	if err := json.Unmarshal(event.data, &typecheck); err != nil {
		log.Debugln(err)
	}

	eventType := typecheck["type"]

	switch eventType {
	case events.MessageSent:
		s.userMessageSent(event)

	case events.UserNameChanged:
		s.userNameChanged(event)

	case events.UserColorChanged:
		s.userColorChanged(event)
	default:
		log.Debugln(logSanitize(fmt.Sprint(eventType)), "event not found:", logSanitize(fmt.Sprint(typecheck)))
	}
}

func (s *Server) sendWelcomeMessageToClient(c *Client) {
	// Add an artificial delay so people notice this message come in.
	time.Sleep(7 * time.Second)

	welcomeMessage := utils.RenderSimpleMarkdown(data.GetServerWelcomeMessage())

	if welcomeMessage != "" {
		s.sendSystemMessageToClient(c, welcomeMessage)
	}
}

func (s *Server) sendAllWelcomeMessage() {
	welcomeMessage := utils.RenderSimpleMarkdown(data.GetServerWelcomeMessage())

	if welcomeMessage != "" {
		clientMessage := events.SystemMessageEvent{
			Event: events.Event{},
			MessageEvent: events.MessageEvent{
				Body: welcomeMessage,
			},
		}
		clientMessage.SetDefaults()
		_ = s.Broadcast(clientMessage.GetBroadcastPayload())
	}
}

func (s *Server) sendSystemMessageToClient(c *Client, message string) {
	clientMessage := events.SystemMessageEvent{
		Event: events.Event{},
		MessageEvent: events.MessageEvent{
			Body: message,
		},
	}
	clientMessage.SetDefaults()
	clientMessage.RenderBody()
	s.Send(clientMessage.GetBroadcastPayload(), c)
}

func (s *Server) sendActionToClient(c *Client, message string) {
	clientMessage := events.ActionEvent{
		MessageEvent: events.MessageEvent{
			Body: message,
		},
		Event: events.Event{
			Type: events.ChatActionSent,
		},
	}
	clientMessage.SetDefaults()
	clientMessage.RenderBody()
	s.Send(clientMessage.GetBroadcastPayload(), c)
}
