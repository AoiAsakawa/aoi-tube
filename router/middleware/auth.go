package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// Rate limiting for authentication attempts
var (
	authAttempts     = make(map[string]*rateLimitEntry)
	authAttemptsLock sync.Mutex
)

type rateLimitEntry struct {
	attempts    int
	lastReset   time.Time
	lockedUntil time.Time
}

const (
	maxAuthAttempts       = 5                // Maximum attempts before lockout
	authLockoutPeriod     = 15 * time.Minute // Lockout duration once tripped
	authAttemptWindow     = 5 * time.Minute  // Window for counting attempts
	maxAuthAttemptEntries = 10000            // Backstop against map flooding
)

func init() {
	// Periodically evict expired rate-limit entries so the map cannot grow
	// unboundedly (e.g. from many distinct client IPs).
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			pruneAuthAttempts()
		}
	}()
}

// pruneAuthAttempts removes stale entries and enforces a hard size cap.
func pruneAuthAttempts() {
	authAttemptsLock.Lock()
	defer authAttemptsLock.Unlock()

	now := time.Now()
	for ip, entry := range authAttempts {
		if now.Sub(entry.lastReset) > authAttemptWindow && now.After(entry.lockedUntil) {
			delete(authAttempts, ip)
		}
	}

	// Backstop: if still oversized, drop any entry not currently locked out.
	if len(authAttempts) > maxAuthAttemptEntries {
		for ip, entry := range authAttempts {
			if now.After(entry.lockedUntil) {
				delete(authAttempts, ip)
			}
			if len(authAttempts) <= maxAuthAttemptEntries {
				break
			}
		}
	}
}

// isRateLimited checks if an IP is rate limited for authentication
func isAuthRateLimited(ip string) bool {
	authAttemptsLock.Lock()
	defer authAttemptsLock.Unlock()

	entry, exists := authAttempts[ip]
	if !exists {
		return false
	}

	// Honor an active lockout regardless of the counting window.
	if time.Now().Before(entry.lockedUntil) {
		return true
	}

	// Reset counter if window has passed
	if time.Since(entry.lastReset) > authAttemptWindow {
		delete(authAttempts, ip)
		return false
	}

	return entry.attempts >= maxAuthAttempts
}

// recordAuthFailure records a failed authentication attempt
func recordAuthFailure(ip string) {
	authAttemptsLock.Lock()
	defer authAttemptsLock.Unlock()

	entry, exists := authAttempts[ip]
	if !exists {
		authAttempts[ip] = &rateLimitEntry{
			attempts:  1,
			lastReset: time.Now(),
		}
		return
	}

	// Reset if window has passed
	if time.Since(entry.lastReset) > authAttemptWindow {
		entry.attempts = 1
		entry.lastReset = time.Now()
		entry.lockedUntil = time.Time{}
	} else {
		entry.attempts++
		// Once the threshold is hit, enforce a fixed lockout period.
		if entry.attempts >= maxAuthAttempts {
			entry.lockedUntil = time.Now().Add(authLockoutPeriod)
		}
	}
}

// clearAuthAttempts clears failed attempts for an IP after successful login
func clearAuthAttempts(ip string) {
	authAttemptsLock.Lock()
	defer authAttemptsLock.Unlock()
	delete(authAttempts, ip)
}

// ExternalAccessTokenHandlerFunc is a function that is called after validing access.
type ExternalAccessTokenHandlerFunc func(user.ExternalAPIUser, http.ResponseWriter, *http.Request)

// UserAccessTokenHandlerFunc is a function that is called after validing user access.
type UserAccessTokenHandlerFunc func(user.User, http.ResponseWriter, *http.Request)

