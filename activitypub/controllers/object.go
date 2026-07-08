package controllers

import (
	"net/http"
	"strings"

	"github.com/aoiasakawa/aoitube/activitypub/apmodels"
	"github.com/aoiasakawa/aoitube/activitypub/crypto"
	"github.com/aoiasakawa/aoitube/activitypub/persistence"
	"github.com/aoiasakawa/aoitube/activitypub/requests"
	"github.com/aoiasakawa/aoitube/core/data"
	log "github.com/sirupsen/logrus"
)

// ObjectHandler handles requests for a single federated ActivityPub object.
func ObjectHandler(w http.ResponseWriter, r *http.Request) {
	if !data.GetFederationEnabled() {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// If private federation mode is enabled do not allow access to objects.
	if data.GetFederationIsPrivate() {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	iri := strings.Join([]string{strings.TrimSuffix(data.GetServerURL(), "/"), r.URL.Path}, "")
	object, _, _, err := persistence.GetObjectByIRI(iri)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	accountName := data.GetDefaultFederationUsername()
	actorIRI := apmodels.MakeLocalIRIForAccount(accountName)
	publicKey := crypto.GetPublicKey(actorIRI)

	if err := requests.WriteResponse([]byte(object), w, publicKey); err != nil {
		log.Errorln(err)
	}
}
