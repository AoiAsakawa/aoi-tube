package x

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
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
		log.Debugln("Pruning expired X auth requests.")
		for k, v := range pendingAuthRequests {
			if time.Since(v.Timestamp) > registrationTimeout {
				delete(pendingAuthRequests, k)
			}
		}
		lock.Unlock()
	}
}

// Request represents a pending X auth request.
type Request struct {
	State              string
	CodeVerifier       string
	UserID             string
	DisplayName        string
	CurrentAccessToken string
	Timestamp          time.Time
}

// XUser represents user info from X (Twitter).
type XUser struct {
	ID              string `json:"id"`
	Username        string `json:"username"`
	Name            string `json:"name"`
	ProfileImageURL string `json:"profile_image_url"`
}

// StartAuthFlow begins the X OAuth 2.0 flow with PKCE.
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

	xConfig := data.GetXAuthConfig()
	if xConfig.ClientID == "" || xConfig.ClientSecret == "" {
		return nil, errors.New("X API認証情報が設定されていません")
	}

	// Generate state and PKCE code verifier
	state := generateRandomString(32)
	codeVerifier := generateRandomString(64)
	codeChallenge := generateCodeChallenge(codeVerifier)

	// Store pending request
	pendingAuthRequests[state] = &Request{
		State:              state,
		CodeVerifier:       codeVerifier,
		UserID:             userID,
		DisplayName:        displayName,
		CurrentAccessToken: accessToken,
		Timestamp:          time.Now(),
	}

	// Build X OAuth 2.0 URL
	callbackURL := serverURL + "/api/auth/x/callback"
	params := url.Values{}
	params.Set("response_type", "code")
	params.Set("client_id", xConfig.ClientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("scope", "users.read tweet.read")
	params.Set("state", state)
	params.Set("code_challenge", codeChallenge)
	params.Set("code_challenge_method", "S256")

	authURL, _ := url.Parse("https://x.com/i/oauth2/authorize")
	authURL.RawQuery = params.Encode()

	return authURL, nil
}

// HandleCallback handles the OAuth 2.0 callback from X.
func HandleCallback(code, state string) (*Request, *XUser, error) {
	lock.Lock()
	request, ok := pendingAuthRequests[state]
	if !ok {
		lock.Unlock()
		return nil, nil, errors.New("無効または期限切れの認証リクエストです")
	}
	delete(pendingAuthRequests, state)
	lock.Unlock()

	xConfig := data.GetXAuthConfig()
	serverURL := data.GetServerURL()
	callbackURL := serverURL + "/api/auth/x/callback"

	// Exchange code for access token
	tokenURL := "https://api.twitter.com/2/oauth2/token"
	tokenData := url.Values{}
	tokenData.Set("code", code)
	tokenData.Set("grant_type", "authorization_code")
	tokenData.Set("client_id", xConfig.ClientID)
	tokenData.Set("redirect_uri", callbackURL)
	tokenData.Set("code_verifier", request.CodeVerifier)

	req, _ := http.NewRequest("POST", tokenURL, strings.NewReader(tokenData.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Basic auth with client_id:client_secret
	req.SetBasicAuth(xConfig.ClientID, xConfig.ClientSecret)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Xトークンの取得に失敗しました")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		// Never log or surface the raw token-endpoint body — it can contain
		// issued tokens.
		log.Errorln("X token request failed with status", resp.StatusCode)
		return nil, nil, fmt.Errorf("Xトークンの取得に失敗しました (status %d)", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, nil, errors.Wrap(err, "Xトークンのパースに失敗しました")
	}

	// Get user info using Twitter API v2
	userURL := "https://api.twitter.com/2/users/me?user.fields=profile_image_url"
	userReq, _ := http.NewRequest("GET", userURL, nil)
	userReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenResp.AccessToken))

	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, nil, errors.Wrap(err, "Xユーザー情報の取得に失敗しました")
	}
	defer userResp.Body.Close()

	userBody, _ := io.ReadAll(userResp.Body)

	if userResp.StatusCode != http.StatusOK {
		log.Errorln("X user response:", userResp.StatusCode, string(userBody))
		if userResp.StatusCode == http.StatusForbidden && strings.Contains(string(userBody), "client-not-enrolled") {
			// Seen 2026-07: the Free tier stopped serving GET /2/users/me,
			// which breaks Sign in with X even though the OAuth flow itself
			// succeeds. Requires a paid tier and a production app instance.
			log.Errorln("X API rejected the user lookup (client-not-enrolled): the app's API access tier does not include GET /2/users/me. Upgrade the plan at console.x.com, create a production app environment, and update the OAuth 2.0 credentials in the admin settings.")
		}
		return nil, nil, errors.New("Xユーザー情報の取得に失敗しました")
	}

	var userResponse struct {
		Data XUser `json:"data"`
	}
	if err := json.Unmarshal(userBody, &userResponse); err != nil {
		return nil, nil, errors.Wrap(err, "Xユーザー情報のパースに失敗しました")
	}

	return request, &userResponse.Data, nil
}

// generateRandomString generates a cryptographically secure random string.
func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		// Fallback should never happen with crypto/rand
		panic("failed to generate random bytes")
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

// generateCodeChallenge creates a PKCE code challenge from the verifier.
func generateCodeChallenge(verifier string) string {
	hash := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

// GetDisplayName returns the best display name for an X user.
func (u *XUser) GetDisplayName() string {
	if u.Name != "" {
		return u.Name
	}
	return u.Username
}
