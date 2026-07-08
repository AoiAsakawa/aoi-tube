package utils

import (
	"crypto/md5" //nolint
	"encoding/hex"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"

	log "github.com/sirupsen/logrus"
)

// GenerateClientIDFromRequest generates a client id from the provided request.
func GenerateClientIDFromRequest(req *http.Request) string {
	ipAddress := GetIPAddressFromRequest(req)
	clientID := ipAddress + req.UserAgent()

	// Create a MD5 hash of this ip + useragent
	b := md5.Sum([]byte(clientID)) // nolint
	return hex.EncodeToString(b[:])
}

// Trusted reverse-proxy handling. Client-supplied forwarding headers
// (CF-Connecting-IP, X-Forwarded-For, X-Real-IP) are only honored when the
// direct connection comes from a trusted proxy; otherwise a client could spoof
// them to evade per-IP rate limiting and IP bans.
//
// Configure external proxies (e.g. Cloudflare) via the OWNCAST_TRUSTED_PROXIES
// environment variable: a comma-separated list of CIDRs, or the literal "all"
// to trust every peer (restores the legacy trust-all behavior). When unset, a
// same-host / LAN reverse proxy is trusted by default.
var (
	trustedProxyNets     []*net.IPNet
	trustedProxyTrustAll bool
	trustedProxyOnce     sync.Once
)

var defaultTrustedProxyCIDRs = func() []string {
	local := []string{
		"127.0.0.0/8", "::1/128", // loopback
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", // RFC1918
		"100.64.0.0/10", // CGNAT (container/mesh networks)
		"fc00::/7",      // unique local IPv6
	}
	// Cloudflare edge ranges (https://www.cloudflare.com/ips/). Included by
	// default so CF-Connecting-IP works out of the box for the common Cloudflare
	// deployment, while spoofed headers sent directly to the origin (a non-CF
	// peer) are still ignored.
	cloudflare := []string{
		"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
		"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
		"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
		"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
		"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
		"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
	}
	return append(local, cloudflare...)
}()

func loadTrustedProxies() {
	raw := strings.TrimSpace(os.Getenv("OWNCAST_TRUSTED_PROXIES"))
	if strings.EqualFold(raw, "all") {
		trustedProxyTrustAll = true
		log.Warnln("OWNCAST_TRUSTED_PROXIES=all: forwarding headers are trusted from any peer; per-IP rate limiting and bans can be spoofed.")
		return
	}

	cidrs := defaultTrustedProxyCIDRs
	if raw != "" {
		cidrs = strings.Split(raw, ",")
	}
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(c); err == nil {
			trustedProxyNets = append(trustedProxyNets, network)
		} else {
			log.Warnf("Ignoring invalid trusted proxy CIDR %q: %v", c, err)
		}
	}
}

func isTrustedProxy(ip net.IP) bool {
	trustedProxyOnce.Do(loadTrustedProxies)
	if trustedProxyTrustAll {
		return true
	}
	for _, n := range trustedProxyNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func firstValidIP(value string) string {
	value = strings.TrimSpace(value)
	if value != "" && net.ParseIP(value) != nil {
		return value
	}
	return ""
}

// GetCountryHintFromRequest returns the viewer country code supplied by a
// trusted edge proxy (Cloudflare's CF-IPCountry header), or "" when absent.
// The edge sees the real client connection, so this is more accurate than a
// local GeoIP database. Placeholder codes ("XX" unknown, "T1" Tor) are
// treated as no data.
func GetCountryHintFromRequest(req *http.Request) string {
	peer := req.RemoteAddr
	if host, _, err := net.SplitHostPort(peer); err == nil {
		peer = host
	}
	peerIP := net.ParseIP(peer)
	if peerIP == nil || !isTrustedProxy(peerIP) {
		return ""
	}

	country := strings.ToUpper(strings.TrimSpace(req.Header.Get("CF-IPCountry")))
	if len(country) != 2 || country == "XX" || country == "T1" {
		return ""
	}
	return country
}

// GetIPAddressFromRequest returns the IP address from a http request.
// Proxy forwarding headers are consulted only when the direct peer is a trusted
// proxy (see OWNCAST_TRUSTED_PROXIES); otherwise the direct peer address is used.
func GetIPAddressFromRequest(req *http.Request) string {
	// The direct peer address is always authoritative and cannot be spoofed.
	peer := req.RemoteAddr
	if host, _, err := net.SplitHostPort(peer); err == nil {
		peer = host
	}
	peerIP := net.ParseIP(peer)

	if peerIP != nil && isTrustedProxy(peerIP) {
		// Cloudflare sets a single, non-spoofable-through-CF connecting IP.
		if ip := firstValidIP(req.Header.Get("CF-Connecting-IP")); ip != "" {
			return ip
		}
		// X-Forwarded-For may contain "client, proxy1, proxy2"; the left-most is
		// the original client.
		if xff := req.Header.Get("X-Forwarded-For"); xff != "" {
			if ip := firstValidIP(strings.Split(xff, ",")[0]); ip != "" {
				return ip
			}
		}
		if ip := firstValidIP(req.Header.Get("X-Real-IP")); ip != "" {
			return ip
		}
	}

	if peerIP != nil {
		return peer
	}

	// Fall back to RemoteAddr parsing for anything unexpected.
	ip, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		log.Errorln(err)
		return ""
	}
	return ip
}
