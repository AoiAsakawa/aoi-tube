package controllers

import "testing"

func TestAllowedSolanaRPCBodySingle(t *testing.T) {
	allowed := []string{
		`{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["abc"]}`,
		`{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash"}`,
		`{"jsonrpc":"2.0","id":1,"method":"sendTransaction","params":["base64tx"]}`,
		"  \n" + `{"jsonrpc":"2.0","id":1,"method":"getAccountInfo"}`, // leading whitespace
	}
	for _, body := range allowed {
		if !allowedSolanaRPCBody([]byte(body)) {
			t.Errorf("expected %s to be allowed", body)
		}
	}
}

// The proxy must not become an open relay for arbitrary RPC: only the methods
// the donation form needs may pass.
func TestAllowedSolanaRPCBodyRejectsDisallowed(t *testing.T) {
	rejected := map[string]string{
		"unlisted method":  `{"jsonrpc":"2.0","id":1,"method":"getProgramAccounts"}`,
		"subscription":     `{"jsonrpc":"2.0","id":1,"method":"accountSubscribe"}`,
		"airdrop":          `{"jsonrpc":"2.0","id":1,"method":"requestAirdrop"}`,
		"missing method":   `{"jsonrpc":"2.0","id":1}`,
		"not json":         `hello`,
		"empty":            ``,
		"whitespace only":  `   `,
		"empty batch":      `[]`,
		"null":             `null`,
		"method not a str": `{"jsonrpc":"2.0","id":1,"method":123}`,
	}
	for name, body := range rejected {
		if allowedSolanaRPCBody([]byte(body)) {
			t.Errorf("%s: expected %q to be rejected", name, body)
		}
	}
}

func TestAllowedSolanaRPCBodyBatch(t *testing.T) {
	ok := `[{"method":"getBalance"},{"method":"getLatestBlockhash"}]`
	if !allowedSolanaRPCBody([]byte(ok)) {
		t.Error("a batch of allowed methods must pass")
	}

	// One bad call in a batch poisons the whole request.
	mixed := `[{"method":"getBalance"},{"method":"getProgramAccounts"}]`
	if allowedSolanaRPCBody([]byte(mixed)) {
		t.Error("a batch containing a disallowed method must be rejected")
	}
}
