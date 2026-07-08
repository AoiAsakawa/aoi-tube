package webhooks

import (
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/teris-io/shortid"
)

// SendStreamStatusEvent will send all webhook destinations the current stream status.
func SendStreamStatusEvent(eventType models.EventType) {
	sendStreamStatusEvent(eventType, shortid.MustGenerate(), time.Now())
}

func sendStreamStatusEvent(eventType models.EventType, id string, timestamp time.Time) {
	SendEventToWebhooks(WebhookEvent{
		Type: eventType,
		EventData: map[string]interface{}{
			"id":          id,
			"name":        data.GetServerName(),
			"summary":     data.GetServerSummary(),
			"streamTitle": data.GetStreamTitle(),
			"timestamp":   timestamp,
		},
	})
}
