package controllers

import (
	"math/big"
	"testing"
)

func TestSmallestUnitToDisplay(t *testing.T) {
	oneE18 := new(big.Int)
	oneE18.SetString("1000000000000000000", 10) // 1 ETH in wei

	halfE18 := new(big.Int)
	halfE18.SetString("500000000000000000", 10) // 0.5 ETH in wei

	cases := []struct {
		name     string
		value    *big.Int
		decimals int
		want     int64 // human amount * 1e8
	}{
		{"1 ETH native", oneE18, 18, 100000000},
		{"0.5 ETH native", halfE18, 18, 50000000},
		{"10 USDC (6 decimals)", big.NewInt(10000000), 6, 1000000000},
		{"1 BTC (8 decimals)", big.NewInt(100000000), 8, 100000000},
		{"zero", big.NewInt(0), 18, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := smallestUnitToDisplay(tc.value, tc.decimals)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("smallestUnitToDisplay(%s, %d) = %d, want %d", tc.value, tc.decimals, got, tc.want)
			}
		})
	}
}

func TestFindERC20TransferValue(t *testing.T) {
	token := "0xdAC17F958D2ee523a2206206994597C13D831ec7"
	wallet := "0xAbC0000000000000000000000000000000000123"
	walletTopic := "0x000000000000000000000000abc0000000000000000000000000000000000123"
	fromTopic := "0x0000000000000000000000001111111111111111111111111111111111111111"

	transferLog := ethLog{
		Address: token,
		Topics:  []string{erc20TransferSig, fromTopic, walletTopic},
		Data:    "0xf4240", // 1_000_000
	}

	// Matching transfer to the wallet is found.
	if val, ok := findERC20TransferValue([]ethLog{transferLog}, token, wallet); !ok || val.Int64() != 1000000 {
		t.Errorf("expected to find transfer value 1000000, got ok=%v val=%v", ok, val)
	}

	// A transfer from a different token contract must be ignored.
	if _, ok := findERC20TransferValue([]ethLog{transferLog}, "0x0000000000000000000000000000000000000000", wallet); ok {
		t.Error("transfer from a different contract must not match")
	}

	// A transfer to a different recipient must be ignored.
	other := "0x9999999999999999999999999999999999999999"
	if _, ok := findERC20TransferValue([]ethLog{transferLog}, token, other); ok {
		t.Error("transfer to a different recipient must not match")
	}

	// A non-Transfer log (wrong signature) must be ignored.
	notTransfer := transferLog
	notTransfer.Topics = []string{"0xdeadbeef", fromTopic, walletTopic}
	if _, ok := findERC20TransferValue([]ethLog{notTransfer}, token, wallet); ok {
		t.Error("non-Transfer event must not match")
	}
}

func TestHexToBigInt(t *testing.T) {
	cases := map[string]int64{
		"0xf4240": 1000000,
		"0x0":     0,
		"0x":      0,
		"0xff":    255,
	}
	for in, want := range cases {
		got, ok := hexToBigInt(in)
		if !ok || got.Int64() != want {
			t.Errorf("hexToBigInt(%q) = %v (ok=%v), want %d", in, got, ok, want)
		}
	}
}
