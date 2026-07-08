package inbox

import (
	"context"

	"github.com/aoiasakawa/aoitube/activitypub/apmodels"
	"github.com/aoiasakawa/aoitube/activitypub/persistence"
	"github.com/aoiasakawa/aoitube/activitypub/resolvers"
	"github.com/go-fed/activity/streams/vocab"
	log "github.com/sirupsen/logrus"
)

func handleUpdateRequest(c context.Context, activity vocab.ActivityStreamsUpdate) error {
	// We only care about update events to followers.
	if !apmodels.IsFirstObjectActivityStreamsPerson(activity.GetActivityStreamsObject()) {
		return nil
	}

	actor, err := resolvers.GetResolvedActorFromActorProperty(activity.GetActivityStreamsActor())
	if err != nil {
		log.Errorln(err)
		return err
	}

	return persistence.UpdateFollower(actor.ActorIriString(), actor.InboxString(), actor.Name, actor.FullUsername, actor.ImageString())
}
