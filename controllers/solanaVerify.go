package controllers

import (
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	log "github.com/sirupsen/logrus"
)

// defaultSolanaRPCEndpoint is the keyless public mainnet node used when the
// operator hasn't configured their own. It is heavily rate limited (and refuses
// browser-origin requests outright, which is why /api/solana/rpc proxies for the
// donation form), so a busy deployment should set MetamaskConfig.SolanaRPCURL.
const defaultSolanaRPCEndpoint = "https://api.mainnet-beta.solana.com"

// solanaRPCEndpoint resolves the Solana JSON-RPC node: the operator's configured
// one, else the public fallback. Shared by on-chain verification and the proxy so
// both observe the same chain view.
func solanaRPCEndpoint() string {
	if url := strings.TrimSpace(data.GetMetamaskConfig().SolanaRPCURL); url != "" {
		return url
	}
	return defaultSolanaRPCEndpoint
}

// solanaSPLMints allowlists the SPL token mints the server can price, keyed by
// mint address with the AUTHORITATIVE symbol as the value.
//
// This allowlist is a security control, not a convenience: anyone can mint an
// SPL token and name it "USDC", so the symbol is always derived from the mint
// observed on-chain and never from the client-supplied tokenSymbol. A transfer
// of any mint outside this map is not credited — otherwise a worthless token
// could pay for a fixed-price screen effect.
var solanaSPLMints = map[string]string{
	"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
	"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
}

// solanaLamportDecimals is the number of decimals in one SOL (1e9 lamports).
const solanaLamportDecimals = 9

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func isBase58(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if !strings.ContainsRune(base58Alphabet, c) {
			return false
		}
	}
	return true
}

// isSolanaSignature reports whether s looks like a Solana transaction signature:
// 64 raw bytes rendered as base58, i.e. 86-88 characters. This is unambiguous
// against the other chains we accept — EVM hashes are 0x-prefixed and 66 chars,
// Bitcoin txids are 64 hex chars.
func isSolanaSignature(s string) bool {
	if strings.HasPrefix(s, "0x") {
		return false
	}
	if len(s) < 86 || len(s) > 88 {
		return false
	}
	return isBase58(s)
}

// IsSolanaAddress reports whether s looks like a Solana account (32 raw bytes
// as base58, 32-44 characters).
func IsSolanaAddress(s string) bool {
	if len(s) < 32 || len(s) > 44 {
		return false
	}
	return isBase58(s)
}

// solanaTokenAmount is the raw + scale pair the RPC returns for token balances.
type solanaTokenAmount struct {
	Amount   string `json:"amount"` // raw integer as a string
	Decimals int    `json:"decimals"`
}

// solanaTokenBalance is one entry of meta.pre/postTokenBalances. Owner is the
// wallet that owns the token account, so matching on it covers the operator's
// associated token account without having to derive the ATA ourselves.
type solanaTokenBalance struct {
	AccountIndex  int               `json:"accountIndex"`
	Mint          string            `json:"mint"`
	Owner         string            `json:"owner"`
	UITokenAmount solanaTokenAmount `json:"uiTokenAmount"`
}

type solanaTxMeta struct {
	// Err is null on success and an object describing the failure otherwise.
	Err               interface{}          `json:"err"`
	PreBalances       []int64              `json:"preBalances"`
	PostBalances      []int64              `json:"postBalances"`
	PreTokenBalances  []solanaTokenBalance `json:"preTokenBalances"`
	PostTokenBalances []solanaTokenBalance `json:"postTokenBalances"`
}

type solanaAccountKey struct {
	Pubkey string `json:"pubkey"`
}

type solanaTxResult struct {
	Meta        *solanaTxMeta `json:"meta"`
	Transaction struct {
		Message struct {
			AccountKeys []solanaAccountKey `json:"accountKeys"`
		} `json:"message"`
	} `json:"transaction"`
}

// solanaGetTransaction fetches a FINALIZED transaction. Finalized commitment is
// Solana's reorg-safety floor and plays the role minEVMConfirmations does on
// EVM chains: an unfinalized (or missing) transaction returns an error so the
// caller can keep polling rather than credit a payment that may still vanish.
func solanaGetTransaction(signature string) (*solanaTxResult, error) {
	var out solanaTxResult
	params := []interface{}{
		signature,
		map[string]interface{}{
			"encoding":                       "jsonParsed",
			"commitment":                     "finalized",
			"maxSupportedTransactionVersion": 0,
		},
	}
	// ethRPCCall is a plain JSON-RPC 2.0 POST helper (nothing EVM-specific) and
	// already treats a null result as "not found", which is what an unfinalized
	// signature returns.
	if err := ethRPCCall(solanaRPCEndpoint(), "getTransaction", params, &out); err != nil {
		return nil, err
	}
	if out.Meta == nil {
		return nil, fmt.Errorf("transaction has no metadata")
	}
	return &out, nil
}

