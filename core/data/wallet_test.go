package data

import (
	"sync"
	"testing"
)

func TestWalletChargeCreditsBalanceAndBonus(t *testing.T) {
	user := "wallet-user-charge"
	if err := CreditWalletCharge(user, 1000, 100, 1000, "JPY", "stripe", "pay-charge-1"); err != nil {
		t.Fatalf("CreditWalletCharge: %v", err)
	}
	bal, err := GetWalletBalance(user)
	if err != nil {
		t.Fatalf("GetWalletBalance: %v", err)
	}
	if bal != 1100 {
		t.Fatalf("balance = %d, want 1100 (1000 coins + 100 bonus)", bal)
	}
}

func TestWalletChargeIsIdempotent(t *testing.T) {
	user := "wallet-user-idem"
	for i := 0; i < 3; i++ {
		if err := CreditWalletCharge(user, 500, 0, 500, "JPY", "paypal", "pay-idem-1"); err != nil {
			t.Fatalf("CreditWalletCharge #%d: %v", i, err)
		}
	}
	bal, _ := GetWalletBalance(user)
	if bal != 500 {
		t.Fatalf("balance = %d, want 500 (duplicate charges must not re-credit)", bal)
	}
}

func TestWalletSpend(t *testing.T) {
	user := "wallet-user-spend"
	if err := CreditWalletCharge(user, 800, 0, 800, "JPY", "stripe", "pay-spend-1"); err != nil {
		t.Fatalf("charge: %v", err)
	}

	ok, err := SpendWallet(user, 300, "donation:abc")
	if err != nil || !ok {
		t.Fatalf("SpendWallet(300) ok=%v err=%v, want ok=true", ok, err)
	}
	if bal, _ := GetWalletBalance(user); bal != 500 {
		t.Fatalf("balance after spend = %d, want 500", bal)
	}

	// Overspend must be refused without erroring and without changing balance.
	ok, err = SpendWallet(user, 10_000, "donation:toobig")
	if err != nil {
		t.Fatalf("SpendWallet overspend errored: %v", err)
	}
	if ok {
		t.Fatalf("SpendWallet(10000) ok=true, want false (insufficient balance)")
	}
	if bal, _ := GetWalletBalance(user); bal != 500 {
		t.Fatalf("balance after refused overspend = %d, want 500", bal)
	}
}

func TestWalletConcurrentSpendNeverOverdraws(t *testing.T) {
	user := "wallet-user-concurrent"
	if err := CreditWalletCharge(user, 1000, 0, 1000, "JPY", "stripe", "pay-conc-1"); err != nil {
		t.Fatalf("charge: %v", err)
	}

	// 20 concurrent debits of 100 against a 1000 balance: exactly 10 must win.
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := SpendWallet(user, 100, "race")
			if err != nil {
				t.Errorf("SpendWallet: %v", err)
				return
			}
			if ok {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if wins != 10 {
		t.Fatalf("successful debits = %d, want 10 (no overdraw)", wins)
	}
	if bal, _ := GetWalletBalance(user); bal != 0 {
		t.Fatalf("final balance = %d, want 0", bal)
	}
}

func TestWalletAdminAdjust(t *testing.T) {
	user := "wallet-user-admin"
	ok, err := AdminAdjustWallet(user, 250, "goodwill")
	if err != nil || !ok {
		t.Fatalf("AdminAdjustWallet(+250) ok=%v err=%v", ok, err)
	}
	if bal, _ := GetWalletBalance(user); bal != 250 {
		t.Fatalf("balance = %d, want 250", bal)
	}

	// Deduction that would overdraw is refused.
	ok, _ = AdminAdjustWallet(user, -500, "too much")
	if ok {
		t.Fatalf("AdminAdjustWallet(-500) ok=true, want false (would overdraw)")
	}
	if bal, _ := GetWalletBalance(user); bal != 250 {
		t.Fatalf("balance after refused deduction = %d, want 250", bal)
	}

	// Valid deduction succeeds.
	ok, _ = AdminAdjustWallet(user, -100, "correction")
	if !ok {
		t.Fatalf("AdminAdjustWallet(-100) ok=false, want true")
	}
	if bal, _ := GetWalletBalance(user); bal != 150 {
		t.Fatalf("balance = %d, want 150", bal)
	}
}

func TestWalletLedgerAndOutstanding(t *testing.T) {
	before, err := GetTotalOutstandingCoins()
	if err != nil {
		t.Fatalf("GetTotalOutstandingCoins: %v", err)
	}

	user := "wallet-user-ledger"
	if err := CreditWalletCharge(user, 600, 60, 600, "JPY", "kofi", "pay-ledger-1"); err != nil {
		t.Fatalf("charge: %v", err)
	}
	if _, err := SpendWallet(user, 200, "donation:led"); err != nil {
		t.Fatalf("spend: %v", err)
	}

	entries, err := GetWalletLedger(user, 100)
	if err != nil {
		t.Fatalf("GetWalletLedger: %v", err)
	}
	// charge + bonus + spend = 3 entries.
	if len(entries) != 3 {
		t.Fatalf("ledger entries = %d, want 3", len(entries))
	}
	// Newest first: the spend.
	if entries[0].EntryType != WalletEntrySpend || entries[0].Delta != -200 {
		t.Fatalf("newest entry = %+v, want spend of -200", entries[0])
	}

	after, _ := GetTotalOutstandingCoins()
	if after-before != 460 {
		t.Fatalf("outstanding delta = %d, want 460 (600+60-200)", after-before)
	}
}

func TestCoinBonusFor(t *testing.T) {
	if err := SetCoinChargeBonusPercent(10); err != nil {
		t.Fatalf("SetCoinChargeBonusPercent: %v", err)
	}
	if got := CoinBonusFor(1000); got != 100 {
		t.Fatalf("CoinBonusFor(1000) at 10%% = %d, want 100", got)
	}
	if err := SetCoinChargeBonusPercent(0); err != nil {
		t.Fatalf("reset bonus: %v", err)
	}
	if got := CoinBonusFor(1000); got != 0 {
		t.Fatalf("CoinBonusFor(1000) at 0%% = %d, want 0", got)
	}
}
