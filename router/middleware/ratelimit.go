package middleware

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/utils"
)

// A handful of public endpoints let an anonymous client make the server spend
// something that isn't its own: a call to a payment provider, a lookup on a
// blockchain node, quota on an RPC plan the operator pays for. They only had
// functional checks (an allowlist of RPC methods, a body size cap), so one
// client could call them as fast as the network allowed.
//
// RateLimiter is a token bucket per client. A client may make `burst` calls at
// once and then `perMinute` calls a minute; anything beyond gets 429 with a
// Retry-After header.

// rateLimitMaxClients caps the bookkeeping. When it is reached, clients that
// have been idle long enough to have a full bucket again are forgotten first.
const rateLimitMaxClients = 20000

// rateLimitSweepEvery is how many calls pass between sweeps for idle clients.
const rateLimitSweepEvery = 1000

type tokenBucket struct {
	tokens   float64
	lastSeen time.Time
}

// RateLimiter limits how often one client may call the handlers it wraps.
// Handlers wrapped by the same limiter share one budget per client.
type RateLimiter struct {
	mu        sync.Mutex
	perSecond float64
	burst     float64
	clients   map[string]*tokenBucket
	calls     int
	now       func() time.Time
}

// NewRateLimiter returns a limiter that lets each client make burst calls at
// once and perMinute calls a minute after that.
func NewRateLimiter(perMinute, burst int) *RateLimiter {
	return &RateLimiter{
		perSecond: float64(perMinute) / 60,
		burst:     float64(burst),
		clients:   map[string]*tokenBucket{},
		now:       time.Now,
	}
}

// allow takes one token from the client's bucket. When the bucket is empty it
// returns false and how long until the next token.
func (l *RateLimiter) allow(client string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.calls++
	if l.calls%rateLimitSweepEvery == 0 || len(l.clients) >= rateLimitMaxClients {
		l.forgetIdle(now)
	}

	bucket := l.clients[client]
	if bucket == nil {
		if len(l.clients) >= rateLimitMaxClients {
			// Still full after the sweep: every tracked client is active.
			// Refuse the newcomer rather than let the map grow without bound.
			return false, time.Second
		}
		bucket = &tokenBucket{tokens: l.burst, lastSeen: now}
		l.clients[client] = bucket
	} else {
		bucket.tokens = math.Min(l.burst, bucket.tokens+now.Sub(bucket.lastSeen).Seconds()*l.perSecond)
		bucket.lastSeen = now
	}

	if bucket.tokens < 1 {
		wait := time.Duration((1 - bucket.tokens) / l.perSecond * float64(time.Second))
		return false, wait
	}
	bucket.tokens--
	return true, 0
}

// forgetIdle drops clients whose bucket has had time to refill completely:
// forgetting them changes nothing about what they may do next. Callers hold
// l.mu.
func (l *RateLimiter) forgetIdle(now time.Time) {
	refill := time.Duration(l.burst / l.perSecond * float64(time.Second))
	for client, bucket := range l.clients {
		if now.Sub(bucket.lastSeen) >= refill {
			delete(l.clients, client)
		}
	}
}

// rateLimitClient identifies the caller for rate limiting. An IPv6 client is
// its /64, the usual size of one subscriber's allocation: limiting single
// addresses would let anyone rotate through the 2^64 they have been given.
func rateLimitClient(r *http.Request) string {
	address := utils.GetIPAddressFromRequest(r)
	ip := net.ParseIP(address)
	if ip == nil || ip.To4() != nil {
		return address
	}
	return ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

// Wrap returns a handler that answers 429 Too Many Requests once the calling
// client is over the limit, and calls next otherwise. CORS preflights pass
// through without being counted.
func (l *RateLimiter) Wrap(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next(w, r)
			return
		}

		allowed, wait := l.allow(rateLimitClient(r))
		if !allowed {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"success":false,"message":"Too many requests. Please wait a moment and try again."}`))
			return
		}
		next(w, r)
	}
}
