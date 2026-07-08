package notifications

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/notifications/browser"
	"github.com/aoiasakawa/aoitube/notifications/discord"
	"github.com/aoiasakawa/aoitube/notifications/twitter"
	"github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
)

// Notifier is an instance of the live stream notifier.
type Notifier struct {
	datastore *data.Datastore
	browser   *browser.Browser
	discord   *discord.Discord
	twitter   *twitter.Twitter
}

// Setup will perform any pre-use setup for the notifier.
func Setup(datastore *data.Datastore) {
	createNotificationsTable(datastore.DB)
	initializeBrowserPushIfNeeded()
}

func initializeBrowserPushIfNeeded() {
	pubKey, _ := data.GetBrowserPushPublicKey()
	privKey, _ := data.GetBrowserPushPrivateKey()

	// We need browser push keys so people can register for pushes.
	if pubKey == "" || privKey == "" {
		browserPrivateKey, browserPublicKey, err := browser.GenerateBrowserPushKeys()
		if err != nil {
			log.Errorln("unable to initialize browser push notification keys", err)
		}

		if err := data.SetBrowserPushPrivateKey(browserPrivateKey); err != nil {
			log.Errorln("unable to set browser push private key", err)
		}

		if err := data.SetBrowserPushPublicKey(browserPublicKey); err != nil {
			log.Errorln("unable to set browser push public key", err)
		}
	}

	// Enable browser push notifications by default.
	if !data.GetHasPerformedInitialNotificationsConfig() {
		_ = data.SetBrowserPushConfig(models.BrowserNotificationConfiguration{Enabled: true, GoLiveMessage: config.GetDefaults().FederationGoLiveMessage})
		_ = data.SetHasPerformedInitialNotificationsConfig(true)
	}
}

// New creates a new instance of the Notifier.
func New(datastore *data.Datastore) (*Notifier, error) {
	notifier := Notifier{
		datastore: datastore,
	}

	if err := notifier.setupBrowserPush(); err != nil {
		log.Error(err)
	}
	if err := notifier.setupDiscord(); err != nil {
		log.Error(err)
	}
	if err := notifier.setupTwitter(); err != nil {
		log.Error(err)
	}

	return &notifier, nil
}

func (n *Notifier) setupBrowserPush() error {
	if data.GetBrowserPushConfig().Enabled {
		publicKey, err := data.GetBrowserPushPublicKey()
		if err != nil || publicKey == "" {
			return errors.Wrap(err, "browser notifier disabled, failed to get browser push public key")
		}

		privateKey, err := data.GetBrowserPushPrivateKey()
		if err != nil || privateKey == "" {
			return errors.Wrap(err, "browser notifier disabled, failed to get browser push private key")
		}

		browserNotifier, err := browser.New(n.datastore, publicKey, privateKey)
		if err != nil {
			return errors.Wrap(err, "error creating browser notifier")
		}
		n.browser = browserNotifier
	}
	return nil
}

func (n *Notifier) notifyBrowserPush() {
	destinations, err := GetNotificationDestinationsForChannel(BrowserPushNotification)
	if err != nil {
		log.Errorln("error getting browser push notification destinations", err)
	}
	for _, destination := range destinations {
		unsubscribed, err := n.browser.Send(destination, data.GetServerName(), data.GetBrowserPushConfig().GoLiveMessage)
		if unsubscribed {
			// If the error is "unsubscribed", then remove the destination from the database.
			if err := RemoveNotificationForChannel(BrowserPushNotification, destination); err != nil {
				log.Errorln(err)
			}
		} else if err != nil {
			log.Errorln(err)
		}
	}
}

func (n *Notifier) setupDiscord() error {
	discordConfig := data.GetDiscordConfig()
	if discordConfig.Enabled && discordConfig.Webhook != "" {
		var image string
		var thumbnail string
		if serverURL := data.GetServerURL(); serverURL != "" {
			image = serverURL + "/logo"
			// Use notification thumbnail if set, otherwise use logo as thumbnail
			if data.GetNotificationThumbnailPath() != "" {
				thumbnail = serverURL + "/notification-thumbnail"
			} else {
				thumbnail = serverURL + "/logo"
			}
		}
		discordNotifier, err := discord.New(
			data.GetServerName(),
			image,
			discordConfig.Webhook,
			thumbnail,
		)
		if err != nil {
			return errors.Wrap(err, "error creating discord notifier")
		}
		n.discord = discordNotifier
	}
	return nil
}

