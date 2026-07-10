package data

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/db"
	"github.com/aoiasakawa/aoitube/models"
	log "github.com/sirupsen/logrus"
)

// CreateDonationsTable will create the donations table if needed.
func CreateDonationsTable(database *sql.DB) {
	createTableSQL := `CREATE TABLE IF NOT EXISTS donations (
		"id" TEXT NOT NULL PRIMARY KEY,
		"user_id" TEXT,
		"amount" INTEGER NOT NULL,
		"currency" TEXT NOT NULL DEFAULT 'JPY',
		"message" TEXT,
		"display_name" TEXT,
		"is_anonymous" BOOLEAN DEFAULT FALSE,
		"payment_provider" TEXT,
		"payment_id" TEXT,
		"item_type" TEXT DEFAULT 'superchat',
		"effect_type" TEXT,
		"is_test" BOOLEAN DEFAULT FALSE,
		"amount_jpy" INTEGER DEFAULT 0,
		"fiat_currency" TEXT DEFAULT '',
		"archive_id" TEXT,
		"hidden_at" TIMESTAMP,
		"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`
	MustExec(createTableSQL, database)

	// Migrate pre-existing tables that lack the purchase item columns.
	// SQLite has no ADD COLUMN IF NOT EXISTS; a duplicate-column error just
	// means the migration already ran, so it is ignored.
	for _, migration := range []string{
		`ALTER TABLE donations ADD COLUMN item_type TEXT DEFAULT 'superchat';`,
		`ALTER TABLE donations ADD COLUMN effect_type TEXT;`,
		`ALTER TABLE donations ADD COLUMN is_test BOOLEAN DEFAULT FALSE;`,
		`ALTER TABLE donations ADD COLUMN amount_jpy INTEGER DEFAULT 0;`,
		`ALTER TABLE donations ADD COLUMN fiat_currency TEXT DEFAULT '';`,
		`ALTER TABLE donations ADD COLUMN archive_id TEXT;`,
	} {
		if _, err := database.Exec(migration); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			log.Warnln("donations table migration:", err)
		}
	}

	// Create indexes
	MustExec(`CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations (user_id);`, database)
	MustExec(`CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations (created_at);`, database)
	MustExec(`CREATE INDEX IF NOT EXISTS idx_donations_hidden_at ON donations (hidden_at);`, database)
	// Entitlement lookup: "has user U purchased archive A?"
	MustExec(`CREATE INDEX IF NOT EXISTS idx_donations_archive_entitlement ON donations (user_id, archive_id);`, database)
}

// notTestNotCoinFunded is the WHERE fragment for revenue aggregation: excludes
// test-mode rows and coin-funded spends (payment_provider "coin"). Coin spends
// draw down a balance whose top-up was already counted as revenue, so counting
// the spend too would double-count. Coin CHARGES keep their real provider and
// stay included.
const notTestNotCoinFunded = `(is_test IS NULL OR is_test = FALSE)
	AND (payment_provider IS NULL OR payment_provider != 'coin')`

