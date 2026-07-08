package auth

import (
	"database/sql"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"

	log "github.com/sirupsen/logrus"
)

var _datastore *data.Datastore

// Setup will initialize auth persistence.
func Setup(db *data.Datastore) {
	_datastore = db

	createTableSQL := `CREATE TABLE IF NOT EXISTS auth (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		"user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
		"handle" TEXT DEFAULT '',
		"revoked_at" TIMESTAMP,
		"timestamp" DATE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
	);`
	_datastore.MustExec(createTableSQL)
	_datastore.MustExec(`CREATE INDEX IF NOT EXISTS idx_auth_token ON auth (token);`)

	// Migrate pre-existing tables. SQLite has no ADD COLUMN IF NOT EXISTS; a
	// duplicate-column error means the migration already ran, so it is ignored.
	//   handle:     human identifier of the linked account (e.g. an X @handle).
	//   revoked_at: soft-delete timestamp. Unlinking sets it rather than
	//               deleting the row, so the provenance of a purchase is never
	//               lost and a mistaken unlink can be recovered by re-auth.
	for _, migration := range []string{
		`ALTER TABLE auth ADD COLUMN handle TEXT DEFAULT '';`,
		`ALTER TABLE auth ADD COLUMN revoked_at TIMESTAMP;`,
		`ALTER TABLE auth ADD COLUMN revoked_reason TEXT DEFAULT '';`,
	} {
		if _, err := _datastore.DB.Exec(migration); err != nil &&
			!strings.Contains(err.Error(), "duplicate column") {
			log.Warnln("auth table migration:", err)
		}
	}

	setupAuthEvents()
}

// AddAuth links an external authentication token and type to a user. The handle
// is the human-readable identifier of the linked social account (e.g. "@name"
// for X, the GitHub login, a Discord username, a Google email); it is surfaced
// in the admin user list and the viewer's own account panel but never used as
// the public chat display name.
func AddAuth(userID, authToken string, authType Type, handle, actor string) error {
	if _, err := _datastore.DB.Exec(
		`INSERT INTO auth (user_id, token, type, handle) VALUES (?, ?, ?, ?)`,
		userID, authToken, string(authType), handle,
	); err != nil {
		return err
	}
	RecordAuthEvent(userID, authType, handle, ActionLinked, actor)
	return nil
}

// SetSoleProviderAuth enforces one ACTIVE linked account per provider per user:
// it revokes (soft-deletes) any active auth rows of the same type for the user,
// then inserts the new one. Switching to a different account of the same
// provider therefore overwrites the previous active link while keeping it in
// history for provenance.
func SetSoleProviderAuth(userID, authToken string, authType Type, handle, actor string) error {
	// Superseding an existing same-provider account is recorded as "overwritten".
	if err := revokeActiveAuthsOfType(userID, authType, "", ActionOverwritten, actor); err != nil {
		return err
	}
	if _, err := _datastore.DB.Exec(
		`INSERT INTO auth (user_id, token, type, handle) VALUES (?, ?, ?, ?)`,
		userID, authToken, string(authType), handle,
	); err != nil {
		return err
	}
	RecordAuthEvent(userID, authType, handle, ActionLinked, actor)
	return nil
}

// PruneDuplicateProviderAuths revokes every active account of the given type
// for a user EXCEPT keepToken, collapsing pre-existing duplicates down to one
// active link on re-authentication. Best-effort.
func PruneDuplicateProviderAuths(userID, keepToken string, authType Type, actor string) {
	if err := revokeActiveAuthsOfType(userID, authType, keepToken, ActionOverwritten, actor); err != nil {
		log.Warnln("unable to prune duplicate provider auths:", err)
	}
}

