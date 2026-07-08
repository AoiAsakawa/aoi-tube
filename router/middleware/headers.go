package middleware

import (
	"fmt"
	"net/http"
	"strings"
)

// SetHeaders will set our global headers for web resources.
func SetHeaders(w http.ResponseWriter, nonce string) {
	// Content security policy.
	// default-src/connect-src are intentionally not set: playback and payment
	// features talk to external endpoints (S3/CDN segments, crypto RPCs,
	// mempool.space, payment providers) that the admin can reconfigure.
	csp := []string{
		fmt.Sprintf("script-src '%s' 'self'", nonce),
		"worker-src 'self' blob:", // No single quotes around blob:
		"object-src 'none'",
		"base-uri 'self'",
		"frame-ancestors 'self'", // Matches the existing X-Frame-Options below
		"form-action 'self'",
	}
	w.Header().Set("Content-Security-Policy", strings.Join(csp, "; "))

	// Security headers to prevent common attacks
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-XSS-Protection", "1; mode=block")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
	w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
}
