package twitter

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"mime/multipart"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"
)

// Twitter is an instance of the Twitter/X service.
type Twitter struct {
	consumerKey       string
	consumerSecret    string
	accessToken       string
	accessTokenSecret string
	thumbnailURL      string
}

// New will create a new instance of the Twitter service.
func New(consumerKey, consumerSecret, accessToken, accessTokenSecret, thumbnailURL string) (*Twitter, error) {
	if consumerKey == "" || consumerSecret == "" || accessToken == "" || accessTokenSecret == "" {
		return nil, errors.New("Twitter API credentials are required")
	}

	return &Twitter{
		consumerKey:       consumerKey,
		consumerSecret:    consumerSecret,
		accessToken:       accessToken,
		accessTokenSecret: accessTokenSecret,
		thumbnailURL:      thumbnailURL,
	}, nil
}

// Tweet will post a tweet to Twitter/X.
func (t *Twitter) Tweet(content string) error {
	return t.postTweet(content)
}

// Send implements the notification interface.
func (t *Twitter) Send(content string) error {
	return t.Tweet(content)
}

func (t *Twitter) postTweet(text string) error {
	apiURL := "https://api.twitter.com/2/tweets"

	// Try to upload image if thumbnail URL is set
	var mediaID string
	if t.thumbnailURL != "" {
		var err error
		mediaID, err = t.uploadMediaFromURL(t.thumbnailURL)
		if err != nil {
			// Log error but continue without image
			fmt.Printf("Failed to upload media for tweet: %v\n", err)
		}
	}

	// Build payload
	payload := make(map[string]interface{})
	payload["text"] = text

	if mediaID != "" {
		payload["media"] = map[string]interface{}{
			"media_ids": []string{mediaID},
		}
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return errors.Wrap(err, "error marshalling tweet payload")
	}

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return errors.Wrap(err, "error creating Twitter API request")
	}

	req.Header.Set("Content-Type", "application/json")

	// Generate OAuth 1.0a signature
	oauthHeader := t.generateOAuthHeader("POST", apiURL, nil)
	req.Header.Set("Authorization", oauthHeader)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return errors.Wrap(err, "error posting tweet")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return errors.Errorf("Twitter API error: %d - %s", resp.StatusCode, string(body))
	}

	return nil
}

// uploadMediaFromURL downloads an image from URL and uploads it to Twitter.
func (t *Twitter) uploadMediaFromURL(imageURL string) (string, error) {
	// Download image
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(imageURL)
	if err != nil {
		return "", errors.Wrap(err, "error downloading image")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", errors.Errorf("failed to download image: %d", resp.StatusCode)
	}

	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", errors.Wrap(err, "error reading image data")
	}

	// Upload to Twitter Media API
	return t.uploadMedia(imageData)
}

// uploadMedia uploads image data to Twitter and returns the media_id.
func (t *Twitter) uploadMedia(imageData []byte) (string, error) {
	uploadURL := "https://upload.twitter.com/1.1/media/upload.json"

	// Create multipart form
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Add media data as base64
	mediaBase64 := base64.StdEncoding.EncodeToString(imageData)
	_ = writer.WriteField("media_data", mediaBase64)
	writer.Close()

	req, err := http.NewRequest("POST", uploadURL, &buf)
	if err != nil {
		return "", errors.Wrap(err, "error creating upload request")
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Generate OAuth header for media upload
	oauthHeader := t.generateOAuthHeader("POST", uploadURL, nil)
	req.Header.Set("Authorization", oauthHeader)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", errors.Wrap(err, "error uploading media")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", errors.Errorf("media upload failed: %d - %s", resp.StatusCode, string(body))
	}

	// Parse response to get media_id
	var uploadResp struct {
		MediaIDString string `json:"media_id_string"`
	}
	if err := json.Unmarshal(body, &uploadResp); err != nil {
		return "", errors.Wrap(err, "error parsing upload response")
	}

	return uploadResp.MediaIDString, nil
}

func (t *Twitter) generateOAuthHeader(method, apiURL string, params map[string]string) string {
	// OAuth parameters
	oauthParams := map[string]string{
		"oauth_consumer_key":     t.consumerKey,
		"oauth_nonce":            generateNonce(),
		"oauth_signature_method": "HMAC-SHA1",
		"oauth_timestamp":        strconv.FormatInt(time.Now().Unix(), 10),
		"oauth_token":            t.accessToken,
		"oauth_version":          "1.0",
	}

	// Merge all parameters for signature
	allParams := make(map[string]string)
	for k, v := range oauthParams {
		allParams[k] = v
	}
	for k, v := range params {
		allParams[k] = v
	}

	// Create signature base string
	signatureBase := createSignatureBaseString(method, apiURL, allParams)

	// Create signing key
	signingKey := url.QueryEscape(t.consumerSecret) + "&" + url.QueryEscape(t.accessTokenSecret)

	// Generate signature
	signature := generateHMACSHA1(signatureBase, signingKey)
	oauthParams["oauth_signature"] = signature

	// Build OAuth header
	var headerParts []string
	for k, v := range oauthParams {
		headerParts = append(headerParts, fmt.Sprintf(`%s="%s"`, k, url.QueryEscape(v)))
	}
	sort.Strings(headerParts)

	return "OAuth " + strings.Join(headerParts, ", ")
}

func createSignatureBaseString(method, apiURL string, params map[string]string) string {
	// Sort and encode parameters
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var paramPairs []string
	for _, k := range keys {
		paramPairs = append(paramPairs, url.QueryEscape(k)+"="+url.QueryEscape(params[k]))
	}
	paramString := strings.Join(paramPairs, "&")

	return method + "&" + url.QueryEscape(apiURL) + "&" + url.QueryEscape(paramString)
}

func generateHMACSHA1(data, key string) string {
	h := hmac.New(sha1.New, []byte(key))
	h.Write([]byte(data))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func generateNonce() string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 32)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
