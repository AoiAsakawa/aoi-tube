package auth

import (
	"time"

	log "github.com/sirupsen/logrus"
)

// Auth event actions recorded in the append-only audit log.
const (
	// ActionLinked is a social account newly linked to a user.
	ActionLinked = "linked"
	// ActionUnlinked is a user unlinking (soft-deleting) a linked account.
	ActionUnlinked = "unlinked"
	// ActionReactivated is a previously-unlinked account restored (by the user
	// re-authenticating, or by an operator).
	ActionReactivated = "reactivated"
	// ActionOverwritten is a same-provider account superseded by a new one.
	ActionOverwritten = "overwritten"
	// ActionMerged records an account-merge on both the source and target user.
	ActionMerged = "merged"
	// ActionDeleted records that a user (and its auth links) was deleted by an
	// operator; the marker persists in the append-only log after the auth rows
	// themselves are gone, preserving provenance.
	ActionDeleted = "deleted"
)

// Auth event actors.
const (
	// ActorSelf is an action the viewer performed on their own account.
	ActorSelf = "self"
	// ActorAdmin is an action an operator performed via the admin panel.
	ActorAdmin = "admin"
)

// AuthEvent is one append-only record in the authentication audit log: who
// linked/unlinked/reactivated/merged which social account, and when. The log is
// never mutated or deleted, so it is the authoritative provenance trail for a
// user's identity and their purchases.
type AuthEvent struct {
	ID        int64     `json:"id"`
	UserID    string    `json:"userId"`
	Type      string    `json:"type"`
	Handle    string    `json:"handle,omitempty"`
	Action    string    `json:"action"`
	Actor     string    `json:"actor"`
	CreatedAt time.Time `json:"createdAt"`
}

// setupAuthEvents creates the append-only audit table.
func setupAuthEvents() {
	_datastore.MustExec(`CREATE TABLE IF NOT EXISTS auth_events (
		"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		"user_id" TEXT NOT NULL,
		"type" TEXT NOT NULL,
		"handle" TEXT DEFAULT '',
		"action" TEXT NOT NULL,
		"actor" TEXT NOT NULL,
		"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
	);`)
	_datastore.MustExec(`CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events (user_id);`)
}

// RecordAuthEvent appends an entry to the audit log. Best-effort: a logging
// failure must never block the auth change it describes.
func RecordAuthEvent(userID string, authType Type, handle, action, actor string) {
	if _, err := _datastore.DB.Exec(
		`INSERT INTO auth_events (user_id, type, handle, action, actor) VALUES (?, ?, ?, ?, ?)`,
		userID, string(authType), handle, action, actor,
	); err != nil {
		log.Warnln("unable to record auth event:", err)
	}
}

// authEventsLimit bounds a single audit-log fetch so a user who cycles
// link/unlink cannot make the admin endpoint return an unbounded response.
const authEventsLimit = 500

// GetAuthEvents returns a user's audit log, newest first (most recent
// authEventsLimit entries).
func GetAuthEvents(userID string) []AuthEvent {
	rows, err := _datastore.DB.Query(
		`SELECT id, user_id, type, COALESCE(handle, ''), action, actor, created_at
		 FROM auth_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
		userID, authEventsLimit,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var events []AuthEvent
	for rows.Next() {
		var e AuthEvent
		if err := rows.Scan(&e.ID, &e.UserID, &e.Type, &e.Handle, &e.Action, &e.Actor, &e.CreatedAt); err != nil {
			return events
		}
		events = append(events, e)
	}
	return events
}
