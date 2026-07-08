package auth

import (
	"context"
	"strings"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"

	"github.com/aoiasakawa/aoitube/db"
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
		"timestamp" DATE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
	);`
	_datastore.MustExec(createTableSQL)
	_datastore.MustExec(`CREATE INDEX IF NOT EXISTS idx_auth_token ON auth (token);`)
}

// AddAuth will add an external authentication token and type for a user.
func AddAuth(userID, authToken string, authType Type) error {
	return _datastore.GetQueries().AddAuthForUser(context.Background(), db.AddAuthForUserParams{
		UserID: userID,
		Token:  authToken,
		Type:   string(authType),
	})
}

// GetUserByAuth will return an existing user given auth details if a user
// has previously authenticated with that method.
func GetUserByAuth(authToken string, authType Type) *user.User {
	u, err := _datastore.GetQueries().GetUserByAuth(context.Background(), db.GetUserByAuthParams{
		Token: authToken,
		Type:  string(authType),
	})
	if err != nil {
		return nil
	}

	var scopes []string
	if u.Scopes.Valid {
		scopes = strings.Split(u.Scopes.String, ",")
	}

	return &user.User{
		ID:              u.ID,
		DisplayName:     u.DisplayName,
		DisplayColor:    int(u.DisplayColor),
		CreatedAt:       u.CreatedAt.Time,
		DisabledAt:      &u.DisabledAt.Time,
		PreviousNames:   strings.Split(u.PreviousNames.String, ","),
		NameChangedAt:   &u.NamechangedAt.Time,
		AuthenticatedAt: &u.AuthenticatedAt.Time,
		Scopes:          scopes,
	}
}

// HasUserAuthenticatedWithType checks if a user has authenticated with a specific auth type.
func HasUserAuthenticatedWithType(userID string, authType Type) bool {
	count, err := _datastore.GetQueries().GetUserAuthCountByType(context.Background(), db.GetUserAuthCountByTypeParams{
		UserID: userID,
		Type:   string(authType),
	})
	if err != nil {
		return false
	}
	return count > 0
}

// GetUserAuthTypes returns the authentication types for a user.
func GetUserAuthTypes(userID string) []string {
	types, err := _datastore.GetQueries().GetUserAuthTypes(context.Background(), userID)
	if err != nil {
		return nil
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
