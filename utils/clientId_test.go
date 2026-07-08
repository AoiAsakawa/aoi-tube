package utils

import (
	"net/http/httptest"
	"testing"
)

func TestGetIPAddressFromRequestTrustedProxy(t *testing.T) {
	// These assertions rely on the default trusted-proxy set (loopback + private
	// ranges) since OWNCAST_TRUSTED_PROXIES is unset in the test environment.
	cases := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
		want       string
	}{
		{
			name:       "untrusted public peer ignores spoofed CF header",
			remoteAddr: "203.0.113.5:44321",
			headers:    map[string]string{"CF-Connecting-IP": "1.2.3.4"},
			want:       "203.0.113.5",
		},
		{
			name:       "untrusted public peer ignores spoofed XFF",
			remoteAddr: "203.0.113.5:44321",
			headers:    map[string]string{"X-Forwarded-For": "1.2.3.4"},
			want:       "203.0.113.5",
		},
		{
			name:       "trusted private peer honors CF-Connecting-IP",
			remoteAddr: "10.0.0.1:5000",
			headers:    map[string]string{"CF-Connecting-IP": "1.2.3.4"},
			want:       "1.2.3.4",
		},
		{
			name:       "trusted loopback peer honors left-most XFF client",
			remoteAddr: "127.0.0.1:5000",
			headers:    map[string]string{"X-Forwarded-For": "5.6.7.8, 10.0.0.2"},
			want:       "5.6.7.8",
		},
		{
			name:       "no forwarding headers returns peer",
			remoteAddr: "192.0.2.9:5555",
			headers:    nil,
			want:       "192.0.2.9",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tc.remoteAddr
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}
			if got := GetIPAddressFromRequest(req); got != tc.want {
				t.Errorf("GetIPAddressFromRequest() = %q, want %q", got, tc.want)
			}
		})
	}
}