// AddDonation will add a new donation to the database. Uses raw SQL (rather
// than the sqlc-generated query) so the columns that postdate the generated
// bindings (fiat_currency, archive_id) are persisted without regenerating them.
func AddDonation(donation *models.Donation) error {
	_, err := _datastore.DB.Exec(
		`INSERT INTO donations
			(id, user_id, amount, currency, message, display_name, is_anonymous,
			 payment_provider, payment_id, item_type, effect_type, is_test,
			 amount_jpy, fiat_currency, archive_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		donation.ID,
		sql.NullString{String: donation.UserID, Valid: donation.UserID != ""},
		donation.Amount,
		donation.Currency,
		sql.NullString{String: donation.Message, Valid: donation.Message != ""},
		sql.NullString{String: donation.DisplayName, Valid: donation.DisplayName != ""},
		sql.NullBool{Bool: donation.IsAnonymous, Valid: true},
		sql.NullString{String: donation.PaymentProvider, Valid: donation.PaymentProvider != ""},
		sql.NullString{String: donation.PaymentID, Valid: donation.PaymentID != ""},
		sql.NullString{String: donation.ItemType, Valid: donation.ItemType != ""},
		sql.NullString{String: donation.EffectType, Valid: donation.EffectType != ""},
		sql.NullBool{Bool: donation.IsTest, Valid: true},
		sql.NullInt64{Int64: donation.AmountJPY, Valid: donation.AmountJPY > 0},
		sql.NullString{String: donation.FiatCurrency, Valid: donation.FiatCurrency != "" && donation.AmountJPY > 0},
		sql.NullString{String: donation.ArchiveID, Valid: donation.ArchiveID != ""},
	)
	return err
}

// normalizeFiatCurrency maps a stored fiat_currency value to the effective
// conversion currency: rows written before the column existed are JPY.
func normalizeFiatCurrency(stored string, amountFiat int64) string {
	if amountFiat <= 0 {
		return ""
	}
	if stored == "" {
		return "JPY"
	}
	return stored
}

// HasPurchasedArchive reports whether the given authenticated user holds a
// confirmed (non-test) purchase entitling them to view the paid archive. This
// is the access gate for paid VOD playback.
func HasPurchasedArchive(userID, archiveID string) (bool, error) {
	if userID == "" || archiveID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM donations
			WHERE user_id = ? AND archive_id = ? AND item_type = ?
			  AND (is_test IS NULL OR is_test = FALSE)
		)`,
		userID, archiveID, models.DonationItemArchive,
	).Scan(&exists)
	return exists, err
}

// UserHasArchivePurchase reports whether the user holds any confirmed
// (non-test) paid-archive entitlement. Used to protect buyers from unlinking
// their last login method, which would strand access to purchased archives on
// a new device (the purchase row survives, but the user could no longer prove
// they are its owner).
func UserHasArchivePurchase(userID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM donations
			WHERE user_id = ? AND item_type = ?
			  AND (is_test IS NULL OR is_test = FALSE)
		)`,
		userID, models.DonationItemArchive,
	).Scan(&exists)
	return exists, err
}

// UserHasPurchase reports whether the user has any confirmed (non-test)
// purchase of any kind. Used to protect a buyer from unlinking their last
// login method and stranding the history/entitlements keyed to their account.
func UserHasPurchase(userID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM donations
			WHERE user_id = ? AND (is_test IS NULL OR is_test = FALSE)
		)`,
		userID,
	).Scan(&exists)
	return exists, err
}

