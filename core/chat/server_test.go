package chat

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/aoiasakawa/aoitube/core/data"
)

func makeWsRequest(t *testing.T, host, origin string) *http.Request {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, "/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	r.Host = host
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	return r
}

func TestCheckWsOrigin(t *testing.T) {
	if err := data.SetupPersistence(filepath.Join(t.TempDir(), "test.db")); err != nil {
		t.Fatalf("failed to set up datastore: %v", err)
	}
	if err := data.SetServerURL("https://live.example.com"); err != nil {
		t.Fatalf("failed to set server url: %v", err)
	}

	tests := []struct {
		name    string
		host    string
		origin  string
		env     string
		allowed bool
	}{
		{"no origin (desktop clients)", "live.example.com", "", "", true},
		{"null origin (OBS browser source)", "live.example.com", "null", "", true},
		{"same host", "live.example.com", "https://live.example.com", "", true},
		{"same host with port", "live.example.com:8000", "http://live.example.com:8000", "", true},
		{"behind proxy, origin matches server url", "10.0.0.5:8000", "https://live.example.com", "", true},
		{"cross-origin rejected", "live.example.com", "https://evil.example.net", "", false},
		{"subdomain rejected", "live.example.com", "https://sub.live.example.com", "", false},
		{"env allowlist", "live.example.com", "https://widgets.example.org", "widgets.example.org", true},
		{"env allowlist with spaces", "live.example.com", "https://widgets.example.org", " widgets.example.org , other.example.org", true},
		{"env wildcard", "live.example.com", "https://anything.example.org", "*", true},
		{"garbage origin rejected", "live.example.com", "http://", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("OWNCAST_ALLOWED_WS_ORIGINS", tt.env)
			r := makeWsRequest(t, tt.host, tt.origin)
			if got := checkWsOrigin(r); got != tt.allowed {
				t.Errorf("checkWsOrigin(host=%q, origin=%q, env=%q) = %v, want %v", tt.host, tt.origin, tt.env, got, tt.allowed)
			}
		})
	}
}