// RequireAdminAuth wraps a handler requiring HTTP basic auth for it using the given
// the stream key as the password and and a hardcoded "admin" for username.
func RequireAdminAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := "admin"
		realm := "AoiTube Authenticated Request"

		// Allow CORS only for localhost:3000 to support AoiTube development.
		// Reflecting the request Origin here would let any site make
		// credentialed admin API requests, so keep this an explicit value.
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")

		// For request needing CORS, send a 204.
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Check rate limiting
		clientIP := utils.GetIPAddressFromRequest(r)
		if isAuthRateLimited(clientIP) {
			http.Error(w, "Too many authentication attempts. Please try again later.", http.StatusTooManyRequests)
			log.Warnf("Rate limited authentication attempt from %s", clientIP)
			return
		}

		user, pass, ok := r.BasicAuth()

		// Failed: check username with constant time comparison, then verify password with bcrypt
		if !ok || subtle.ConstantTimeCompare([]byte(user), []byte(username)) != 1 || !data.VerifyAdminPassword(pass) {
			recordAuthFailure(clientIP)
			w.Header().Set("WWW-Authenticate", `Basic realm="`+realm+`"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			log.Debugln("Failed admin authentication")
			return
		}

		// Clear rate limit on successful auth
		clearAuthAttempts(clientIP)

		handler(w, r)
	}
}

func accessDenied(w http.ResponseWriter) {
	w.WriteHeader(http.StatusUnauthorized) //nolint
	w.Write([]byte("unauthorized"))        //nolint
}

// RequireExternalAPIAccessToken will validate a 3rd party access token.
func RequireExternalAPIAccessToken(scope string, handler ExternalAccessTokenHandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// We should accept 3rd party preflight OPTIONS requests.
		if r.Method == "OPTIONS" {
			// All OPTIONS requests should have a wildcard CORS header.
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		authHeader := strings.Split(r.Header.Get("Authorization"), "Bearer ")
		token := strings.Join(authHeader, "")

		if len(authHeader) == 0 || token == "" {
			log.Warnln("invalid access token")
			accessDenied(w)
			return
		}

		integration, err := user.GetExternalAPIUserForAccessTokenAndScope(token, scope)
		if integration == nil || err != nil {
			accessDenied(w)
			return
		}

		// All auth'ed 3rd party requests should have a wildcard CORS header.
		w.Header().Set("Access-Control-Allow-Origin", "*")

		handler(*integration, w, r)

		if err := user.SetExternalAPIUserAccessTokenAsUsed(token); err != nil {
			log.Debugln("token not found when updating last_used timestamp")
		}
	})
}

// RequireUserAccessToken will validate a provided user's access token and make sure the associated user is enabled.
// Not to be used for validating 3rd party access.
func RequireUserAccessToken(handler UserAccessTokenHandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		accessToken := r.URL.Query().Get("accessToken")
		if accessToken == "" {
			accessDenied(w)
			return
		}

		ipAddress := utils.GetIPAddressFromRequest(r)
		// Check if this client's IP address is banned.
		if blocked, err := data.IsIPAddressBanned(ipAddress); blocked {
			log.Debugln("Client ip address has been blocked. Rejecting.")
			accessDenied(w)
			return
		} else if err != nil {
			log.Errorln("error determining if IP address is blocked: ", err)
		}

		// A user is required to use the websocket
		user := user.GetUserByToken(accessToken)
		if user == nil || !user.IsEnabled() {
			accessDenied(w)
			return
		}

		handler(*user, w, r)
	})
}

// RequireUserModerationScopeAccesstoken will validate a provided user's access token and make sure the associated user is enabled
// and has "MODERATOR" scope assigned to the user.
func RequireUserModerationScopeAccesstoken(handler http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		accessToken := r.URL.Query().Get("accessToken")
		if accessToken == "" {
			accessDenied(w)
			return
		}

		// A user is required to use the websocket
		user := user.GetUserByToken(accessToken)
		if user == nil || !user.IsEnabled() || !user.IsModerator() {
			accessDenied(w)
			return
		}

		handler(w, r)
	})
}