// ArchiveHasAnyPurchase reports whether any purchase row references the
// archive, including test-mode ones. Used to protect archives from retention
// pruning: media backing a sold entitlement must never be auto-deleted, even
// if the archive's access mode was changed after the sale.
func ArchiveHasAnyPurchase(archiveID string) (bool, error) {
	if archiveID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM donations
			WHERE archive_id = ? AND item_type = ?
		)`,
		archiveID, models.DonationItemArchive,
	).Scan(&exists)
	return exists, err
}

// purchaseColumns is the raw-SQL column list for purchase queries, matching
// the scan order in scanPurchaseRows. Raw SQL (not sqlc) because the
// archive_id column postdates the generated bindings.
const purchaseColumns = `id, user_id, amount, currency, message, display_name, is_anonymous,
	payment_provider, payment_id, item_type, effect_type, is_test, amount_jpy, fiat_currency, archive_id, created_at`

// scanPurchaseRows scans rows selected with purchaseColumns.
func scanPurchaseRows(rows *sql.Rows) ([]*models.Donation, error) {
	donations := make([]*models.Donation, 0)
	for rows.Next() {
		var d models.Donation
		var userID, message, displayName, provider, paymentID, itemType, effectType, fiatCurrency, archiveID sql.NullString
		var isAnonymous, isTest sql.NullBool
		var amountJPY sql.NullInt64
		var createdAt sql.NullTime
		if err := rows.Scan(
			&d.ID, &userID, &d.Amount, &d.Currency, &message, &displayName, &isAnonymous,
			&provider, &paymentID, &itemType, &effectType, &isTest, &amountJPY, &fiatCurrency, &archiveID, &createdAt,
		); err != nil {
			return nil, err
		}
		d.UserID = userID.String
		d.Message = message.String
		d.DisplayName = displayName.String
		d.IsAnonymous = isAnonymous.Bool
		d.PaymentProvider = provider.String
		d.PaymentID = paymentID.String
		d.ItemType = itemType.String
		d.EffectType = effectType.String
		d.IsTest = isTest.Bool
		d.AmountJPY = amountJPY.Int64
		d.FiatCurrency = normalizeFiatCurrency(fiatCurrency.String, amountJPY.Int64)
		d.ArchiveID = archiveID.String
		d.CreatedAt = createdAt.Time
		donations = append(donations, &d)
	}
	return donations, rows.Err()
}

// TopSupporter is one entry of the public supporter ranking.
type TopSupporter struct {
	Name  string `json:"name"`
	Total int64  `json:"total"` // base-currency smallest unit (amount_jpy)
}

// GetTopSupporters returns the highest-spending named supporters by total
// Super Chat + effect amount in the base currency. Archive purchases (buyer
// privacy — they're kept out of every public feed), anonymous donations, test
// donations, and blank display names are all excluded.
func GetTopSupporters(limit int) ([]TopSupporter, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := _datastore.DB.Query(
		`SELECT display_name, SUM(amount_jpy) AS total
		 FROM donations
		 WHERE is_test = 0 AND is_anonymous = 0
		   AND item_type IN ('superchat', 'effect')
		   AND display_name IS NOT NULL AND display_name != ''
		   AND amount_jpy > 0
		 GROUP BY display_name
		 ORDER BY total DESC
		 LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	supporters := make([]TopSupporter, 0, limit)
	for rows.Next() {
		var name sql.NullString
		var total sql.NullInt64
		if err := rows.Scan(&name, &total); err != nil {
			return nil, err
		}
		supporters = append(supporters, TopSupporter{Name: name.String, Total: total.Int64})
	}
	return supporters, rows.Err()
}

// GetAllPurchases returns a paginated list of all purchase rows (Super
// Chats, effects and archive purchases, hidden included), newest first, with
// the archive_id column the sqlc bindings predate.
func GetAllPurchases(limit, offset int) ([]*models.Donation, error) {
	rows, err := _datastore.DB.Query(
		`SELECT `+purchaseColumns+`, hidden_at FROM donations
		 ORDER BY created_at DESC
		 LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	donations := make([]*models.Donation, 0)
	for rows.Next() {
		var d models.Donation
		var userID, message, displayName, provider, paymentID, itemType, effectType, fiatCurrency, archiveID sql.NullString
		var isAnonymous, isTest sql.NullBool
		var amountJPY sql.NullInt64
		var createdAt, hiddenAt sql.NullTime
		if err := rows.Scan(
			&d.ID, &userID, &d.Amount, &d.Currency, &message, &displayName, &isAnonymous,
			&provider, &paymentID, &itemType, &effectType, &isTest, &amountJPY, &fiatCurrency, &archiveID,
			&createdAt, &hiddenAt,
		); err != nil {
			return nil, err
		}
		d.UserID = userID.String
		d.Message = message.String
		d.DisplayName = displayName.String
		d.IsAnonymous = isAnonymous.Bool
		d.PaymentProvider = provider.String
		d.PaymentID = paymentID.String
		d.ItemType = itemType.String
		d.EffectType = effectType.String
		d.IsTest = isTest.Bool
		d.AmountJPY = amountJPY.Int64
		d.FiatCurrency = normalizeFiatCurrency(fiatCurrency.String, amountJPY.Int64)
		d.ArchiveID = archiveID.String
		d.CreatedAt = createdAt.Time
		if hiddenAt.Valid {
			t := hiddenAt.Time
			d.HiddenAt = &t
		}
		donations = append(donations, &d)
	}
	return donations, rows.Err()
}

// GetArchivePurchases returns every purchase row for an archive, newest first.
func GetArchivePurchases(archiveID string) ([]*models.Donation, error) {
	rows, err := _datastore.DB.Query(
		`SELECT `+purchaseColumns+` FROM donations
		 WHERE archive_id = ? AND item_type = ?
		 ORDER BY created_at DESC`,
		archiveID, models.DonationItemArchive,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPurchaseRows(rows)
}

// GetPurchasesByUser returns a viewer's own purchase history (all item
// types), newest first, for the self-service purchase list.
func GetPurchasesByUser(userID string) ([]*models.Donation, error) {
	rows, err := _datastore.DB.Query(
		`SELECT `+purchaseColumns+` FROM donations
		 WHERE user_id = ?
		 ORDER BY created_at DESC
		 LIMIT 200`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPurchaseRows(rows)
}

// DeleteArchivePurchase removes an archive purchase row (revoking the
// buyer's access). Only archive rows can be deleted through this path.
func DeleteArchivePurchase(donationID string) error {
	res, err := _datastore.DB.Exec(
		`DELETE FROM donations WHERE id = ? AND item_type = ?`,
		donationID, models.DonationItemArchive,
	)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DonationExistsForPayment reports whether a donation with the given
// provider+paymentID already exists. Used to make webhook processing
// idempotent (e.g. Ko-fi replays) so a duplicate delivery can't create a
// second donation, re-broadcast to chat, or re-fire screen effects.
func DonationExistsForPayment(provider, paymentID string) (bool, error) {
	if provider == "" || paymentID == "" {
		return false, nil
	}
	var exists bool
	err := _datastore.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM donations WHERE payment_provider = ? AND payment_id = ?)`,
		provider, paymentID,
	).Scan(&exists)
	return exists, err
}

