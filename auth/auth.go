package auth

// Type represents a form of authentication.
type Type string

// The different auth types we support.
const (
	// IndieAuth https://indieauth.spec.indieweb.org/.
	IndieAuth Type = "indieauth"
	Fediverse Type = "fediverse"
	Twitter   Type = "twitter"
	Discord   Type = "discord"
	X         Type = "x"
	Google    Type = "google"
	GitHub    Type = "github"
)
