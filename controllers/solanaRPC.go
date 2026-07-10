package controllers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
)

// Solana's public node refuses browser-origin requests (HTTP 403 "Access
// forbidden"), and a private node's URL usually embeds an API key that must not
// reach the client. So the donation form talks to this same-origin proxy instead
// of the chain directly.
//
// A JSON-RPC proxy is an open relay unless it is constrained, so this one:
//   - only runs while Metamask payments are enabled,
//   - accepts POST with a bounded body,
//   - forwards only the methods the donation form actually needs.
//
// Everything here is read-only except sendTransaction, which merely broadcasts
// an already-signed transaction — the signature comes from the viewer's wallet,
// and the payment is still verified independently on-chain before it is credited.
var solanaProxyAllowedMethods = map[string]bool{
	"getAccountInfo":                    true,
	"getBalance":                        true,
	"getLatestBlockhash":                true,
	"getMinimumBalanceForRentExemption": true,
	"getSignatureStatuses":              true,
	"getTokenAccountBalance":            true,
	"sendTransaction":                   true,
	"getHealth":                         true,
	"getVersion":                        true,
}

// solanaProxyMaxBody bounds a request; a signed Solana transaction is ~1.2 KB,
// so 256 KB leaves ample room for a batch while capping abuse.
const solanaProxyMaxBody = 256 << 10

// solanaRPCRequest is the subset of a JSON-RPC call we need to police. web3.js
// sends either a single object or a batch array.
type solanaRPCRequest struct {
	Method string `json:"method"`
}

// allowedSolanaRPCBody reports whether every call in the (possibly batched) body
// is on the allowlist.
func allowedSolanaRPCBody(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return false
	}

	if trimmed[0] == '[' {
		var batch []solanaRPCRequest
		if err := json.Unmarshal(trimmed, &batch); err != nil || len(batch) == 0 {
			return false
		}
		for _, call := range batch {
			if !solanaProxyAllowedMethods[call.Method] {
				return false
			}
		}
		return true
	}

	var single solanaRPCRequest
	if err := json.Unmarshal(trimmed, &single); err != nil {
		return false
	}
	return solanaProxyAllowedMethods[single.Method]
}

// SolanaRPCProxy forwards an allowlisted Solana JSON-RPC call to the configured
// node, keeping the node's URL (and any API key in it) server-side.
func SolanaRPCProxy(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !data.GetMetamaskConfig().Enabled {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, solanaProxyMaxBody))
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !allowedSolanaRPCBody(body) {
		log.Debugln("solana rpc proxy: rejected a request with a disallowed method")
		w.WriteHeader(http.StatusForbidden)
		return
	}

	req, err := http.NewRequestWithContext(
		r.Context(), http.MethodPost, solanaRPCEndpoint(), bytes.NewReader(body),
	)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Errorf("solana rpc proxy: upstream request failed: %v", err)
		w.WriteHeader(http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	upstream, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(upstream)
}
