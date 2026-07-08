package google

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
}

func setupExpiredRequestPruner() {
	pruneExpiredRequestsTimer := time.NewTicker(registrationTimeout)

	for range pruneExpiredRequestsTimer.C {
		lock.Lock()
		log.Debugln("Pruning expired Google auth requests.")
		for k, v := range pendingAuthRequests {
			if time.Since(v.Timestamp) > registrationTimeout {
				delete(pendingAuthRequests, k)
			}
		}
		lock.Unlock()
	}
}

// Request represents a pending Google auth request.
type Request struct {
	State              string
	UserID             string
	DisplayName        string
	CurrentAccessToken string
	Timestamp          time.Time
}

// GoogleUser represents user info from Google.
type GoogleUser struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
	Locale        string `json:"locale"`
}

// StartAuthFlow begins the Google OAuth2 flow.
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

	googleConfig := data.GetGoogleAuthConfig()
	if googleConfig.ClientID == "" || googleConfig.ClientSecret == "" {
		return nil, errors.New("Google API認証情報が設定されていません")
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

	// Build Google OAuth2 URL
	callbackURL := serverURL + "/api/auth/google/callback"
	params := url.Values{}
	params.Set("client_id", googleConfig.ClientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("response_type", "code")
	params.Set("scope", "openid email profile")
	params.Set("state", state)
	params.Set("access_type", "offline")

	authURL, _ := url.Parse("https://accounts.google.com/o/oauth2/v2/auth")
	authURL.RawQuery = params.Encode()

	return authURL, nil
}

// HandleCallback handles the OAuth2 callback from Google.
func HandleCallback(code, state string) (*Request, *GoogleUser, error) {
	lock.Lock()
	request, ok := pendingAuthRequests[state]
	if !ok {
		lock.Unlock()
		return nil, nil, errors.New("無効または期限切れの認証リクエストです")
	}
	delete(pendingAuthRequests, state)
	lock.Unlock()

	googleConfig := data.GetGoogleAuthConfig()
	serverURL := data.GetServerURL()
	callbackURL := serverURL + "/api/auth/google/callback"

	// Exchange code for access token
	tokenURL := "https://oauth2.googleapis.com/token"
	tokenData := url.Values{}
	tokenData.Set("client_id", googleConfig.ClientID)
	tokenData.Set("client_secret", googleConfig.ClientSecret)
	tokenData.Set("grant_type", "authorization_code")
	tokenData.Set("code", code)
	tokenData.Set("redirect_uri", callbackURL)

	resp, err := http.PostForm(tokenURL, tokenData)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Googleトークンの取得に失敗しました")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		// Never log the raw token-endpoint body — it can contain issued tokens.
		log.Errorln("Google token request failed with status", resp.StatusCode)
		return nil, nil, errors.New("Googleトークンの取得に失敗しました")
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, nil, errors.Wrap(err, "Googleトークンのパースに失敗しました")
	}

	// Get user info
	userURL := "https://www.googleapis.com/oauth2/v2/userinfo"
	req, _ := http.NewRequest("GET", userURL, nil)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenResp.AccessToken))

	client := &http.Client{Timeout: 10 * time.Second}
	userResp, err := client.Do(req)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Googleユーザー情報の取得に失敗しました")
	}
	defer userResp.Body.Close()

	userBody, _ := io.ReadAll(userResp.Body)

	if userResp.StatusCode != http.StatusOK {
		log.Errorln("Google user request failed with status", userResp.StatusCode)
		return nil, nil, errors.New("Googleユーザー情報の取得に失敗しました")
	}

	var googleUser GoogleUser
	if err := json.Unmarshal(userBody, &googleUser); err != nil {
		return nil, nil, errors.Wrap(err, "Googleユーザー情報のパースに失敗しました")
	}

	return request, &googleUser, nil
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

// GetDisplayName returns the best display name for a Google user.
func (u *GoogleUser) GetDisplayName() string {
	if u.Name != "" {
		return u.Name
	}
	if u.GivenName != "" {
		return u.GivenName
	}
	return u.Email
}
