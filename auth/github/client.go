package github

import (
	"crypto/rand"
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
}

func setupExpiredRequestPruner() {
	pruneExpiredRequestsTimer := time.NewTicker(registrationTimeout)

	for range pruneExpiredRequestsTimer.C {
		lock.Lock()
		log.Debugln("Pruning expired GitHub auth requests.")
		for k, v := range pendingAuthRequests {
			if time.Since(v.Timestamp) > registrationTimeout {
				delete(pendingAuthRequests, k)
			}
		}
		lock.Unlock()
	}
}

// Request represents a pending GitHub auth request.
type Request struct {
	State              string
	UserID             string
	DisplayName        string
	CurrentAccessToken string
	Timestamp          time.Time
}

// GitHubUser represents user info from the GitHub API.
type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

// StartAuthFlow begins the GitHub OAuth2 flow.
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

	githubConfig := data.GetGitHubAuthConfig()
	if githubConfig.ClientID == "" || githubConfig.ClientSecret == "" {
		return nil, errors.New("GitHub OAuth認証情報が設定されていません")
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

	// Build GitHub OAuth2 authorization URL
	callbackURL := serverURL + "/api/auth/github/callback"
	params := url.Values{}
	params.Set("client_id", githubConfig.ClientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("state", state)
	params.Set("scope", "read:user")

	authURL, _ := url.Parse("https://github.com/login/oauth/authorize")
	authURL.RawQuery = params.Encode()

	return authURL, nil
}

// HandleCallback handles the OAuth2 callback from GitHub.
func HandleCallback(code, state string) (*Request, *GitHubUser, error) {
	lock.Lock()
	request, ok := pendingAuthRequests[state]
	if !ok {
		lock.Unlock()
		return nil, nil, errors.New("無効または期限切れの認証リクエストです")
	}
	delete(pendingAuthRequests, state)
	lock.Unlock()

	githubConfig := data.GetGitHubAuthConfig()
	serverURL := data.GetServerURL()
	callbackURL := serverURL + "/api/auth/github/callback"

	// Exchange code for access token. GitHub returns form-encoded output
	// unless JSON is explicitly requested.
	tokenData := url.Values{}
	tokenData.Set("client_id", githubConfig.ClientID)
	tokenData.Set("client_secret", githubConfig.ClientSecret)
	tokenData.Set("code", code)
	tokenData.Set("redirect_uri", callbackURL)

	tokenReq, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(tokenData.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(tokenReq)
	if err != nil {
		return nil, nil, errors.Wrap(err, "GitHubトークンの取得に失敗しました")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Errorln("GitHub token response:", string(body))
		return nil, nil, errors.New("GitHubトークンの取得に失敗しました")
	}

	var tokenResp struct {
		AccessToken      string `json:"access_token"`
		TokenType        string `json:"token_type"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, nil, errors.Wrap(err, "GitHubトークンのパースに失敗しました")
	}
	if tokenResp.Error != "" || tokenResp.AccessToken == "" {
		log.Errorln("GitHub token error:", tokenResp.Error, tokenResp.ErrorDescription)
		return nil, nil, errors.New("GitHubトークンの取得に失敗しました")
	}

	// Get the authenticated user
	userReq, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenResp.AccessToken))
	userReq.Header.Set("Accept", "application/vnd.github+json")

	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, nil, errors.Wrap(err, "GitHubユーザー情報の取得に失敗しました")
	}
	defer userResp.Body.Close()

	userBody, _ := io.ReadAll(userResp.Body)

	if userResp.StatusCode != http.StatusOK {
		log.Errorln("GitHub user response:", string(userBody))
		return nil, nil, errors.New("GitHubユーザー情報の取得に失敗しました")
	}

	var githubUser GitHubUser
	if err := json.Unmarshal(userBody, &githubUser); err != nil {
		return nil, nil, errors.Wrap(err, "GitHubユーザー情報のパースに失敗しました")
	}

	if githubUser.ID == 0 {
		return nil, nil, errors.New("GitHubユーザーIDを取得できませんでした")
	}

	return request, &githubUser, nil
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

// AuthToken returns the stable identifier used to link this GitHub account.
// The numeric ID is used because logins can be renamed.
func (u *GitHubUser) AuthToken() string {
	return fmt.Sprintf("%d", u.ID)
}

// GetDisplayName returns the best display name for a GitHub user.
func (u *GitHubUser) GetDisplayName() string {
	if u.Name != "" {
		return u.Name
	}
	return u.Login
}