// GetDonationByID will return a donation by its ID. Raw SQL so the columns
// that postdate the sqlc bindings (fiat_currency, archive_id) are populated.
func GetDonationByID(id string) (*models.Donation, error) {
	rows, err := _datastore.DB.Query(
		`SELECT `+purchaseColumns+` FROM donations WHERE id = ?`, id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	donations, err := scanPurchaseRows(rows)
	if err != nil {
		return nil, err
	}
	if len(donations) == 0 {
		return nil, sql.ErrNoRows
	}
	return donations[0], nil
}

// GetDonations will return a paginated list of visible donations.
func GetDonations(limit, offset int) ([]*models.Donation, error) {
	rows, err := _datastore.GetQueries().GetDonationsWithOffset(context.Background(), db.GetDonationsWithOffsetParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}

	donations := make([]*models.Donation, 0)
	for _, row := range rows {
		donations = append(donations, donationFromRow(row))
	}
	return donations, nil
}

// GetAllDonations will return a paginated list of all donations (including hidden).
func GetAllDonations(limit, offset int) ([]*models.Donation, error) {
	rows, err := _datastore.GetQueries().GetAllDonationsWithOffset(context.Background(), db.GetAllDonationsWithOffsetParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}

	donations := make([]*models.Donation, 0)
	for _, row := range rows {
		donations = append(donations, donationFromRow(row))
	}
	return donations, nil
}

// GetDonationCount returns the total number of donations.
func GetDonationCount() (int64, error) {
	return _datastore.GetQueries().GetDonationCount(context.Background())
}

// GetDonationTotal returns the total amount donated in a specific currency.
func GetDonationTotal(currency string) (int64, error) {
	// Raw SQL (not the sqlc query) so coin-funded spends can be excluded from
	// revenue: those coins were already booked as revenue when they were charged,
	// so counting the spend too would double-count. Coin CHARGES keep their real
	// provider and are still included.
	var total sql.NullInt64
	err := _datastore.DB.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM donations
		 WHERE currency = ? AND `+notTestNotCoinFunded,
		currency,
	).Scan(&total)
	return total.Int64, err
}

// GetDonationsByUser returns all donations made by a specific user.
func GetDonationsByUser(userID string) ([]*models.Donation, error) {
	rows, err := _datastore.GetQueries().GetDonationsByUser(context.Background(), sql.NullString{String: userID, Valid: true})
	if err != nil {
		return nil, err
	}

	donations := make([]*models.Donation, 0)
	for _, row := range rows {
		donations = append(donations, donationFromRow(row))
	}
	return donations, nil
}

// SetDonationVisibility will show or hide a donation.
func SetDonationVisibility(id string, visible bool) error {
	var hiddenAt sql.NullTime
	if !visible {
		hiddenAt = sql.NullTime{Time: time.Now(), Valid: true}
	}
	return _datastore.GetQueries().SetDonationVisibility(context.Background(), db.SetDonationVisibilityParams{
		HiddenAt: hiddenAt,
		ID:       id,
	})
}

// DeleteDonation will permanently delete a donation from the database.
func DeleteDonation(id string) error {
	return _datastore.GetQueries().DeleteDonation(context.Background(), id)
}

// GetMonthlyDonationTotal returns the current month's non-test donation
// total in the given currency.
func GetMonthlyDonationTotal(currency string) (int64, error) {
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	endOfMonth := startOfMonth.AddDate(0, 1, 0)

	var total int64
	err := _datastore.DB.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM donations
		 WHERE currency = ? AND `+notTestNotCoinFunded+`
		   AND created_at >= ? AND created_at < ?`,
		currency, startOfMonth, endOfMonth,
	).Scan(&total)
	return total, err
}