func (n *Notifier) notifyDiscord() {
	goLiveMessage := data.GetDiscordConfig().GoLiveMessage
	streamTitle := data.GetStreamTitle()
	if streamTitle != "" {
		goLiveMessage += "\n" + streamTitle
	}
	message := fmt.Sprintf("%s\n\n%s", goLiveMessage, data.GetServerURL())

	if err := n.discord.Send(message); err != nil {
		log.Errorln("error sending discord message", err)
	}
}

func (n *Notifier) setupTwitter() error {
	twitterConfig := data.GetTwitterConfig()
	if twitterConfig.Enabled && twitterConfig.ConsumerKey != "" {
		var thumbnailURL string
		if serverURL := data.GetServerURL(); serverURL != "" {
			// Use notification thumbnail if set, otherwise use logo
			if data.GetNotificationThumbnailPath() != "" {
				thumbnailURL = serverURL + "/notification-thumbnail"
			} else {
				thumbnailURL = serverURL + "/logo"
			}
		}
		twitterNotifier, err := twitter.New(
			twitterConfig.ConsumerKey,
			twitterConfig.ConsumerSecret,
			twitterConfig.AccessToken,
			twitterConfig.AccessTokenSecret,
			thumbnailURL,
		)
		if err != nil {
			return errors.Wrap(err, "error creating twitter notifier")
		}
		n.twitter = twitterNotifier
	}
	return nil
}

func (n *Notifier) notifyTwitter() {
	twitterConfig := data.GetTwitterConfig()
	goLiveMessage := strings.TrimSpace(twitterConfig.GoLiveMessage)
	streamTitle := strings.TrimSpace(data.GetStreamTitle())
	serverName := strings.TrimSpace(data.GetServerName())
	serverURL := strings.TrimSpace(data.GetServerURL())

	var contentLines []string
	if twitterConfig.IncludeServerName && serverName != "" {
		contentLines = append(contentLines, fmt.Sprintf("📺 %s", serverName))
	}
	if goLiveMessage != "" {
		contentLines = append(contentLines, goLiveMessage)
	}
	if twitterConfig.IncludeTitle && streamTitle != "" {
		contentLines = append(contentLines, fmt.Sprintf("🎬 %s", streamTitle))
	}

	var footerLines []string
	if serverURL != "" {
		footerLines = append(footerLines, fmt.Sprintf("🔗 %s", serverURL))
	}
	if hashtags := normalizeTwitterHashtags(twitterConfig.Hashtags); hashtags != "" {
		footerLines = append(footerLines, hashtags)
	}

	message := strings.Join(contentLines, "\n")
	if len(footerLines) > 0 {
		if message != "" {
			message += "\n\n"
		}
		message += strings.Join(footerLines, "\n")
	}
	message = strings.TrimSpace(message)

	if err := n.twitter.Send(message); err != nil {
		log.Errorln("error sending twitter message", err)
	}
}

func normalizeTwitterHashtags(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	separators := func(r rune) bool {
		return unicode.IsSpace(r) || r == ',' || r == '、'
	}

	seen := make(map[string]struct{})
	var tags []string
	for _, raw := range strings.FieldsFunc(input, separators) {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		// Allow both ASCII and full-width hash.
		t = strings.TrimLeft(t, "#＃")
		if t == "" {
			continue
		}
		normalized := "#" + t
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		tags = append(tags, normalized)
	}

	return strings.Join(tags, " ")
}

// Notify will fire the different notification channels.
func (n *Notifier) Notify() {
	if n.browser != nil {
		n.notifyBrowserPush()
	}

	if n.discord != nil {
		n.notifyDiscord()
	}

	if n.twitter != nil {
		n.notifyTwitter()
	}
}
