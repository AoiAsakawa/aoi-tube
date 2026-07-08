package indieauth

import (
	"crypto/rand"
	"math/big"
)

const letterBytes = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

// randString returns a cryptographically-random string of length n. It backs
// the IndieAuth PKCE code verifier and CSRF state, so it must not be
// predictable — hence crypto/rand rather than the previous time-seeded
// math/rand.
func randString(n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(letterBytes)))
	for i := range b {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand should never fail; refuse to emit a weak value.
			panic("indieauth: crypto/rand failed: " + err.Error())
		}
		b[i] = letterBytes[idx.Int64()]
	}
	return string(b)
}