// GetRecentDonations returns the most recent visible donations. Raw SQL so
// the columns that postdate the sqlc bindings are populated.
func GetRecentDonations(limit int) ([]*models.Donation, error) {
	rows, err := _datastore.DB.Query(
		`SELECT `+purchaseColumns+` FROM donations
		 WHERE hidden_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPurchaseRows(rows)
}

// GetDonationStats aggregates purchase statistics for the admin dashboard.
// Test purchases are excluded from every series except TestCount.
func GetDonationStats() (*models.DonationStats, error) {
	stats := &models.DonationStats{
		Currencies: []models.DonationCurrencyStat{},
		Providers:  []models.DonationProviderStat{},
		Items:      []models.DonationItemStat{},
		Daily:      []models.DonationDailyStat{},
	}

	database := _datastore.DB
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	startOfLastMonth := startOfMonth.AddDate(0, -1, 0)
	const notTest = "(is_test IS NULL OR is_test = FALSE)"

	// Revenue sums exclude coin-funded spends (already counted at charge time).
	currencyRows, err := database.Query(`
		SELECT currency,
			COALESCE(SUM(amount), 0),
			COALESCE(SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0),
			COUNT(*)
		FROM donations WHERE `+notTestNotCoinFunded+`
		GROUP BY currency ORDER BY COUNT(*) DESC`,
		startOfMonth, startOfLastMonth, startOfMonth)
	if err != nil {
		return nil, err
	}
	defer currencyRows.Close()
	for currencyRows.Next() {
		var s models.DonationCurrencyStat
		if err := currencyRows.Scan(&s.Currency, &s.Total, &s.ThisMonth, &s.LastMonth, &s.Count); err != nil {
			return nil, err
		}
		if s.Count > 0 {
			s.Average = s.Total / s.Count
		}
		stats.Currencies = append(stats.Currencies, s)
	}
	if err := currencyRows.Err(); err != nil {
		return nil, err
	}

	providerRows, err := database.Query(`
		SELECT COALESCE(NULLIF(payment_provider, ''), 'manual'), currency,
			COALESCE(SUM(amount), 0), COUNT(*)
		FROM donations WHERE ` + notTestNotCoinFunded + `
		GROUP BY 1, 2 ORDER BY COUNT(*) DESC`)
	if err != nil {
		return nil, err
	}
	defer providerRows.Close()
	for providerRows.Next() {
		var s models.DonationProviderStat
		if err := providerRows.Scan(&s.Provider, &s.Currency, &s.Total, &s.Count); err != nil {
			return nil, err
		}
		stats.Providers = append(stats.Providers, s)
	}
	if err := providerRows.Err(); err != nil {
		return nil, err
	}

	itemRows, err := database.Query(`
		SELECT COALESCE(NULLIF(item_type, ''), 'superchat'), COALESCE(effect_type, ''), COUNT(*)
		FROM donations WHERE ` + notTest + `
		GROUP BY 1, 2 ORDER BY COUNT(*) DESC`)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var s models.DonationItemStat
		if err := itemRows.Scan(&s.ItemType, &s.EffectType, &s.Count); err != nil {
			return nil, err
		}
		stats.Items = append(stats.Items, s)
	}
	if err := itemRows.Err(); err != nil {
		return nil, err
	}

	dailyRows, err := database.Query(`
		SELECT DATE(created_at), currency, COALESCE(SUM(amount), 0), COUNT(*)
		FROM donations
		WHERE created_at >= ? AND `+notTest+`
		GROUP BY 1, 2 ORDER BY 1 ASC`,
		now.AddDate(0, 0, -30))
	if err != nil {
		return nil, err
	}
	defer dailyRows.Close()
	for dailyRows.Next() {
		var s models.DonationDailyStat
		if err := dailyRows.Scan(&s.Date, &s.Currency, &s.Total, &s.Count); err != nil {
			return nil, err
		}
		stats.Daily = append(stats.Daily, s)
	}
	if err := dailyRows.Err(); err != nil {
		return nil, err
	}

	// Unique purchaser names, excluding anonymous purchases which all share
	// a placeholder display name.
	if err := database.QueryRow(`
		SELECT COUNT(DISTINCT display_name) FROM donations
		WHERE is_anonymous = FALSE AND ` + notTest).Scan(&stats.UniquePurchasers); err != nil {
		return nil, err
	}

	if err := database.QueryRow(
		`SELECT COUNT(*) FROM donations WHERE is_test = TRUE`).Scan(&stats.TestCount); err != nil {
		return nil, err
	}

	// Base-currency value of crypto purchases, recorded at confirmation time.
	// Rows converted under a different base currency are excluded rather than
	// summed across currencies; legacy rows with an empty fiat_currency were
	// always recorded in JPY.
	stats.BaseCurrency = GetBaseCurrency()
	if err := database.QueryRow(
		`SELECT COALESCE(SUM(amount_jpy), 0) FROM donations
		 WHERE amount_jpy > 0 AND `+notTest+`
		   AND (fiat_currency = ? OR ((fiat_currency IS NULL OR fiat_currency = '') AND ? = 'JPY'))`,
		stats.BaseCurrency, stats.BaseCurrency,
	).Scan(&stats.CryptoFiatTotal); err != nil {
		return nil, err
	}

	// Everything rolled up into the base currency: a base-currency purchase counts
	// its face amount, a crypto purchase its confirmation-time conversion. Excludes
	// coin-funded spends (already booked as revenue at charge time).
	base := stats.BaseCurrency
	baseValue := `CASE
		WHEN currency = ? THEN amount
		WHEN amount_jpy > 0 AND (fiat_currency = ? OR ((fiat_currency IS NULL OR fiat_currency = '') AND ? = 'JPY'))
			THEN amount_jpy
		ELSE 0 END`
	if err := database.QueryRow(`
		SELECT
			COALESCE(SUM(`+baseValue+`), 0),
			COALESCE(SUM(CASE WHEN created_at >= ? THEN `+baseValue+` ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN `+baseValue+` ELSE 0 END), 0)
		FROM donations WHERE `+notTestNotCoinFunded,
		base, base, base, // total
		startOfMonth, base, base, base, // this month
		startOfLastMonth, startOfMonth, base, base, base, // last month
	).Scan(&stats.BaseTotal, &stats.BaseThisMonth, &stats.BaseLastMonth); err != nil {
		return nil, err
	}

	// Non-base purchases whose rate couldn't be captured at confirmation time, so
	// they contribute nothing to the totals above.
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM donations
		 WHERE `+notTestNotCoinFunded+` AND currency != ? AND (amount_jpy IS NULL OR amount_jpy = 0)`,
		base,
	).Scan(&stats.UnconvertedCryptoCount); err != nil {
		return nil, err
	}

	return stats, nil
}

