package controllers

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"syscall"
	"time"

	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// bouyomiHTTPClient is a hardened HTTP client for the Bouyomi-chan proxy.
// The proxy target host is user-controlled, so this validates the *actual*
// dialed IP (after DNS resolution, closing the DNS-rebinding gap) and blocks
// link-local / metadata (169.254.169.254) / multicast / unspecified addresses.
// Loopback and private LAN ranges stay allowed because that is where
// Bouyomi-chan legitimately runs.
var bouyomiHTTPClient = &http.Client{
	Timeout: 8 * time.Second,
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: 5 * time.Second,
			Control: func(_, address string, _ syscall.RawConn) error {
				host, _, err := net.SplitHostPort(address)
				if err != nil {
					return err
				}
				ip := net.ParseIP(host)
				if ip == nil {
					return fmt.Errorf("unresolved address")
				}
				if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
					return fmt.Errorf("blocked address range")
				}
				return nil
			},
		}).DialContext,
	},
	// Bouyomi-chan responds directly; never follow redirects to another target.
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// BouyomiTalk sends text to Bouyomi-chan for text-to-speech.
func BouyomiTalk(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, "method not supported")
		return
	}

	// This proxy dials an operator-controlled host on the server's network, so
	// it is an SSRF vector if reachable from the internet. Bouyomi-chan is an
	// operator-local tool (same machine or LAN), so only allow requests whose
	// real client IP is loopback or private — internet clients are rejected.
	clientIP := net.ParseIP(utils.GetIPAddressFromRequest(r))
	if clientIP == nil || !(clientIP.IsLoopback() || clientIP.IsPrivate()) {
		WriteSimpleResponse(w, false, "this endpoint is only available on the local network")
		return
	}

	// Read request parameters
	query := r.URL.Query()
	text := query.Get("text")
	if text == "" {
		WriteSimpleResponse(w, false, "text is required")
		return
	}

	host := query.Get("host")
	if host == "" {
		host = "localhost"
	}

	port := query.Get("port")
	if port == "" {
		port = "50080"
	}

	speed := query.Get("speed")
	if speed == "" {
		speed = "-1"
	}

	tone := query.Get("tone")
	if tone == "" {
		tone = "-1"
	}

	volume := query.Get("volume")
	if volume == "" {
		volume = "-1"
	}

	voice := query.Get("voice")
	if voice == "" {
		voice = "0"
	}

	// Validate the port number
	portNum, err := strconv.Atoi(port)
	if err != nil || portNum < 1 || portNum > 65535 {
		WriteSimpleResponse(w, false, "invalid port number")
		return
	}

	// Build the Bouyomi-chan URL
	bouyomiURL := fmt.Sprintf("http://%s:%s/Talk?text=%s&speed=%s&tone=%s&volume=%s&voice=%s",
		host,
		port,
		url.QueryEscape(text),
		speed,
		tone,
		volume,
		voice,
	)

	log.Debugln("Bouyomi request URL:", bouyomiURL)

	// Send the request to Bouyomi-chan (via the hardened client that validates dial targets)
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, bouyomiURL, nil)
	if err != nil {
		WriteSimpleResponse(w, false, "invalid request")
		return
	}
	resp, err := bouyomiHTTPClient.Do(req)
	if err != nil {
		// Do not reflect the connection error back to the caller: it would turn
		// this endpoint into a blind SSRF / port-scan oracle.
		log.Debugln("Bouyomi request failed:", err)
		WriteSimpleResponse(w, false, "failed to connect to Bouyomi-chan")
		return
	}
	defer resp.Body.Close()

	// Discard the response body
	_, _ = io.Copy(io.Discard, resp.Body)

	WriteSimpleResponse(w, true, "sent to Bouyomi-chan")
}
