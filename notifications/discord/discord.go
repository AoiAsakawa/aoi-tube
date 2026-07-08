package discord

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/pkg/errors"
)

// Discord is an instance of the Discord service.
type Discord struct {
	name       string
	avatar     string
	webhookURL string
	thumbnail  string
}

// New will create a new instance of the Discord service.
func New(name, avatar, webhook, thumbnail string) (*Discord, error) {
	return &Discord{
		name:       name,
		avatar:     avatar,
		webhookURL: webhook,
		thumbnail:  thumbnail,
	}, nil
}

// Embed represents a Discord embed object.
type Embed struct {
	Title       string      `json:"title,omitempty"`
	Description string      `json:"description,omitempty"`
	URL         string      `json:"url,omitempty"`
	Color       int         `json:"color,omitempty"`
	Image       *EmbedImage `json:"image,omitempty"`
	Thumbnail   *EmbedImage `json:"thumbnail,omitempty"`
}

// EmbedImage represents an image in a Discord embed.
type EmbedImage struct {
	URL string `json:"url"`
}

// Send will send a message to a Discord channel via a webhook.
func (t *Discord) Send(content string) error {
	type message struct {
		Username string  `json:"username"`
		Content  string  `json:"content,omitempty"`
		Avatar   string  `json:"avatar_url,omitempty"`
		Embeds   []Embed `json:"embeds,omitempty"`
	}

	msg := message{
		Username: t.name,
		Avatar:   t.avatar,
	}

	// If we have a thumbnail, use embed format with image
	if t.thumbnail != "" {
		msg.Embeds = []Embed{
			{
				Description: content,
				Color:       0x9146FF, // Purple color
				Image: &EmbedImage{
					URL: t.thumbnail,
				},
			},
		}
	} else {
		// Fall back to plain text
		msg.Content = content
	}

	jsonText, err := json.Marshal(msg)
	if err != nil {
		return errors.Wrap(err, "error marshalling discord message to json")
	}

	req, err := http.NewRequest("POST", t.webhookURL, bytes.NewReader(jsonText))
	if err != nil {
		return errors.Wrap(err, "error creating discord webhook request")
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}

	resp, err := client.Do(req)
	if err != nil {
		return errors.Wrap(err, "error executing discord webhook")
	}

	return resp.Body.Close()
}