// Helper function to convert database row to Donation model
func donationFromRow(row db.Donation) *models.Donation {
	donation := &models.Donation{
		ID:        row.ID,
		Amount:    row.Amount,
		Currency:  row.Currency,
		CreatedAt: row.CreatedAt.Time,
	}

	if row.UserID.Valid {
		donation.UserID = row.UserID.String
	}
	if row.Message.Valid {
		donation.Message = row.Message.String
	}
	if row.DisplayName.Valid {
		donation.DisplayName = row.DisplayName.String
	}
	if row.IsAnonymous.Valid {
		donation.IsAnonymous = row.IsAnonymous.Bool
	}
	if row.PaymentProvider.Valid {
		donation.PaymentProvider = row.PaymentProvider.String
	}
	if row.PaymentID.Valid {
		donation.PaymentID = row.PaymentID.String
	}
	if row.ItemType.Valid && row.ItemType.String != "" {
		donation.ItemType = row.ItemType.String
	} else {
		donation.ItemType = models.DonationItemSuperChat
	}
	if row.EffectType.Valid {
		donation.EffectType = row.EffectType.String
	}
	if row.IsTest.Valid {
		donation.IsTest = row.IsTest.Bool
	}
	if row.AmountJpy.Valid {
		donation.AmountJPY = row.AmountJpy.Int64
	}
	if row.HiddenAt.Valid {
		donation.HiddenAt = &row.HiddenAt.Time
	}

	return donation
}

