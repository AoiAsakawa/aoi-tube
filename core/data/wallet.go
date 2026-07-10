package data

import (
	"database/sql"
	"errors"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

// Coins are a prepaid, non-expiring wallet balance. One coin equals one minor
// unit of the server's base currency (e.g. 1 coin = ¥1 for JPY), so spending a
// purchase priced in base-currency minor units costs that many coins directly.
// The only place coins diverge from the fiat actually paid is a charge bonus.
//
// The wallet is ledger-based: balances are never stored, only derived as the
// SUM of an append-only entry log. This keeps the money trail auditable, which
// matters for a prepaid instrument (Japan's Payment Services Act requires
// reporting the outstanding unused balance), and makes double-spends and
// balance corruption structurally impossible to hide.

// Wallet ledger entry types.
const (
	WalletEntryCharge      = "charge"       // fiat paid in via a provider → coins
	WalletEntryBonus       = "bonus"        // extra coins granted on a charge
	WalletEntrySpend       = "spend"        // coins consumed on a purchase (negative)
	WalletEntryRefund      = "refund"       // coins returned (positive)
	WalletEntryAdminAdjust = "admin_adjust" // operator manual grant/deduction
)

// Coin wallet configuration keys (datastore key-value).
const (
	coinWalletEnabledKey      = "coin_wallet_enabled"
	coinChargeBonusPercentKey = "coin_charge_bonus_percent"
)

// walletSpendMu serializes the read-check-write of a spend so two concurrent
// debits can't both pass the balance check and overdraw. A single process-wide
// mutex is sufficient for this single-node server.
var walletSpendMu sync.Mutex

// WalletEntry is one row of the append-only wallet ledger.
type WalletEntry struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Delta     int64  `json:"delta"`     // coins; positive = credit, negative = debit
	EntryType string `json:"entryType"` // one of the WalletEntry* constants
	// PaidAmount / PaidCurrency record the fiat actually received for a charge,
	// in the currency's minor units. Zero for non-charge entries. Kept so the
	// outstanding-balance report can value unused coins at their issue price
	// (paid) rather than face value (which a bonus inflates).
	PaidAmount   int64  `json:"paidAmount,omitempty"`
	PaidCurrency string `json:"paidCurrency,omitempty"`
	// Provider / PaymentID identify the funding payment for a charge and form its
	// idempotency key. Ref links a spend/refund to its purchase (e.g. donation ID)
	// or carries an operator note for an adjustment.
	Provider  string    `json:"provider,omitempty"`
	PaymentID string    `json:"paymentId,omitempty"`
	Ref       string    `json:"ref,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateWalletTable creates the append-only wallet ledger if needed.
func CreateWalletTable(database *sql.DB) {
	createTableSQL := `CREATE TABLE IF NOT EXISTS wallet_ledger (
		"id" TEXT NOT NULL PRIMARY KEY,
		"user_id" TEXT NOT NULL,
		"delta" INTEGER NOT NULL,
		"entry_type" TEXT NOT NULL,
		"paid_amount" INTEGER NOT NULL DEFAULT 0,
		"paid_currency" TEXT NOT NULL DEFAULT '',
		"provider" TEXT NOT NULL DEFAULT '',
		"payment_id" TEXT NOT NULL DEFAULT '',
		"ref" TEXT NOT NULL DEFAULT '',
		"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`
	MustExec(createTableSQL, database)

	// Balance lookups sum a user's rows; charges are deduped by (provider, id).
	MustExec(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_id ON wallet_ledger (user_id);`, database)
	MustExec(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at ON wallet_ledger (created_at);`, database)
	MustExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_charge_idem
		ON wallet_ledger (provider, payment_id) WHERE payment_id != '';`, database)
}

// insertWalletEntry writes one ledger row. Callers set ID/CreatedAt or leave
// them zero to be filled in here.
func insertWalletEntry(e *WalletEntry) error {
	if e.ID == "" {
		e.ID = shortid.MustGenerate()
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now()
	}
	_, err := _datastore.DB.Exec(
		`INSERT INTO wallet_ledger
			(id, user_id, delta, entry_type, paid_amount, paid_currency, provider, payment_id, ref, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.UserID, e.Delta, e.EntryType, e.PaidAmount, e.PaidCurrency,
		e.Provider, e.PaymentID, e.Ref, e.CreatedAt,
	)
	return err
}

// GetWalletBalance returns a user's current coin balance (sum of ledger deltas).
func GetWalletBalance(userID string) (int64, error) {
	if userID == "" {
		return 0, nil
	}
	var balance sql.NullInt64
	err := _datastore.DB.QueryRow(
		`SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger WHERE user_id = ?`,
		userID,
	).Scan(&balance)
	if err != nil {
		return 0, err
	}
	return balance.Int64, nil
}

// WalletChargeExists reports whether a charge for the given provider payment has
// already been credited, so a webhook + redirect (or a retry) credits only once.
func WalletChargeExists(provider, paymentID string) (bool, error) {
	if paymentID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM wallet_ledger WHERE provider = ? AND payment_id = ?)`,
		provider, paymentID,
	).Scan(&exists)
	return exists, err
}

// CreditWalletCharge credits a completed coin purchase: a 'charge' entry for the
// paid coins plus, when bonusCoins > 0, a separate 'bonus' entry. It is
// idempotent on (provider, paymentID) — a duplicate charge is ignored — so it is
// safe to call from both the webhook and redirect confirmation paths. paidAmount
// / paidCurrency record the fiat actually received.
func CreditWalletCharge(userID string, coins, bonusCoins, paidAmount int64, paidCurrency, provider, paymentID string) error {
	if userID == "" {
		return errors.New("wallet charge requires a user")
	}
	if coins <= 0 {
		return errors.New("wallet charge must credit a positive coin amount")
	}
	// Idempotency: the unique index on (provider, payment_id) also guards this,
	// but check first so a duplicate is a no-op rather than a surfaced error.
	if paymentID != "" {
		exists, err := WalletChargeExists(provider, paymentID)
		if err != nil {
			return err
		}
		if exists {
			log.Debugf("wallet: charge %s/%s already credited, skipping", provider, paymentID)
			return nil
		}
	}
	if err := insertWalletEntry(&WalletEntry{
		UserID:       userID,
		Delta:        coins,
		EntryType:    WalletEntryCharge,
		PaidAmount:   paidAmount,
		PaidCurrency: paidCurrency,
		Provider:     provider,
		PaymentID:    paymentID,
	}); err != nil {
		return err
	}
	if bonusCoins > 0 {
		// The bonus shares the charge's payment id only via Ref so it never trips
		// the (provider, payment_id) idempotency index (payment_id left empty).
		if err := insertWalletEntry(&WalletEntry{
			UserID:    userID,
			Delta:     bonusCoins,
			EntryType: WalletEntryBonus,
			Provider:  provider,
			Ref:       "charge:" + paymentID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// SpendWallet atomically debits coins for a purchase. It returns ok=false
// (without erroring) when the balance is insufficient. The read-check-write is
// serialized so concurrent debits can't both pass the check and overdraw. ref
// links the debit to the purchase it paid for (e.g. a donation ID).
func SpendWallet(userID string, coins int64, ref string) (ok bool, err error) {
	if userID == "" {
		return false, errors.New("wallet spend requires a user")
	}
	if coins <= 0 {
		return false, errors.New("wallet spend must debit a positive coin amount")
	}
	walletSpendMu.Lock()
	defer walletSpendMu.Unlock()

	balance, err := GetWalletBalance(userID)
	if err != nil {
		return false, err
	}
	if balance < coins {
		return false, nil
	}
	if err := insertWalletEntry(&WalletEntry{
		UserID:    userID,
		Delta:     -coins,
		EntryType: WalletEntrySpend,
		Ref:       ref,
	}); err != nil {
		return false, err
	}
	return true, nil
}

// RefundWallet credits coins back to a user (e.g. a reversed purchase).
func RefundWallet(userID string, coins int64, ref string) error {
	if userID == "" {
		return errors.New("wallet refund requires a user")
	}
	if coins <= 0 {
		return errors.New("wallet refund must credit a positive coin amount")
	}
	return insertWalletEntry(&WalletEntry{
		UserID:    userID,
		Delta:     coins,
		EntryType: WalletEntryRefund,
		Ref:       ref,
	})
}

// AdminAdjustWallet applies an operator grant (delta > 0) or deduction
// (delta < 0). A deduction is serialized and refused if it would overdraw.
func AdminAdjustWallet(userID string, delta int64, note string) (ok bool, err error) {
	if userID == "" {
		return false, errors.New("wallet adjustment requires a user")
	}
	if delta == 0 {
		return false, errors.New("wallet adjustment must be non-zero")
	}
	walletSpendMu.Lock()
	defer walletSpendMu.Unlock()

	if delta < 0 {
		balance, err := GetWalletBalance(userID)
		if err != nil {
			return false, err
		}
		if balance+delta < 0 {
			return false, nil
		}
	}
	if err := insertWalletEntry(&WalletEntry{
		UserID:    userID,
		Delta:     delta,
		EntryType: WalletEntryAdminAdjust,
		Ref:       note,
	}); err != nil {
		return false, err
	}
	return true, nil
}

// GetWalletLedger returns a user's most recent ledger entries, newest first.
func GetWalletLedger(userID string, limit int) ([]*WalletEntry, error) {
	if userID == "" {
		return nil, nil
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := _datastore.DB.Query(
		`SELECT id, user_id, delta, entry_type, paid_amount, paid_currency,
		        provider, payment_id, ref, created_at
		   FROM wallet_ledger WHERE user_id = ?
		  ORDER BY created_at DESC, id DESC LIMIT ?`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]*WalletEntry, 0)
	for rows.Next() {
		var e WalletEntry
		var paidCurrency, provider, paymentID, ref sql.NullString
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.Delta, &e.EntryType, &e.PaidAmount, &paidCurrency,
			&provider, &paymentID, &ref, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		e.PaidCurrency = paidCurrency.String
		e.Provider = provider.String
		e.PaymentID = paymentID.String
		e.Ref = ref.String
		entries = append(entries, &e)
	}
	return entries, rows.Err()
}

// GetTotalOutstandingCoins returns the sum of all users' balances: the total
// unused prepaid coin liability. Basis for the Payment Services Act outstanding
// prepaid balance report.
func GetTotalOutstandingCoins() (int64, error) {
	var total sql.NullInt64
	err := _datastore.DB.QueryRow(`SELECT COALESCE(SUM(delta), 0) FROM wallet_ledger`).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total.Int64, nil
}

// GetCoinWalletEnabled reports whether the coin wallet feature is on. Off by
// default: the operator opts in once they're ready to sell prepaid coins.
func GetCoinWalletEnabled() bool {
	enabled, _ := _datastore.GetBool(coinWalletEnabledKey)
	return enabled
}

// SetCoinWalletEnabled toggles the coin wallet feature.
func SetCoinWalletEnabled(enabled bool) error {
	return _datastore.SetBool(coinWalletEnabledKey, enabled)
}

// GetCoinChargeBonusPercent returns the bonus percentage granted on top of a
// coin charge (e.g. 10 → charging 1000 coins grants 1100). Defaults to 0.
func GetCoinChargeBonusPercent() int {
	pct, _ := _datastore.GetNumber(coinChargeBonusPercentKey)
	if pct < 0 {
		return 0
	}
	return int(pct)
}

// SetCoinChargeBonusPercent sets the charge bonus percentage (0–100).
func SetCoinChargeBonusPercent(percent int) error {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	return _datastore.SetNumber(coinChargeBonusPercentKey, float64(percent))
}

// CoinBonusFor returns the bonus coins granted for a charge of the given coin
// amount at the configured bonus percentage (floored).
func CoinBonusFor(coins int64) int64 {
	pct := GetCoinChargeBonusPercent()
	if pct <= 0 || coins <= 0 {
		return 0
	}
	return coins * int64(pct) / 100
}
