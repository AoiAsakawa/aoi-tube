package inbox

import (
	"context"
	"fmt"
	"time"

	"github.com/aoiasakawa/aoitube/activitypub/apmodels"
	"github.com/aoiasakawa/aoitube/activitypub/persistence"
	"github.com/aoiasakawa/aoitube/activitypub/requests"
	"github.com/aoiasakawa/aoitube/activitypub/resolvers"
	"github.com/aoiasakawa/aoitube/core/chat/events"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/go-fed/activity/streams/vocab"
	"github.com/pkg/errors"

	log "github.com/sirupsen/logrus"
)

func handleFollowInboxRequest(c context.Context, activity vocab.ActivityStreamsFollow) error {
	follow, err := resolvers.MakeFollowRequest(c, activity)
	if err != nil {
		log.Errorln("unable to create follow inbox request", err)
		return err
	}

	if follow == nil {
		return fmt.Errorf("unable to handle request")
	}

	approved := !data.GetFederationIsPrivate()

	followRequest := *follow

	if err := persistence.AddFollow(followRequest, approved); err != nil {
		log.Errorln("unable to save follow request", err)
		return err
	}

	localAccountName := data.GetDefaultFederationUsername()

	objectIRI, err := apmodels.GetIRIStringFromObjectProperty(activity.GetActivityStreamsObject())
	if err != nil {
		return errors.Wrap(err, "follow activity is missing object IRI")
	}

	actorIRI, err := apmodels.GetIRIStringFromActorProperty(activity.GetActivityStreamsActor())
	if err != nil {
		return errors.Wrap(err, "follow activity is missing actor IRI")
	}

	actorReference := activity.GetActivityStreamsActor()

	if approved {
		if err := requests.SendFollowAccept(follow.Inbox, activity, localAccountName); err != nil {
			log.Errorln("unable to send follow accept", err)
			return err
		}
	}

	// If this request is approved and we have not previously sent an action to
	// chat due to a previous follow request, then do so.
	hasPreviouslyhandled := true // Default so we don't send anything if it fails.
	if approved {
		hasPreviouslyhandled, err = persistence.HasPreviouslyHandledInboundActivity(objectIRI, actorIRI, events.FediverseEngagementFollow)
		if err != nil {
			log.Errorln("error checking for previously handled follow activity", err)
		}
	}

	// Save this follow action to our activities table.
	if err := persistence.SaveInboundFediverseActivity(objectIRI, actorIRI, events.FediverseEngagementFollow, time.Now()); err != nil {
		return errors.Wrap(err, "unable to save inbound share/re-post activity")
	}

	// Send action to chat if it has not been previously handled.
	if !hasPreviouslyhandled {
		return handleEngagementActivity(events.FediverseEngagementFollow, false, actorReference, events.FediverseEngagementFollow)
	}

	return nil
}

func handleUnfollowRequest(c context.Context, activity vocab.ActivityStreamsUndo) error {
	request := resolvers.MakeUnFollowRequest(c, activity)
	if request == nil {
		log.Errorf("unable to handle unfollow request")
		return errors.New("unable to handle unfollow request")
	}

	unfollowRequest := *request
	log.Traceln("unfollow request:", unfollowRequest)

	return persistence.RemoveFollow(unfollowRequest)
}
