package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// limiterAt returns a limiter running on a clock the test moves.
func limiterAt(perMinute, burst int) (*RateLimiter, *time.Time) {
	now := time.Date(2026, 11, 21, 12, 0, 0, 0, time.UTC)
	l := NewRateLimiter(perMinute, burst)
	l.now = func() time.Time { return now }
	return l, &now
}

func TestRateLimiterAllowsABurstThenRefills(t *testing.T) {
	l, now := limiterAt(60, 3) // one token a second, three to start with

	for i := 0; i < 3; i++ {
		if ok, _ := l.allow("a"); !ok {
			t.Fatalf("call %d of the burst was refused", i+1)
		}
	}
	ok, wait := l.allow("a")
	if ok {
		t.Fatal("the call after the burst was allowed")
	}
	if wait <= 0 || wait > time.Second {
		t.Errorf("wait = %v, want up to one second", wait)
	}

	*now = now.Add(2500 * time.Millisecond)
	for i := 0; i < 2; i++ {
		if ok, _ := l.allow("a"); !ok {
			t.Fatalf("call %d after refilling was refused", i+1)
		}
	}
	if ok, _ := l.allow("a"); ok {
		t.Error("2.5 seconds refilled more than two tokens")
	}

	// The bucket never holds more than the burst, however long the pause.
	*now = now.Add(time.Hour)
	allowed := 0
	for i := 0; i < 10; i++ {
		if ok, _ := l.allow("a"); ok {
			allowed++
		}
	}
	if allowed != 3 {
		t.Errorf("after a long pause %d calls were allowed, want the burst of 3", allowed)
	}
}

func TestRateLimiterTracksClientsSeparately(t *testing.T) {
	l, _ := limiterAt(60, 1)

	if ok, _ := l.allow("a"); !ok {
		t.Fatal("first call of a was refused")
	}
	if ok, _ := l.allow("a"); ok {
		t.Fatal("second call of a was allowed")
	}
	if ok, _ := l.allow("b"); !ok {
		t.Error("b was refused because a used up its own budget")
	}
}

func TestRateLimiterForgetsIdleClients(t *testing.T) {
	l, now := limiterAt(60, 2)

	for i := 0; i < 50; i++ {
		l.allow(fmt.Sprintf("client-%d", i))
	}
	if len(l.clients) != 50 {
		t.Fatalf("tracking %d clients, want 50", len(l.clients))
	}

	// Two seconds refill a burst of two: forgetting these clients is harmless.
	*now = now.Add(3 * time.Second)
	l.mu.Lock()
	l.forgetIdle(*now)
	l.mu.Unlock()
	if len(l.clients) != 0 {
		t.Errorf("%d idle clients are still tracked", len(l.clients))
	}
}

func TestRateLimiterRefusesNewClientsWhenFull(t *testing.T) {
	l, _ := limiterAt(60, 2)
	for i := 0; i < rateLimitMaxClients; i++ {
		l.clients[fmt.Sprintf("busy-%d", i)] = &tokenBucket{tokens: 0, lastSeen: l.now()}
	}

	if ok, _ := l.allow("newcomer"); ok {
		t.Error("a new client was admitted with the table full of active clients")
	}
	if len(l.clients) > rateLimitMaxClients {
		t.Errorf("the table grew to %d entries, past its cap", len(l.clients))
	}
	if ok, _ := l.allow("busy-0"); ok {
		t.Error("an exhausted client was allowed")
	}
}

func TestRateLimitClientGroupsIPv6BySubnet(t *testing.T) {
	client := func(remoteAddr string) string {
		r := httptest.NewRequest(http.MethodPost, "/api/solana/rpc", nil)
		r.RemoteAddr = remoteAddr
		return rateLimitClient(r)
	}

	if got := client("203.0.113.7:51000"); got != "203.0.113.7" {
		t.Errorf("IPv4 client = %q, want its address", got)
	}
	a := client("[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:51000")
	b := client("[2001:db8:1:2::1]:51000")
	other := client("[2001:db8:1:3::1]:51000")
	if a != b {
		t.Errorf("two addresses in one /64 are separate clients: %q and %q", a, b)
	}
	if a == other {
		t.Errorf("addresses in different /64s are the same client: %q", a)
	}
}

func TestRateLimiterWrap(t *testing.T) {
	l, _ := limiterAt(60, 2)
	calls := 0
	handler := l.Wrap(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	})

	do := func(method, remoteAddr string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/payments/create", nil)
		r.RemoteAddr = remoteAddr
		w := httptest.NewRecorder()
		handler(w, r)
		return w
	}

	for i := 0; i < 2; i++ {
		if w := do(http.MethodPost, "203.0.113.7:51000"); w.Code != http.StatusOK {
			t.Fatalf("call %d: status %d, want 200", i+1, w.Code)
		}
	}

	w := do(http.MethodPost, "203.0.113.7:51001")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("third call: status %d, want 429", w.Code)
	}
	if got := w.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
	if got := w.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	if calls != 2 {
		t.Errorf("the handler ran %d times, want 2", calls)
	}

	// A preflight is not a call, and another client has its own budget.
	if w := do(http.MethodOptions, "203.0.113.7:51002"); w.Code != http.StatusOK {
		t.Errorf("preflight from a limited client: status %d, want 200", w.Code)
	}
	if w := do(http.MethodPost, "198.51.100.9:40000"); w.Code != http.StatusOK {
		t.Errorf("another client: status %d, want 200", w.Code)
	}
}
