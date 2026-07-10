package controllers

import (
	"math/big"
	"strings"
	"testing"
)

const (
	testOperator = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
	testPayer    = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"
	testUSDCMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
	// A mint that is NOT allowlisted: an attacker can freely mint a token and
	// call it "USDC", so it must never be credited.
	testFakeMint = "F4ke1111111111111111111111111111111111111111"
	// 88-char base58 signature (64 bytes).
	testSignature = "5wHu1qwD4kLwYbNvNsz8kX1MSAeGZ1jFCZm3nzu6cSZjSwhTVLTbLgUNVfyEnVWCTVBnUnCnJgWvNYcCVBXNVXqB"
)

func TestIsSolanaSignature(t *testing.T) {
	if !isSolanaSignature(testSignature) {
		t.Fatalf("expected %q (len %d) to be a Solana signature", testSignature, len(testSignature))
	}

	rejects := map[string]string{
		"EVM hash":       "0x" + strings.Repeat("a", 64),
		"Bitcoin txid":   strings.Repeat("a", 64),
		"too short":      strings.Repeat("A", 40),
		"too long":       strings.Repeat("A", 96),
		"non-base58 (0)": strings.Repeat("0", 88),
		"non-base58 (l)": strings.Repeat("l", 88),
		"empty":          "",
	}
	for name, value := range rejects {
		if isSolanaSignature(value) {
			t.Errorf("%s: expected %q to be rejected as a Solana signature", name, value)
		}
	}
}

func TestIsSolanaAddress(t *testing.T) {
	if !IsSolanaAddress(testOperator) {
		t.Fatalf("expected %q to be a valid Solana address", testOperator)
	}
	// An EVM address must never pass: paying SOL to it is impossible, and the
	// donation form used to use it as the Solana destination.
	if IsSolanaAddress("0x1234567890123456789012345678901234567890") {
		t.Error("EVM 0x address must not validate as a Solana address")
	}
	if IsSolanaAddress(strings.Repeat("A", 31)) {
		t.Error("31-char address must be rejected")
	}
	if IsSolanaAddress(strings.Repeat("A", 45)) {
		t.Error("45-char address must be rejected")
	}
	if IsSolanaAddress(strings.Repeat("0", 40)) {
		t.Error("non-base58 characters must be rejected")
	}
}

// tokenBalance builds one pre/post token balance entry.
func tokenBalance(index int, mint, owner, amount string, decimals int) solanaTokenBalance {
	return solanaTokenBalance{
		AccountIndex:  index,
		Mint:          mint,
		Owner:         owner,
		UITokenAmount: solanaTokenAmount{Amount: amount, Decimals: decimals},
	}
}

func txWithAccounts(keys []string, pre, post []int64) *solanaTxResult {
	res := &solanaTxResult{Meta: &solanaTxMeta{PreBalances: pre, PostBalances: post}}
	for _, k := range keys {
		res.Transaction.Message.AccountKeys = append(res.Transaction.Message.AccountKeys, solanaAccountKey{Pubkey: k})
	}
	return res
}

func TestSolanaNativeCredit(t *testing.T) {
	// Operator is account index 1 and gains 2 SOL (2e9 lamports).
	res := txWithAccounts(
		[]string{testPayer, testOperator},
		[]int64{5_000_000_000, 1_000_000_000},
		[]int64{2_999_995_000, 3_000_000_000},
	)

	lamports, ok := solanaNativeCredit(res, testOperator)
	if !ok {
		t.Fatal("expected a native credit to the operator")
	}
	if lamports != 2_000_000_000 {
		t.Fatalf("lamports = %d, want 2000000000", lamports)
	}

	// 2 SOL at 1e8 fixed point == 2 * 1e8.
	amount, err := smallestUnitToDisplay(big.NewInt(lamports), solanaLamportDecimals)
	if err != nil {
		t.Fatalf("smallestUnitToDisplay: %v", err)
	}
	if amount != 200_000_000 {
		t.Fatalf("display amount = %d, want 200000000 (2 SOL)", amount)
	}
}

func TestSolanaNativeCreditRejectsNonPayments(t *testing.T) {
	// The operator isn't in the transaction at all.
	res := txWithAccounts([]string{testPayer}, []int64{5_000_000_000}, []int64{4_999_995_000})
	if _, ok := solanaNativeCredit(res, testOperator); ok {
		t.Error("a transaction not touching the operator must not credit")
	}

	// The operator's balance did not increase (e.g. they paid the fee).
	res = txWithAccounts(
		[]string{testOperator},
		[]int64{1_000_000_000},
		[]int64{999_995_000},
	)
	if _, ok := solanaNativeCredit(res, testOperator); ok {
		t.Error("a non-positive balance delta must not credit")
	}
}