// solanaSPLCredit returns the SPL token amount credited to owner by this
// transaction, together with the mint's authoritative symbol and decimals.
// Only allowlisted mints are considered; a transfer of an unknown mint is
// ignored (and therefore never credited).
func solanaSPLCredit(res *solanaTxResult, owner string) (*big.Int, string, int, bool) {
	preByIndex := make(map[int]solanaTokenBalance, len(res.Meta.PreTokenBalances))
	for _, b := range res.Meta.PreTokenBalances {
		preByIndex[b.AccountIndex] = b
	}

	for _, post := range res.Meta.PostTokenBalances {
		// Solana addresses are base58 and case-sensitive: compare exactly.
		if post.Owner != owner {
			continue
		}
		symbol, allowed := solanaSPLMints[post.Mint]
		if !allowed {
			log.Debugf("solana: ignoring transfer of unlisted mint %s to operator", post.Mint)
			continue
		}

		postAmount, ok := new(big.Int).SetString(post.UITokenAmount.Amount, 10)
		if !ok {
			continue
		}
		preAmount := big.NewInt(0)
		if pre, found := preByIndex[post.AccountIndex]; found && pre.Mint == post.Mint {
			if parsed, ok := new(big.Int).SetString(pre.UITokenAmount.Amount, 10); ok {
				preAmount = parsed
			}
		}

		delta := new(big.Int).Sub(postAmount, preAmount)
		if delta.Sign() > 0 {
			return delta, symbol, post.UITokenAmount.Decimals, true
		}
	}
	return nil, "", 0, false
}

// solanaNativeCredit returns the lamports credited to owner by this transaction,
// derived from the balance delta of the operator's account.
func solanaNativeCredit(res *solanaTxResult, owner string) (int64, bool) {
	keys := res.Transaction.Message.AccountKeys
	index := -1
	for i, key := range keys {
		if key.Pubkey == owner {
			index = i
			break
		}
	}
	if index < 0 {
		return 0, false
	}
	if index >= len(res.Meta.PreBalances) || index >= len(res.Meta.PostBalances) {
		return 0, false
	}
	delta := res.Meta.PostBalances[index] - res.Meta.PreBalances[index]
	if delta <= 0 {
		return 0, false
	}
	return delta, true
}

// verifySolanaTx confirms that a Solana transaction paid the operator's account
// and returns the verified amount (1e8 fixed point, like the other chains) with
// the AUTHORITATIVE currency symbol taken from the chain — the SPL mint or SOL —
// never from the client. It fails closed: any transaction it cannot fully
// confirm produces an error.
func verifySolanaTx(signature, operatorAddress string) (int64, string, error) {
	if operatorAddress == "" {
		return 0, "", fmt.Errorf("solana address not configured")
	}
	if !IsSolanaAddress(operatorAddress) {
		return 0, "", fmt.Errorf("configured solana address is not a valid account")
	}

	// Public RPC nodes lag the wallet that broadcast the transaction, and the
	// buyer confirms right after signing, so poll (~40s) for the signature to
	// appear AND finalize instead of failing outright — same shape as the EVM path.
	var res *solanaTxResult
	for attempt := 0; attempt < 20; attempt++ {
		if attempt > 0 {
			time.Sleep(2 * time.Second)
		}
		found, err := solanaGetTransaction(signature)
		if err != nil {
			continue // not visible / not finalized on this node yet
		}
		res = found
		break
	}
	if res == nil {
		log.Debugf("solana tx %s not finalized within poll window", signature)
		return 0, "", fmt.Errorf("transaction not found or not finalized yet; please try again shortly")
	}

	if res.Meta.Err != nil {
		return 0, "", fmt.Errorf("transaction did not succeed on-chain")
	}

	// An SPL transfer credits a token account owned by the operator; check that
	// first, since such a transaction also moves a little SOL for fees/rent.
	if raw, symbol, decimals, ok := solanaSPLCredit(res, operatorAddress); ok {
		amount, err := smallestUnitToDisplay(raw, decimals)
		if err != nil {
			return 0, "", err
		}
		return amount, symbol, nil
	}

	lamports, ok := solanaNativeCredit(res, operatorAddress)
	if !ok {
		return 0, "", fmt.Errorf("no payment to the configured Solana address")
	}
	amount, err := smallestUnitToDisplay(big.NewInt(lamports), solanaLamportDecimals)
	if err != nil {
		return 0, "", err
	}
	return amount, "SOL", nil
}