// revokeActiveAuthsOfType soft-deletes a user's active auth rows of a type,
// optionally keeping exceptToken active, recording an audit event per revoked
// account.
func revokeActiveAuthsOfType(userID string, authType Type, exceptToken, action, actor string) error {
	// Record each account being revoked (with its handle) before the update.
	query := `SELECT token, COALESCE(handle, '') FROM auth
		WHERE user_id = ? AND type = ? AND revoked_at IS NULL`
	args := []interface{}{userID, string(authType)}
	if exceptToken != "" {
		query += ` AND token != ?`
		args = append(args, exceptToken)
	}
	rows, err := _datastore.DB.Query(query, args...)
	if err != nil {
		return err
	}
	type revoked struct{ token, handle string }
	var toRevoke []revoked
	for rows.Next() {
		var r revoked
		if err := rows.Scan(&r.token, &r.handle); err != nil {
			rows.Close()
			return err
		}
		toRevoke = append(toRevoke, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// Record why the link was revoked. A user-initiated unlink is durable — it
	// is never auto-reactivated on a later login (only an operator can restore
	// it), so unlink is a real revocation and cannot be undone by whoever next
	// controls that social account. System revocations (overwrite/merge) may be
	// auto-reactivated.
	update := `UPDATE auth SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
		WHERE user_id = ? AND type = ? AND revoked_at IS NULL`
	updateArgs := append([]interface{}{action}, args...)
	if exceptToken != "" {
		update += ` AND token != ?`
	}
	if _, err := _datastore.DB.Exec(update, updateArgs...); err != nil {
		return err
	}
	for _, r := range toRevoke {
		RecordAuthEvent(userID, authType, r.handle, action, actor)
	}
	return nil
}

// MergeUsers consolidates the source identity into the target atomically: auth
// links, purchases, access tokens and chat messages move to the target; the
// target keeps one active account per provider; the source is disabled; and a
// linked pair of merge events is recorded on both users. Everything runs in a
// single transaction so a partial failure can never strand purchases under a
// half-merged, still-enabled source. The append-only audit log is NOT rewritten
// — each user's history stays under its own ID — and the merge markers cross-
// reference each other (target event handle = sourceID, source event handle =
// targetID) so the direction is recoverable.
func MergeUsers(sourceID, targetID, actor string) error {
	tx, err := _datastore.DB.Begin()
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	// Move auth links, purchases, tokens and chat messages to the target.
	for _, stmt := range []string{
		`UPDATE auth SET user_id = ? WHERE user_id = ?`,
		`UPDATE donations SET user_id = ? WHERE user_id = ?`,
		`UPDATE user_access_tokens SET user_id = ? WHERE user_id = ?`,
		`UPDATE messages SET user_id = ? WHERE user_id = ?`,
	} {
		if _, err := tx.Exec(stmt, targetID, sourceID); err != nil {
			return err
		}
	}

	// Re-establish one active link per provider on the target: for each type
	// with more than one active link, keep the newest (timestamp, then id, as a
	// deterministic tiebreak) and revoke the rest.
	if _, err := tx.Exec(
		`UPDATE auth SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
		 WHERE revoked_at IS NULL AND user_id = ? AND id NOT IN (
		   SELECT id FROM (
		     SELECT id, ROW_NUMBER() OVER (
		       PARTITION BY type ORDER BY timestamp DESC, id DESC
		     ) AS rn
		     FROM auth WHERE user_id = ? AND revoked_at IS NULL
		   ) WHERE rn = 1
		 )`,
		ActionOverwritten, targetID, targetID,
	); err != nil {
		return err
	}

	// Carry authenticated status forward; disable the now-empty source.
	if _, err := tx.Exec(
		`UPDATE users SET authenticated_at = COALESCE(authenticated_at,
		   (SELECT authenticated_at FROM users WHERE id = ?)) WHERE id = ?`,
		sourceID, targetID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`UPDATE users SET disabled_at = CURRENT_TIMESTAMP WHERE id = ? AND disabled_at IS NULL`,
		sourceID,
	); err != nil {
		return err
	}

	// Cross-referenced merge markers (append-only), committed with the data.
	if _, err := tx.Exec(
		`INSERT INTO auth_events (user_id, type, handle, action, actor) VALUES (?, '', ?, ?, ?)`,
		targetID, sourceID, ActionMerged, actor,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO auth_events (user_id, type, handle, action, actor) VALUES (?, '', ?, ?, ?)`,
		sourceID, targetID, ActionMerged, actor,
	); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// CountOtherProviderAuths returns how many ACTIVE linked accounts a user has of
// a type OTHER than the given one — i.e. how many login methods would remain if
// authType were unlinked. Zero means authType is the user's last login method.
func CountOtherProviderAuths(userID string, authType Type) (int, error) {
	var count int
	err := _datastore.DB.QueryRow(
		`SELECT COUNT(*) FROM auth
		 WHERE user_id = ? AND type != ? AND revoked_at IS NULL`,
		userID, string(authType),
	).Scan(&count)
	return count, err
}

// RevokeProviderAuth unlinks a provider from a user by soft-deleting that
// user's active auth rows of the given type (the rows are kept as history, not
// deleted). Returns the number of remaining ACTIVE linked accounts (any type)
// so the caller can revert the user to anonymous when the last one is removed.
func RevokeProviderAuth(userID string, authType Type, actor string) (int, error) {
	if err := revokeActiveAuthsOfType(userID, authType, "", ActionUnlinked, actor); err != nil {
		return 0, err
	}
	var remaining int
	if err := _datastore.DB.QueryRow(
		`SELECT COUNT(*) FROM auth WHERE user_id = ? AND revoked_at IS NULL`, userID,
	).Scan(&remaining); err != nil {
		return 0, err
	}
	return remaining, nil
}

// UpdateAuthHandle refreshes the stored handle for an active auth record
// (matched by token and type). Called on re-authentication so accounts that
// linked before the handle column existed — or whose handle changed — get the
// current value. Best-effort: never blocks login.
func UpdateAuthHandle(authToken string, authType Type, handle string) {
	if handle == "" {
		return
	}
	if _, err := _datastore.DB.Exec(
		`UPDATE auth SET handle = ? WHERE token = ? AND type = ? AND revoked_at IS NULL`,
		handle, authToken, string(authType),
	); err != nil {
		log.Warnln("unable to update auth handle:", err)
	}
}

// userSelectColumns is the user row selected by the auth lookups, matching the
// scan order in scanAuthUser.
const userSelectColumns = `users.id, users.display_name, users.display_color, users.created_at,
	users.disabled_at, users.previous_names, users.namechanged_at, users.authenticated_at, users.scopes`

// scanAuthUser builds a user.User from a row selected with userSelectColumns.
func scanAuthUser(row *sql.Row) *user.User {
	var id, displayName string
	var displayColor int
	var createdAt time.Time
	var disabledAt, namechangedAt, authenticatedAt sql.NullTime
	var previousNames, scopes sql.NullString

	if err := row.Scan(&id, &displayName, &displayColor, &createdAt,
		&disabledAt, &previousNames, &namechangedAt, &authenticatedAt, &scopes); err != nil {
		return nil
	}

	u := &user.User{
		ID:            id,
		DisplayName:   displayName,
		DisplayColor:  displayColor,
		CreatedAt:     createdAt,
		Authenticated: authenticatedAt.Valid,
	}
	if disabledAt.Valid {
		u.DisabledAt = &disabledAt.Time
	}
	if namechangedAt.Valid {
		u.NameChangedAt = &namechangedAt.Time
	}
	if authenticatedAt.Valid {
		u.AuthenticatedAt = &authenticatedAt.Time
	}
	if previousNames.Valid {
		u.PreviousNames = strings.Split(previousNames.String, ",")
	}
	if scopes.Valid {
		u.Scopes = strings.Split(scopes.String, ",")
	}
	return u
}

// GetUserByAuth returns the user an ACTIVE (non-revoked) auth link belongs to,
// or nil if the account is not currently linked.
func GetUserByAuth(authToken string, authType Type) *user.User {
	row := _datastore.DB.QueryRow(
		`SELECT `+userSelectColumns+` FROM auth, users
		 WHERE auth.token = ? AND auth.type = ? AND users.id = auth.user_id
		   AND auth.revoked_at IS NULL`,
		authToken, string(authType),
	)
	return scanAuthUser(row)
}

// FindLinkedUser resolves the user an account belongs to for the login flow. If
// the link is active it is returned directly; if it was previously unlinked
// (revoked) it is reactivated and its original owner returned, so
// re-authenticating with the same account recovers the original identity — and
// its entitlements — instead of stranding them on a new anonymous user.
func FindLinkedUser(authToken string, authType Type, actor string) *user.User {
	if u := GetUserByAuth(authToken, authType); u != nil {
		return u
	}
	return reactivateRevokedAuth(authToken, authType, actor)
}

// ReactivateAuth restores a specific revoked link (matched by user, token and
// type), enforcing the one-active-account-per-provider invariant, and records
// the audit event with the given actor. Used by the operator's manual-recovery
// action. Returns whether a matching revoked link was found and reactivated.
func ReactivateAuth(userID, authToken string, authType Type, actor string) bool {
	handle := reactivateOwnedRevokedAuth(userID, authToken, authType, actor)
	return handle != nil
}

// reactivateRevokedAuth restores the most recently revoked link for an account
// on the LOGIN path and returns its original owner, or nil if the account has
// no auto-recoverable revoked link. Links the user explicitly unlinked
// (revoked_reason = "unlinked") are deliberately excluded: unlink is a durable
// revocation, so whoever later controls that social account cannot silently
// reclaim the original identity by re-authenticating. Only system revocations
// (overwrite / merge) auto-reactivate; a user-unlinked link can be restored
// solely via the operator's ReactivateAuth path.
func reactivateRevokedAuth(authToken string, authType Type, actor string) *user.User {
	var userID string
	if err := _datastore.DB.QueryRow(
		`SELECT user_id FROM auth
		 WHERE token = ? AND type = ? AND revoked_at IS NOT NULL
		   AND COALESCE(revoked_reason, '') != ?
		 ORDER BY revoked_at DESC, id DESC LIMIT 1`,
		authToken, string(authType), ActionUnlinked,
	).Scan(&userID); err != nil {
		return nil // no auto-recoverable revoked link for this account
	}

	if reactivateOwnedRevokedAuth(userID, authToken, authType, actor) == nil {
		return nil
	}
	return user.GetUserByID(userID)
}

// reactivateOwnedRevokedAuth reactivates a revoked (userID, token, type) link,
// revoking the owner's other active same-provider links first. Returns the
// reactivated handle, or nil if no matching revoked link exists.
func reactivateOwnedRevokedAuth(userID, authToken string, authType Type, actor string) *string {
	var handle string
	if err := _datastore.DB.QueryRow(
		`SELECT COALESCE(handle, '') FROM auth
		 WHERE user_id = ? AND token = ? AND type = ? AND revoked_at IS NOT NULL
		 ORDER BY revoked_at DESC LIMIT 1`,
		userID, authToken, string(authType),
	).Scan(&handle); err != nil {
		return nil
	}

	// A social account can be actively linked to only one user. If the token
	// was re-claimed by a different user since it was revoked here, revoke that
	// active link first so reactivation doesn't create two active owners.
	if _, err := _datastore.DB.Exec(
		`UPDATE auth SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
		 WHERE token = ? AND type = ? AND user_id != ? AND revoked_at IS NULL`,
		ActionOverwritten, authToken, string(authType), userID,
	); err != nil {
		log.Warnln("unable to revoke conflicting token owner during reactivation:", err)
	}
	// Keep one active account per provider for the recovered user.
	if err := revokeActiveAuthsOfType(userID, authType, authToken, ActionOverwritten, actor); err != nil {
		log.Warnln("unable to revoke conflicting auths during reactivation:", err)
	}
	if _, err := _datastore.DB.Exec(
		`UPDATE auth SET revoked_at = NULL, revoked_reason = ''
		 WHERE token = ? AND type = ? AND user_id = ?`,
		authToken, string(authType), userID,
	); err != nil {
		log.Errorln("unable to reactivate revoked auth:", err)
		return nil
	}

	RecordAuthEvent(userID, authType, handle, ActionReactivated, actor)
	log.Debugf("reactivated revoked %s auth for user %s (actor %s)", authType, userID, actor)
	return &handle
}

// HasUserAuthenticatedWithType reports whether a user has an active link of a
// specific auth type.
func HasUserAuthenticatedWithType(userID string, authType Type) bool {
	var count int
	if err := _datastore.DB.QueryRow(
		`SELECT COUNT(*) FROM auth
		 WHERE user_id = ? AND type = ? AND revoked_at IS NULL`,
		userID, string(authType),
	).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

// GetUserAuthDetails returns a user's ACTIVE linked accounts with their handles,
// newest first. Used by the viewer's own account panel and the connected-client
// info, which must only show current logins.
func GetUserAuthDetails(userID string) []user.AuthDetail {
	rows, err := _datastore.DB.Query(
		`SELECT type, COALESCE(handle, '') FROM auth
		 WHERE user_id = ? AND revoked_at IS NULL
		 ORDER BY timestamp DESC`,
		userID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var details []user.AuthDetail
	for rows.Next() {
		var d user.AuthDetail
		if err := rows.Scan(&d.Type, &d.Handle); err != nil {
			return details
		}
		details = append(details, d)
	}
	return details
}

// GetUserAuthDetailsForAdmin returns all of a user's linked accounts including
// revoked (unlinked) ones, marked with Revoked, active first. Gives the
// operator the full link/unlink history for governance and dispute resolution.
func GetUserAuthDetailsForAdmin(userID string) []user.AuthDetail {
	rows, err := _datastore.DB.Query(
		`SELECT type, COALESCE(handle, ''), (revoked_at IS NOT NULL), token FROM auth
		 WHERE user_id = ?
		 ORDER BY (revoked_at IS NULL) DESC, timestamp DESC`,
		userID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var details []user.AuthDetail
	for rows.Next() {
		var d user.AuthDetail
		if err := rows.Scan(&d.Type, &d.Handle, &d.Revoked, &d.Token); err != nil {
			return details
		}
		details = append(details, d)
	}
	return details
}

// GetUserAuthTypes returns the distinct ACTIVE authentication types for a user.
func GetUserAuthTypes(userID string) []string {
	rows, err := _datastore.DB.Query(
		`SELECT DISTINCT type FROM auth WHERE user_id = ? AND revoked_at IS NULL`,
		userID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var types []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return types
		}
		types = append(types, t)
	}
	return types
}

// GetPrimaryAuthType returns the primary auth type for a user (prefers Twitter over others).
func GetPrimaryAuthType(userID string) string {
	types := GetUserAuthTypes(userID)
	if len(types) == 0 {
		return ""
	}

	// Prioritize Twitter auth
	for _, t := range types {
		if t == string(Twitter) {
			return t
		}
	}

	// Return the first type found
	return types[0]
}
