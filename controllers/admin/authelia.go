package admin

import (
	"net/http"
	"os"
	"regexp"

	"github.com/aoiasakawa/aoitube/controllers"
)

// autheliaNotificationFileEnv points at the file the Authelia filesystem
// notifier writes to. When set, the admin UI can fetch one-time codes from it
// directly instead of asking the operator to read the file over SSH — on a
// self-hosted box without email delivery the file is the "mailbox", and this
// endpoint is only reachable with admin credentials.
const autheliaNotificationFileEnv = "OWNCAST_AUTHELIA_NOTIFICATION_FILE"

var oneTimeCodePattern = regexp.MustCompile(`(?m)^[A-Z0-9]{8}$`)

// GetAutheliaOneTimeCode returns the most recent one-time code from the
// Authelia notification file, if configured and present.
func GetAutheliaOneTimeCode(w http.ResponseWriter, r *http.Request) {
	path := os.Getenv(autheliaNotificationFileEnv)
	if path == "" {
		controllers.WriteSimpleResponse(w, false, "not configured")
		return
	}

	contents, err := os.ReadFile(path) // nolint:gosec
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "notification file unavailable")
		return
	}

	codes := oneTimeCodePattern.FindAllString(string(contents), -1)
	if len(codes) == 0 {
		controllers.WriteSimpleResponse(w, false, "no code found")
		return
	}

	controllers.WriteResponse(w, map[string]interface{}{
		"success": true,
		"code":    codes[len(codes)-1],
	})
}
