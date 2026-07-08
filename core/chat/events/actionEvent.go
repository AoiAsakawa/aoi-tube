package events

// ActionEvent represents an action that took place, not a chat message.
type ActionEvent struct {
	Event
	MessageEvent
	// TranslationKey identifies a client-side translation for this system
	// action so each viewer can see it in their own language. Body is kept
	// as a fallback for clients that don't know the key.
	TranslationKey string `json:"translationKey,omitempty"`
	// TranslationVars holds values interpolated into the translated string.
	TranslationVars map[string]string `json:"translationVars,omitempty"`
}

// GetBroadcastPayload will return the object to send to all chat users.
func (e *ActionEvent) GetBroadcastPayload() EventPayload {
	payload := EventPayload{
		"id":        e.ID,
		"timestamp": e.Timestamp,
		"body":      e.Body,
		"type":      e.GetMessageType(),
	}
	if e.TranslationKey != "" {
		payload["translationKey"] = e.TranslationKey
		if len(e.TranslationVars) > 0 {
			payload["translationVars"] = e.TranslationVars
		}
	}
	return payload
}

// GetMessageType will return the type of message.
func (e *ActionEvent) GetMessageType() EventType {
	return ChatActionSent
}
