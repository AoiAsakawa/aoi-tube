package controllers

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
)

// External stream source online detection.
//
// When the operator delegates delivery to an external managed service (AWS IVS
// or an IVS-compatible / self-hosted node), the broadcaster does NOT connect to
// AoiTube's RTMP, so the usual connect/disconnect online signal never fires.
// Instead a background poller fetches the configured external HLS playlist and
// reports the stream online when it is reachable and lists media. The result is
// cached so /api/status (polled frequently by every viewer) never blocks on the
// external request.
var (
	extStreamMu     sync.Mutex
	extStreamOnline bool
	extPollerOnce   sync.Once
)

// ensureExternalStreamPoller starts the poller once, lazily, on first use (so
// the datastore is initialized by then).
func ensureExternalStreamPoller() {
	extPollerOnce.Do(func() { go externalStreamPoller() })
}

func externalStreamPoller() {
	for {
		cfg := data.GetStreamProtocolConfig()
		online := cfg.ExternalStreamEnabled &&
			cfg.ExternalStreamURL != "" &&
			probeExternalPlaylist(cfg.ExternalStreamURL)
		extStreamMu.Lock()
		extStreamOnline = online
		extStreamMu.Unlock()
		time.Sleep(10 * time.Second)
	}
}

// isExternalStreamOnline returns the last polled online state (non-blocking).
func isExternalStreamOnline() bool {
	extStreamMu.Lock()
	defer extStreamMu.Unlock()
	return extStreamOnline
}

// probeExternalPlaylist reports whether an HLS URL is live: reachable with a
// 200 and a playlist that lists at least one media segment (`#EXTINF`) or
// rendition (`#EXT-X-STREAM-INF`).
func probeExternalPlaylist(url string) bool {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	buf := make([]byte, 64*1024)
	n, _ := resp.Body.Read(buf)
	body := string(buf[:n])
	return strings.Contains(body, "#EXTINF") || strings.Contains(body, "#EXT-X-STREAM-INF")
}
