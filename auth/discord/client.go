package discord

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
)

var (
	pendingAuthRequests = make(map[string]*Request)
	lock                = sync.Mutex{}
)

const registrationTimeout = time.Minute * 10
const maxPendingRequests = 100

func init() {
	go setupExpiredRequestPruner()
	// Note: crypto/rand doesn't require seeding
}

func setupExpiredRequestPruner() {
	pruneExpiredRequestsTimer := time.NewTicker(registrationTimeout)

	for range pruneExpiredRequestsTimer.C {
		lock.Lock()
		log.Debugln("Pruning expired Discord auth requests.")
		for k, v := range pendingAuthRequests {
			if time.Since(v.Timestamp) > registrationTimeout {
				delete(pendingAuthRequests, k)
			}
		}
		lock.Unlock()
	}
}

// Request represents a pending Discord auth request.
type Request struct {
	State              string
	UserID             string
	DisplayName        string
	CurrentAccessToken string
	Timestamp          time.Time
}

// DiscordUser represents user info from Discord.
type DiscordUser struct {
	ID            string `json:"id"`
	Username      string `json:"username"`
	Discriminator string `json:"discriminator"`
	GlobalName    string `json:"global_name"`
	Avatar        string `json:"avatar"`
}

// StartAuthFlow begins the Discord OAuth2 flow.
func StartAuthFlow(userID, accessToken, displayName string) (*url.URL, error) {
	lock.Lock()
	defer lock.Unlock()

	if len(pendingAuthRequests) >= maxPendingRequests {
		return nil, errors.New("認証リクエストが多すぎます。後でもう一度お試しください。")
	}

	serverURL := data.GetServerURL()
	if serverURL == "" {
		return nil, errors.New("サーバーURLが設定されていません")
	}

	discordConfig := data.GetDiscordAuthConfig()
	if discordConfig.ClientID == "" || discordConfig.ClientSecret == "" {
		return nil, errors.New("Discord API認証情報が設定されていません")
	}

	// Generate state
	state := generateState()

	// Store pending request
	pendingAuthRequests[state] = &Request{
		State:              state,
		UserID:             userID,
		DisplayName:        displayName,
		CurrentAccessToken: accessToken,
		Timestamp:          time.Now(),
	}

	// Build Discord OAuth2 URL
	callbackURL := serverURL + "/api/auth/discord/callback"
	params := url.Values{}
	params.Set("client_id", discordConfig.ClientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("response_type", "code")
	params.Set("scope", "identify")
	params.Set("state", state)

	authURL, _ := url.Parse("https://discord.com/api/oauth2/authorize")
	authURL.RawQuery = params.Encode()

	return authURL, nil
}

// HandleCallback handles the OAuth2 callback from Discord.
func HandleCallback(code, state string) (*Request, *DiscordUser, error) {
	lock.Lock()
	request, ok := pendingAuthRequests[state]
	if !ok {
		lock.Unlock()
		return nil, nil, errors.New("無効または期限切れの認証リクエストです")
	}
	delete(pendingAuthRequests, state)
	lock.Unlock()

	discordConfig := data.GetDiscordAuthConfig()
	serverURL := data.GetServerURL()
	callbackURL := serverURL + "/api/auth/discord/callback"

	// Exchange code for access token
	tokenURL := "https://discord.com/api/oauth2/token"
	tokenData := url.Values{}
	tokenData.Set("client_id", discordConfig.ClientID)
	tokenData.Set("client_secret", discordConfig.ClientSecret)
	tokenData.Set("grant_type", "authorization_code")
	tokenData.Set("code", code)
	tokenData.Set("redirect_uri", callbackURL)

	resp, err := http.PostForm(tokenURL, tokenData)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Discordトークンの取得に失敗しました")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		// Never log the raw token-endpoint body — it can contain issued tokens.
		log.Errorln("Discord token request failed with status", resp.StatusCode)
		return nil, nil, errors.New("Discordトークンの取得に失敗しました")
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, nil, errors.Wrap(err, "Discordトークンのパースに失敗しました")
	}

	// Get user info
	userURL := "https://discord.com/api/users/@me"
	req, _ := http.NewRequest("GET", userURL, nil)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenResp.AccessToken))

	client := &http.Client{Timeout: 10 * time.Second}
	userResp, err := client.Do(req)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Discordユーザー情報の取得に失敗しました")
	}
	defer userResp.Body.Close()

	userBody, _ := io.ReadAll(userResp.Body)

	if userResp.StatusCode != http.StatusOK {
		log.Errorln("Discord user response:", string(userBody))
		return nil, nil, errors.New("Discordユーザー情報の取得に失敗しました")
	}

	var discordUser DiscordUser
	if err := json.Unmarshal(userBody, &discordUser); err != nil {
		return nil, nil, errors.Wrap(err, "Discordユーザー情報のパースに失敗しました")
	}

	return request, &discordUser, nil
}

// generateState generates a cryptographically secure random state string.
func generateState() string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate random bytes")
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

// GetDisplayName returns the best display name for a Discord user.
func (u *DiscordUser) GetDisplayName() string {
	if u.GlobalName != "" {
		return u.GlobalName
	}
	if u.Discriminator != "0" {
		return fmt.Sprintf("%s#%s", u.Username, u.Discriminator)
	}
	return u.Username
}
