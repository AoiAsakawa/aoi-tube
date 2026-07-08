package events

import (
	"time"

	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/teris-io/shortid"
)

// DonationEvent represents a viewer purchase event in chat: either a
// Super Chat (highlighted message) or a screen effect.
type DonationEvent struct {
	Event
	User     *user.User `json:"user,omitempty"`
	Amount   int64      `json:"amount"`
	Currency string     `json:"currency"`
	// AmountJPY is the base-currency conversion recorded at confirmation
	// time (crypto purchases only). The wire name predates configurable base
	// currencies and is kept so archived chat replays stay readable;
	// FiatCurrency names the actual currency (empty means JPY).
	AmountJPY    int64  `json:"amountJpy,omitempty"`
	FiatCurrency string `json:"fiatCurrency,omitempty"`
	Message      string `json:"message,omitempty"`
	DisplayName  string `json:"displayName"`
	IsAnonymous  bool   `json:"isAnonymous"`
	DonationID   string `json:"donationId"`
	// ItemType is "superchat" (default) or "effect".
	ItemType string `json:"itemType,omitempty"`
	// EffectType is the screen effect to play when ItemType is "effect".
	EffectType string `json:"effectType,omitempty"`
}

// GetBroadcastPayload returns the payload for broadcasting to all clients.
func (e *DonationEvent) GetBroadcastPayload() EventPayload {
	payload := EventPayload{
		"type":        DonationReceived,
		"id":          e.ID,
		"timestamp":   e.Timestamp,
		"amount":      e.Amount,
		"currency":    e.Currency,
		"message":     e.Message,
		"displayName": e.DisplayName,
		"isAnonymous": e.IsAnonymous,
		"donationId":  e.DonationID,
	}

	if e.AmountJPY > 0 {
		payload["amountJpy"] = e.AmountJPY
		if e.FiatCurrency != "" {
			payload["fiatCurrency"] = e.FiatCurrency
		}
	}
	if e.ItemType != "" {
		payload["itemType"] = e.ItemType
	}
	if e.EffectType != "" {
		payload["effectType"] = e.EffectType
	}

	if e.User != nil && !e.IsAnonymous {
		payload["user"] = e.User
	}

	return payload
}

// GetMessageType returns the type of this event.
func (e *DonationEvent) GetMessageType() EventType {
	return DonationReceived
}

// SetDefaults sets default values for the event.
func (e *DonationEvent) SetDefaults() {
	e.ID = shortid.MustGenerate()
	e.Timestamp = time.Now()
	e.Type = DonationReceived
}

// NewDonationEvent creates a new donation event.
func NewDonationEvent(donationID string, amount int64, currency, message, displayName string, isAnonymous bool, u *user.User) *DonationEvent {
	event := &DonationEvent{
		DonationID:  donationID,
		Amount:      amount,
		Currency:    currency,
		Message:     message,
		DisplayName: displayName,
		IsAnonymous: isAnonymous,
		User:        u,
	}
	event.SetDefaults()
	return event
}

// WithItem attaches the purchased item type (Super Chat or screen effect)
// to the event and returns it for chaining after NewDonationEvent.
func (e *DonationEvent) WithItem(itemType, effectType string) *DonationEvent {
	e.ItemType = itemType
	e.EffectType = effectType
	return e
}

// WithFiatConversion attaches the base-currency conversion recorded at
// confirmation time.
func (e *DonationEvent) WithFiatConversion(amountFiat int64, fiatCurrency string) *DonationEvent {
	e.AmountJPY = amountFiat
	e.FiatCurrency = fiatCurrency
	return e
}