func TestSolanaSPLCreditAllowlistedMint(t *testing.T) {
	// 25 USDC (6 decimals) arrives in the operator's token account (index 3).
	res := &solanaTxResult{Meta: &solanaTxMeta{
		PreTokenBalances:  []solanaTokenBalance{tokenBalance(3, testUSDCMint, testOperator, "5000000", 6)},
		PostTokenBalances: []solanaTokenBalance{tokenBalance(3, testUSDCMint, testOperator, "30000000", 6)},
	}}

	raw, symbol, decimals, ok := solanaSPLCredit(res, testOperator)
	if !ok {
		t.Fatal("expected an SPL credit")
	}
	if symbol != "USDC" {
		t.Fatalf("symbol = %q, want USDC (derived from the mint, not the client)", symbol)
	}
	if raw.String() != "25000000" {
		t.Fatalf("raw delta = %s, want 25000000", raw)
	}
	if decimals != 6 {
		t.Fatalf("decimals = %d, want 6", decimals)
	}

	amount, err := smallestUnitToDisplay(raw, decimals)
	if err != nil {
		t.Fatalf("smallestUnitToDisplay: %v", err)
	}
	if amount != 2_500_000_000 {
		t.Fatalf("display amount = %d, want 2500000000 (25 USDC at 1e8)", amount)
	}
}

// The security-critical case: a token that is not on the allowlist must never be
// credited, however it is labelled, because the server cannot price it.
func TestSolanaSPLCreditRejectsUnknownMint(t *testing.T) {
	res := &solanaTxResult{Meta: &solanaTxMeta{
		PostTokenBalances: []solanaTokenBalance{
			tokenBalance(3, testFakeMint, testOperator, "1000000000000", 6),
		},
	}}
	if _, _, _, ok := solanaSPLCredit(res, testOperator); ok {
		t.Fatal("an unlisted mint must never be credited (a fake 'USDC' could buy fixed-price effects)")
	}
}

func TestSolanaSPLCreditRejectsOtherOwner(t *testing.T) {
	// A large USDC transfer, but to somebody else's token account.
	res := &solanaTxResult{Meta: &solanaTxMeta{
		PostTokenBalances: []solanaTokenBalance{
			tokenBalance(3, testUSDCMint, testPayer, "999000000", 6),
		},
	}}
	if _, _, _, ok := solanaSPLCredit(res, testOperator); ok {
		t.Fatal("a transfer to another owner must not credit the operator")
	}
}

func TestSolanaSPLCreditRejectsNonPositiveDelta(t *testing.T) {
	// The operator's USDC balance shrank (they sent tokens out).
	res := &solanaTxResult{Meta: &solanaTxMeta{
		PreTokenBalances:  []solanaTokenBalance{tokenBalance(3, testUSDCMint, testOperator, "30000000", 6)},
		PostTokenBalances: []solanaTokenBalance{tokenBalance(3, testUSDCMint, testOperator, "5000000", 6)},
	}}
	if _, _, _, ok := solanaSPLCredit(res, testOperator); ok {
		t.Fatal("a non-positive token delta must not credit")
	}
}

func TestVerifySolanaTxRequiresConfiguredAddress(t *testing.T) {
	if _, _, err := verifySolanaTx(testSignature, ""); err == nil {
		t.Error("an unconfigured Solana address must fail closed")
	}
	if _, _, err := verifySolanaTx(testSignature, "0x1234567890123456789012345678901234567890"); err == nil {
		t.Error("an EVM address configured as the Solana destination must fail closed")
	}
}

// Every allowlisted mint must have a symbol the price layer can convert, or a
// verified payment would be recorded with no fiat value.
func TestSolanaSPLMintsArePriceable(t *testing.T) {
	for mint, symbol := range solanaSPLMints {
		if !IsSolanaAddress(mint) {
			t.Errorf("mint %q is not a valid Solana address", mint)
		}
		if _, ok := symbolToCoinGeckoID[symbol]; !ok {
			t.Errorf("mint %s maps to symbol %q which has no price ID", mint, symbol)
		}
	}
	if _, ok := symbolToCoinGeckoID["SOL"]; !ok {
		t.Error("native SOL must have a price ID")
	}
}