// pendingDonations stores donations that are awaiting payment confirmation.
// It is read and written concurrently from HTTP handlers (payment create,
// webhook, and redirect completion), so all access must hold pendingDonationsMu.
var (
	pendingDonations   = make(map[string]*models.Donation)
	pendingDonationsMu sync.RWMutex
)

// pendingDonationTTL is how long an unconfirmed pending donation is retained
// before the sweeper discards it. Abandoned payments would otherwise leak memory.
const pendingDonationTTL = 2 * time.Hour

func init() {
	// Periodically evict stale pending donations that were never confirmed.
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-pendingDonationTTL)
			pendingDonationsMu.Lock()
			for id, donation := range pendingDonations {
				if donation.CreatedAt.Before(cutoff) {
					delete(pendingDonations, id)
					log.Debugf("Evicted stale pending donation %s", id)
				}
			}
			pendingDonationsMu.Unlock()
		}
	}()
}

// AddPendingDonation stores a pending donation.
func AddPendingDonation(donation *models.Donation) error {
	pendingDonationsMu.Lock()
	defer pendingDonationsMu.Unlock()
	pendingDonations[donation.ID] = donation
	return nil
}

// GetPendingDonation retrieves a pending donation by ID.
func GetPendingDonation(id string) (*models.Donation, error) {
	pendingDonationsMu.RLock()
	defer pendingDonationsMu.RUnlock()
	donation, ok := pendingDonations[id]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return donation, nil
}

// DeletePendingDonation removes a pending donation.
func DeletePendingDonation(id string) {
	pendingDonationsMu.Lock()
	defer pendingDonationsMu.Unlock()
	delete(pendingDonations, id)
}

// ClaimPendingDonation atomically retrieves and removes a pending donation.
// It returns sql.ErrNoRows if the donation is not present, guaranteeing that
// only one concurrent caller (e.g. a webhook racing the success redirect)
// can claim and finalize a given payment.
func ClaimPendingDonation(id string) (*models.Donation, error) {
	pendingDonationsMu.Lock()
	defer pendingDonationsMu.Unlock()
	donation, ok := pendingDonations[id]
	if !ok {
		return nil, sql.ErrNoRows
	}
	delete(pendingDonations, id)
	return donation, nil
}
