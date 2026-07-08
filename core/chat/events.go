package chat

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/auth"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

func (s *Server) userNameChanged(eventData chatClientEvent) {
	var receivedEvent events.NameChangeEvent
	if err := json.Unmarshal(eventData.data, &receivedEvent); err != nil {
		log.Errorln("error unmarshalling to NameChangeEvent", err)
		return
	}

	proposedUsername := receivedEvent.NewName

	// Check if name is on the blocklist
	blocklist := data.GetForbiddenUsernameList()

	// Names have a max length
	proposedUsername = utils.MakeSafeStringOfLength(proposedUsername, config.MaxChatDisplayNameLength)

	// Check if the sanitized name is empty or just whitespace (upstream #4553).
	if strings.TrimSpace(proposedUsername) == "" {
		log.Debugln(logSanitize(eventData.client.User.DisplayName), "attempted to change name to empty or whitespace-only name")
		message := "Display name cannot be empty or contain only whitespace."
		s.sendActionToClient(eventData.client, message)

		// Resend the client's user so their username is in sync.
		eventData.client.sendConnectedClientInfo()

		return
	}

	for _, blockedName := range blocklist {
		normalizedName := strings.TrimSpace(blockedName)
		normalizedName = strings.ToLower(normalizedName)
		if strings.Contains(normalizedName, proposedUsername) {
			// Denied.
			log.Debugln(logSanitize(eventData.client.User.DisplayName), "blocked from changing name to", logSanitize(proposedUsername), "due to blocked name", normalizedName)
			message := fmt.Sprintf("You cannot change your name to **%s**.", proposedUsername)
			s.sendActionToClient(eventData.client, message)

			// Resend the client's user so their username is in sync.
			eventData.client.sendConnectedClientInfo()

			return
		}
	}

	// Check if the name is not already assigned to a registered user.
	if available, err := user.IsDisplayNameAvailable(proposedUsername); err != nil {
		log.Errorln("error checking if name is available", err)
		return
	} else if !available {
		message := fmt.Sprintf("The name **%s** has been already registered. If this is your name, please authenticate.", proposedUsername)
		s.sendActionToClient(eventData.client, message)

		// Resend the client's user so their username is in sync.
		eventData.client.sendConnectedClientInfo()

		return
	}

	savedUser := user.GetUserByToken(eventData.client.accessToken)
	oldName := savedUser.DisplayName

	// Save the new name
	if err := user.ChangeUsername(eventData.client.User.ID, proposedUsername); err != nil {
		log.Errorln("error changing username", err)
	}

	// Update the connected clients associated user with the new name
	now := time.Now()
	eventData.client.User = savedUser
	eventData.client.User.NameChangedAt = &now

	// Send chat event letting everyone about about the name change
	savedUser.DisplayName = proposedUsername

	broadcastEvent := events.NameChangeBroadcast{
		Oldname: oldName,
	}
	broadcastEvent.User = savedUser
	broadcastEvent.SetDefaults()
	payload := broadcastEvent.GetBroadcastPayload()
	if err := s.Broadcast(payload); err != nil {
		log.Errorln("error broadcasting NameChangeEvent", err)
		return
	}

	// Send chat user name changed webhook
	receivedEvent.User = savedUser
	receivedEvent.ClientID = eventData.client.Id
	webhooks.SendChatEventUsernameChanged(receivedEvent)

	// Resend the client's user so their username is in sync.
	eventData.client.sendConnectedClientInfo()
}

func (s *Server) userColorChanged(eventData chatClientEvent) {
	var receivedEvent events.ColorChangeEvent
	if err := json.Unmarshal(eventData.data, &receivedEvent); err != nil {
		log.Errorln("error unmarshalling to ColorChangeEvent", err)
		return
	}

	// Verify this color is valid
	if receivedEvent.NewColor > config.MaxUserColor {
		log.Errorln("invalid color requested when changing user display color")
		return
	}

	// Save the new color
	if err := user.ChangeUserColor(eventData.client.User.ID, receivedEvent.NewColor); err != nil {
		log.Errorln("error changing user display color", err)
	}

	// Resend client's user info with new color, otherwise the name change dialog would still show the old color
	eventData.client.User.DisplayColor = receivedEvent.NewColor
	eventData.client.sendConnectedClientInfo()
}

func (s *Server) userMessageSent(eventData chatClientEvent) {
	var event events.UserMessageEvent
	if err := json.Unmarshal(eventData.data, &event); err != nil {
		log.Errorln("error unmarshalling to UserMessageEvent", err)
		return
	}

	event.SetDefaults()
	event.ClientID = eventData.client.Id

	// Ignore empty messages
	if event.Empty() {
		return
	}

	// Ignore if the stream has been offline
	if !getStatus().Online && getStatus().LastDisconnectTime != nil {
		disconnectedTime := getStatus().LastDisconnectTime.Time
		if time.Since(disconnectedTime) > 5*time.Minute {
			return
		}
	}

	event.User = user.GetUserByToken(eventData.client.accessToken)

	// Guard against nil users
	if event.User == nil {
		return
	}

	// Set auth type for the user
	if event.User.Authenticated {
		event.User.AuthType = auth.GetPrimaryAuthType(event.User.ID)
	}

	// Check if social authentication is required (Twitter, X OAuth 2.0, Discord, or Google)
	if data.GetRequireTwitterAuth() && !event.User.IsModerator() {
		// Check if user has authenticated with any supported method
		hasTwitterAuth := auth.HasUserAuthenticatedWithType(event.User.ID, auth.Twitter)
		hasXAuth := auth.HasUserAuthenticatedWithType(event.User.ID, auth.X)
		hasDiscordAuth := auth.HasUserAuthenticatedWithType(event.User.ID, auth.Discord)
		hasGoogleAuth := auth.HasUserAuthenticatedWithType(event.User.ID, auth.Google)

		if !hasTwitterAuth && !hasXAuth && !hasDiscordAuth && !hasGoogleAuth {
			s.sendActionToClient(eventData.client, "チャットに参加するには認証が必要です。画面右上のメニューから認証を行ってください。")
			return
		}
	}

	payload := event.GetBroadcastPayload()
	if err := s.Broadcast(payload); err != nil {
		log.Errorln("error broadcasting UserMessageEvent payload", err)
		return
	}

	// Send chat message sent webhook
	webhooks.SendChatEvent(&event)
	chatMessagesSentCounter.Inc()

	SaveUserMessage(event)
	eventData.client.MessageCount++
}

func logSanitize(userValue string) string {
	// strip carriage return and newline from user-submitted values to prevent log injection
	sanitizedValue := strings.ReplaceAll(userValue, "\n", "")
	sanitizedValue = strings.ReplaceAll(sanitizedValue, "\r", "")

	return fmt.Sprintf("userSuppliedValue(%s)", sanitizedValue)
}
