package router

import (
	"fmt"
	"net/http"
	"time"

	"github.com/CAFxX/httpcompression"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	log "github.com/sirupsen/logrus"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/aoiasakawa/aoitube/activitypub"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/controllers/admin"
	discordauth "github.com/aoiasakawa/aoitube/controllers/auth/discord"
	fediverseauth "github.com/aoiasakawa/aoitube/controllers/auth/fediverse"
	githubauth "github.com/aoiasakawa/aoitube/controllers/auth/github"
	googleauth "github.com/aoiasakawa/aoitube/controllers/auth/google"
	"github.com/aoiasakawa/aoitube/controllers/auth/indieauth"
	xauth "github.com/aoiasakawa/aoitube/controllers/auth/x"
	"github.com/aoiasakawa/aoitube/controllers/moderation"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
	"github.com/aoiasakawa/aoitube/yp"
)

// Start starts the router for the http, ws, and rtmp.
func Start() error {
	// The primary web app.
	http.HandleFunc("/", controllers.IndexHandler)

	// The admin web app.
	http.HandleFunc("/admin/", middleware.RequireAdminAuth(controllers.IndexHandler))

	// Site branding: favicon, touch icons and web manifest follow the
	// configured logo/name. iOS requests /apple-touch-icon*.png by convention.
	http.HandleFunc("/favicon.ico", controllers.GetLogo)
	http.HandleFunc("/apple-touch-icon.png", controllers.GetLogo)
	http.HandleFunc("/apple-touch-icon-precomposed.png", controllers.GetLogo)
	// The legacy favicon set under /img/favicon/ (referenced by old service
	// workers and cached manifests) always resolves to the configured logo so
	// stale references can never surface the default AoiTube icon.
	http.HandleFunc("/img/favicon/", controllers.GetLogo)
	http.HandleFunc("/manifest.json", controllers.GetWebManifest)

	// Images
	http.HandleFunc("/thumbnail.jpg", controllers.GetThumbnail)
	http.HandleFunc("/preview.gif", controllers.GetPreview)
	http.HandleFunc("/logo", controllers.GetLogo)
	http.HandleFunc("/offline-media", controllers.GetOfflineMedia)

	// Browser-playable preview of the currently-effective offline clip
	http.HandleFunc("/offline-clip", controllers.GetOfflineClipPreview)
	http.HandleFunc("/notification-thumbnail", controllers.GetNotificationThumbnail)

	// Custom Javascript
	http.HandleFunc("/customjavascript", controllers.ServeCustomJavascript)

	// Return a single emoji image.
	http.HandleFunc(config.EmojiDir, controllers.GetCustomEmojiImage)

	// return the logo

	// return a logo that's compatible with external social networks
	http.HandleFunc("/logo/external", controllers.GetCompatibleLogo)

	// status of the system
	http.HandleFunc("/api/status", controllers.GetStatus)

	// custom emoji supported in the chat
	http.HandleFunc("/api/emoji", controllers.GetCustomEmojiList)

	// chat rest api
	http.HandleFunc("/api/chat", middleware.RequireUserAccessToken(controllers.GetChatMessages))

	// public chat api for external tools (e.g. OneComme)
	http.HandleFunc("/api/chat/messages", controllers.GetPublicChatMessages)

	// web config api
	http.HandleFunc("/api/config", controllers.GetWebConfig)

	// return the YP protocol data
	http.HandleFunc("/api/yp", yp.GetYPResponse)

	// list of all social platforms
	http.HandleFunc("/api/socialplatforms", controllers.GetAllSocialPlatforms)

	// return the list of video variants available
	http.HandleFunc("/api/video/variants", controllers.GetVideoStreamOutputVariants)

	// tell the backend you're an active viewer
	http.HandleFunc("/api/ping", controllers.Ping)

	// register a new chat user
	http.HandleFunc("/api/chat/register", controllers.RegisterAnonymousChatUser)

	// Bouyomi-chan text-to-speech proxy
	http.HandleFunc("/api/integrations/bouyomi", controllers.BouyomiTalk)

	// return remote follow details
	http.HandleFunc("/api/remotefollow", controllers.RemoteFollow)

	// return followers
	http.HandleFunc("/api/followers", middleware.HandlePagination(controllers.GetFollowers))

	// save client video playback metrics
	http.HandleFunc("/api/metrics/playback", controllers.ReportPlaybackMetrics)

	// Register for notifications
	http.HandleFunc("/api/notifications/register", middleware.RequireUserAccessToken(controllers.RegisterForLiveNotifications))

	// Authenticated admin requests

	// Current inbound broadcaster
	http.HandleFunc("/api/admin/status", middleware.RequireAdminAuth(admin.Status))

	// Return HLS video
	http.HandleFunc("/hls/", controllers.HandleHLSRequest)

	// Disconnect inbound stream
	http.HandleFunc("/api/admin/disconnect", middleware.RequireAdminAuth(admin.DisconnectInboundConnection))

	// Server config
	http.HandleFunc("/api/admin/serverconfig", middleware.RequireAdminAuth(admin.GetServerConfig))

	// Get viewer count over time
	http.HandleFunc("/api/admin/viewersOverTime", middleware.RequireAdminAuth(admin.GetViewersOverTime))

	// Get active viewers
	http.HandleFunc("/api/admin/viewers", middleware.RequireAdminAuth(admin.GetActiveViewers))

	// Get hardware stats
	http.HandleFunc("/api/admin/hardwarestats", middleware.RequireAdminAuth(admin.GetHardwareStats))

	// Get a a detailed list of currently connected chat clients
	http.HandleFunc("/api/admin/chat/clients", middleware.RequireAdminAuth(admin.GetConnectedChatClients))

	// Get all logs
	http.HandleFunc("/api/admin/logs", middleware.RequireAdminAuth(admin.GetLogs))

	// Get warning/error logs
	http.HandleFunc("/api/admin/logs/warnings", middleware.RequireAdminAuth(admin.GetWarnings))

	// Get all chat messages for the admin, unfiltered.
	http.HandleFunc("/api/admin/chat/messages", middleware.RequireAdminAuth(admin.GetChatMessages))

	// Update chat message visibility
	http.HandleFunc("/api/admin/chat/messagevisibility", middleware.RequireAdminAuth(admin.UpdateMessageVisibility))

	// Enable/disable a user
	http.HandleFunc("/api/admin/chat/users/setenabled", middleware.RequireAdminAuth(admin.UpdateUserEnabled))

	// Ban/unban an IP address
	http.HandleFunc("/api/admin/chat/users/ipbans/create", middleware.RequireAdminAuth(admin.BanIPAddress))

	// Remove an IP address ban
	http.HandleFunc("/api/admin/chat/users/ipbans/remove", middleware.RequireAdminAuth(admin.UnBanIPAddress))

	// Return all the banned IP addresses
	http.HandleFunc("/api/admin/chat/users/ipbans", middleware.RequireAdminAuth(admin.GetIPAddressBans))

	// Get a list of disabled users
	http.HandleFunc("/api/admin/chat/users/disabled", middleware.RequireAdminAuth(admin.GetDisabledUsers))

	// Get all users
	http.HandleFunc("/api/admin/chat/users/all", middleware.RequireAdminAuth(admin.GetAllUsers))

	// Delete a user
	http.HandleFunc("/api/admin/chat/users/delete", middleware.RequireAdminAuth(admin.DeleteUser))

	// Authentication governance: audit log, manual recovery, account merge
	http.HandleFunc("/api/admin/chat/users/auth-events", middleware.RequireAdminAuth(admin.GetUserAuthEvents))
	http.HandleFunc("/api/admin/chat/users/auth/reactivate", middleware.RequireAdminAuth(admin.ReactivateUserAuth))
	http.HandleFunc("/api/admin/chat/users/merge", middleware.RequireAdminAuth(admin.MergeUsers))

	// Delete all users
	http.HandleFunc("/api/admin/chat/users/deleteall", middleware.RequireAdminAuth(admin.DeleteAllUsers))

	// Set moderator status for a user
	http.HandleFunc("/api/admin/chat/users/setmoderator", middleware.RequireAdminAuth(admin.UpdateUserModerator))

	// Get a list of moderator users
	http.HandleFunc("/api/admin/chat/users/moderators", middleware.RequireAdminAuth(admin.GetModerators))

	// return followers
	http.HandleFunc("/api/admin/followers", middleware.RequireAdminAuth(middleware.HandlePagination(controllers.GetFollowers)))

	// Get a list of pending follow requests
	http.HandleFunc("/api/admin/followers/pending", middleware.RequireAdminAuth(admin.GetPendingFollowRequests))

	// Get a list of rejected or blocked follows
	http.HandleFunc("/api/admin/followers/blocked", middleware.RequireAdminAuth(admin.GetBlockedAndRejectedFollowers))

	// Set the following state of a follower or follow request.
	http.HandleFunc("/api/admin/followers/approve", middleware.RequireAdminAuth(admin.ApproveFollower))

	// Upload custom emoji
	http.HandleFunc("/api/admin/emoji/upload", middleware.RequireAdminAuth(admin.UploadCustomEmoji))

	// Delete custom emoji
	http.HandleFunc("/api/admin/emoji/delete", middleware.RequireAdminAuth(admin.DeleteCustomEmoji))

	// Update config values

	// Change the current streaming key in memory
	http.HandleFunc("/api/admin/config/adminpass", middleware.RequireAdminAuth(admin.SetAdminPassword))

	//  Set an array of valid stream keys
	http.HandleFunc("/api/admin/config/streamkeys", middleware.RequireAdminAuth(admin.SetStreamKeys))

	// Change the extra page content in memory
	http.HandleFunc("/api/admin/config/pagecontent", middleware.RequireAdminAuth(admin.SetExtraPageContent))

	// Stream title
	http.HandleFunc("/api/admin/config/streamtitle", middleware.RequireAdminAuth(admin.SetStreamTitle))

	// Server name
	http.HandleFunc("/api/admin/config/name", middleware.RequireAdminAuth(admin.SetServerName))

	// Server summary
	http.HandleFunc("/api/admin/config/serversummary", middleware.RequireAdminAuth(admin.SetServerSummary))

	// Offline message
	http.HandleFunc("/api/admin/config/offlinemessage", middleware.RequireAdminAuth(admin.SetCustomOfflineMessage))

	// Offline clip (waiting screen video segment)
	http.HandleFunc("/api/admin/config/offlineclip", middleware.RequireAdminAuth(admin.SetOfflineClip))
	http.HandleFunc("/api/admin/config/offlineclip/reset", middleware.RequireAdminAuth(admin.ResetOfflineClip))

	// Offline media (waiting screen image/mp4 for UI)
	http.HandleFunc("/api/admin/config/offlinemedia", middleware.RequireAdminAuth(admin.SetOfflineMedia))
	http.HandleFunc("/api/admin/config/offlinemedia/reset", middleware.RequireAdminAuth(admin.ResetOfflineMedia))

	// Notification thumbnail (image for Discord/Twitter notifications)
	http.HandleFunc("/api/admin/config/notificationthumbnail", middleware.RequireAdminAuth(admin.SetNotificationThumbnail))
	http.HandleFunc("/api/admin/config/notificationthumbnail/reset", middleware.RequireAdminAuth(admin.ResetNotificationThumbnail))

	// Server welcome message
	http.HandleFunc("/api/admin/config/welcomemessage", middleware.RequireAdminAuth(admin.SetServerWelcomeMessage))

	// Disable chat
	http.HandleFunc("/api/admin/config/chat/disable", middleware.RequireAdminAuth(admin.SetChatDisabled))

	// Silent (test) stream mode: suppress external go-live notifications
	http.HandleFunc("/api/admin/config/silentstreammode", middleware.RequireAdminAuth(admin.SetSilentStreamMode))
	http.HandleFunc("/api/admin/config/recordingenabled", middleware.RequireAdminAuth(admin.SetRecordingEnabled))
	http.HandleFunc("/api/admin/config/recordingstores3", middleware.RequireAdminAuth(admin.SetRecordingStoreOnS3))
	http.HandleFunc("/api/admin/config/backupenabled", middleware.RequireAdminAuth(admin.SetBackupEnabled))
	http.HandleFunc("/api/admin/config/backupinterval", middleware.RequireAdminAuth(admin.SetBackupIntervalHours))
	http.HandleFunc("/api/admin/config/backupretention", middleware.RequireAdminAuth(admin.SetBackupRetentionCount))
	http.HandleFunc("/api/admin/config/backupstores3", middleware.RequireAdminAuth(admin.SetBackupStoreOnS3))
	http.HandleFunc("/api/admin/config/recordingretention", middleware.RequireAdminAuth(admin.SetRecordingRetention))

	// VOD recordings (archives)
	http.HandleFunc("/api/archives", controllers.GetArchives)
	// Replay event log — more specific prefix wins over the file server below.
	http.HandleFunc("/api/archives/events/", controllers.GetArchiveEvents)
	http.HandleFunc("/api/archives/", controllers.ServeArchive)
	http.HandleFunc("/api/admin/archives", middleware.RequireAdminAuth(controllers.GetAdminArchives))
	http.HandleFunc("/api/admin/archives/delete", middleware.RequireAdminAuth(controllers.DeleteArchive))
	http.HandleFunc("/api/admin/archives/visibility", middleware.RequireAdminAuth(controllers.SetArchiveVisibility))
	http.HandleFunc("/api/admin/archives/title", middleware.RequireAdminAuth(controllers.SetArchiveTitle))
	http.HandleFunc("/api/admin/archives/pricing", middleware.RequireAdminAuth(controllers.SetArchivePricing))
	// Purchase management: list buyers, manually grant access, revoke access.
	http.HandleFunc("/api/admin/archives/purchases", middleware.RequireAdminAuth(admin.GetArchivePurchases))
	http.HandleFunc("/api/admin/archives/purchases/grant", middleware.RequireAdminAuth(admin.GrantArchivePurchase))
	http.HandleFunc("/api/admin/archives/purchases/revoke", middleware.RequireAdminAuth(admin.RevokeArchivePurchase))

	// S3/R2 bucket usage breakdown and cleanup of dead objects.
	http.HandleFunc("/api/admin/storage/usage", middleware.RequireAdminAuth(admin.GetStorageUsage))
	http.HandleFunc("/api/admin/storage/cleanup", middleware.RequireAdminAuth(admin.CleanupStorage))

	// Latest Authelia one-time code from the local notification file, so the
	// admin login-settings UI can complete identity verification without email
	http.HandleFunc("/api/admin/authelia/onetimecode", middleware.RequireAdminAuth(admin.GetAutheliaOneTimeCode))

	// Disable chat user join messages
	http.HandleFunc("/api/admin/config/chat/joinmessagesenabled", middleware.RequireAdminAuth(admin.SetChatJoinMessagesEnabled))

	// Enable/disable chat established user mode
	http.HandleFunc("/api/admin/config/chat/establishedusermode", middleware.RequireAdminAuth(admin.SetEnableEstablishedChatUserMode))

	// Enable or disable chat spam protection
	http.HandleFunc("/api/admin/config/chat/spamprotectionenabled", middleware.RequireAdminAuth(admin.SetChatSpamProtectionEnabled))

	// Enable or disable the chat slur filter
	http.HandleFunc("/api/admin/config/chat/slurfilterenabled", middleware.RequireAdminAuth(admin.SetChatSlurFilterEnabled))

	// Enable/disable Twitter auth requirement
	http.HandleFunc("/api/admin/config/chat/requiretwitterauth", middleware.RequireAdminAuth(admin.SetRequireTwitterAuth))

	// Set chat usernames that are not allowed
	http.HandleFunc("/api/admin/config/chat/forbiddenusernames", middleware.RequireAdminAuth(admin.SetForbiddenUsernameList))

	// Set the suggested chat usernames that will be assigned automatically
	http.HandleFunc("/api/admin/config/chat/suggestedusernames", middleware.RequireAdminAuth(admin.SetSuggestedUsernameList))

	// Set video codec
	http.HandleFunc("/api/admin/config/video/codec", middleware.RequireAdminAuth(admin.SetVideoCodec))

	// Set style/color/css values
	http.HandleFunc("/api/admin/config/appearance", middleware.RequireAdminAuth(admin.SetCustomColorVariableValues))

	// Return all webhooks
	http.HandleFunc("/api/admin/webhooks", middleware.RequireAdminAuth(admin.GetWebhooks))

	// Delete a single webhook
	http.HandleFunc("/api/admin/webhooks/delete", middleware.RequireAdminAuth(admin.DeleteWebhook))

	// Create a single webhook
	http.HandleFunc("/api/admin/webhooks/create", middleware.RequireAdminAuth(admin.CreateWebhook))

	// Donation management
	http.HandleFunc("/api/admin/donations", middleware.RequireAdminAuth(admin.GetDonations))
	http.HandleFunc("/api/admin/donations/summary", middleware.RequireAdminAuth(admin.GetDonationSummary))
	http.HandleFunc("/api/admin/donations/stats", middleware.RequireAdminAuth(admin.GetDonationStats))
	http.HandleFunc("/api/admin/donations/create", middleware.RequireAdminAuth(admin.CreateDonation))
	http.HandleFunc("/api/admin/donations/visibility", middleware.RequireAdminAuth(admin.UpdateDonationVisibility))
	http.HandleFunc("/api/admin/donations/delete", middleware.RequireAdminAuth(admin.DeleteDonation))

	// Get all access tokens
	http.HandleFunc("/api/admin/accesstokens", middleware.RequireAdminAuth(admin.GetExternalAPIUsers))

	// Delete a single access token
	http.HandleFunc("/api/admin/accesstokens/delete", middleware.RequireAdminAuth(admin.DeleteExternalAPIUser))

	// Create a single access token
	http.HandleFunc("/api/admin/accesstokens/create", middleware.RequireAdminAuth(admin.CreateExternalAPIUser))

	// Return the auto-update features that are supported for this instance.
	http.HandleFunc("/api/admin/update/options", middleware.RequireAdminAuth(admin.AutoUpdateOptions))

	// Begin the auto update
	http.HandleFunc("/api/admin/update/start", middleware.RequireAdminAuth(admin.AutoUpdateStart))

	// Force quit the service to restart it
	http.HandleFunc("/api/admin/update/forcequit", middleware.RequireAdminAuth(admin.AutoUpdateForceQuit))

	// Send a system message to chat
	http.HandleFunc("/api/integrations/chat/system", middleware.RequireExternalAPIAccessToken(user.ScopeCanSendSystemMessages, admin.SendSystemMessage))

	// Send a system message to a single client
	http.HandleFunc(utils.RestEndpoint("/api/integrations/chat/system/client/{clientId}", middleware.RequireExternalAPIAccessToken(user.ScopeCanSendSystemMessages, admin.SendSystemMessageToConnectedClient)))

	// Send a user message to chat *NO LONGER SUPPORTED
	http.HandleFunc("/api/integrations/chat/user", middleware.RequireExternalAPIAccessToken(user.ScopeCanSendChatMessages, admin.SendUserMessage))

	// Send a message to chat as a specific 3rd party bot/integration based on its access token
	http.HandleFunc("/api/integrations/chat/send", middleware.RequireExternalAPIAccessToken(user.ScopeCanSendChatMessages, admin.SendIntegrationChatMessage))

	// Send a user action to chat
	http.HandleFunc("/api/integrations/chat/action", middleware.RequireExternalAPIAccessToken(user.ScopeCanSendSystemMessages, admin.SendChatAction))

	// Hide chat message
	http.HandleFunc("/api/integrations/chat/messagevisibility", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, admin.ExternalUpdateMessageVisibility))

	// Stream title
	http.HandleFunc("/api/integrations/streamtitle", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, admin.ExternalSetStreamTitle))

	// Get chat history
	http.HandleFunc("/api/integrations/chat", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, controllers.ExternalGetChatMessages))

	// Connected clients
	http.HandleFunc("/api/integrations/clients", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, admin.ExternalGetConnectedChatClients))

	// Server status for external integrations
	http.HandleFunc("/api/integrations/status", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, admin.ExternalGetStatus))

	// Moderation user details for external integrations (e.g. moderation bots)
	http.HandleFunc("/api/integrations/moderation/chat/user/", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, moderation.ExternalGetUserDetails))

	// Create donation via external API (for payment webhooks)
	http.HandleFunc("/api/integrations/donations/create", middleware.RequireExternalAPIAccessToken(user.ScopeHasAdminAccess, admin.CreateDonationExternal))

	// Get recent donations (public)
	http.HandleFunc("/api/donations/recent", admin.GetRecentDonations)
	// A viewer's own purchase history, resolved from their access token.
	http.HandleFunc("/api/donations/mine", controllers.GetMyPurchases)
	// Public supporter ranking (top spenders by Super Chat + effect total).
	http.HandleFunc("/api/supporters", controllers.GetTopSupporters)

	// Base currency (crypto conversion / reporting reference currency)
	http.HandleFunc("/api/admin/config/basecurrency", middleware.RequireAdminAuth(admin.GetBaseCurrency))
	http.HandleFunc("/api/admin/config/basecurrency/set", middleware.RequireAdminAuth(admin.SetBaseCurrency))

	// PayPay integration
	http.HandleFunc("/api/admin/config/paypay", middleware.RequireAdminAuth(admin.GetPayPayConfig))
	http.HandleFunc("/api/admin/config/paypay/set", middleware.RequireAdminAuth(admin.SetPayPayConfig))

	// PayPay public endpoints
	http.HandleFunc("/api/paypay/status", controllers.GetPayPayStatus)
	http.HandleFunc("/api/paypay/create", controllers.PayPayCreatePayment)
	http.HandleFunc("/api/paypay/webhook", controllers.PayPayWebhook)
	http.HandleFunc("/donation/paypay/complete", controllers.PayPayCompletePayment)

	// Tokushoho (Act on Specified Commercial Transactions disclosure)
	http.HandleFunc("/api/admin/config/tokushoho", middleware.RequireAdminAuth(admin.GetTokushohoInfo))
	http.HandleFunc("/api/admin/config/tokushoho/set", middleware.RequireAdminAuth(admin.SetTokushohoInfo))
	http.HandleFunc("/api/tokushoho", controllers.GetTokushohoPublic)

	// FAQ (frequently asked questions)
	http.HandleFunc("/api/admin/config/faq", middleware.RequireAdminAuth(admin.GetFAQConfig))
	http.HandleFunc("/api/admin/config/faq/set", middleware.RequireAdminAuth(admin.SetFAQConfig))
	http.HandleFunc("/api/faq", controllers.GetFAQPublic)

	// Metamask integration
	http.HandleFunc("/api/admin/config/metamask", middleware.RequireAdminAuth(admin.GetMetamaskConfig))
	http.HandleFunc("/api/admin/config/metamask/set", middleware.RequireAdminAuth(admin.SetMetamaskConfig))

	// Metamask public endpoints
	http.HandleFunc("/api/metamask/status", controllers.GetMetamaskStatus)
	http.HandleFunc("/api/metamask/confirm", controllers.MetamaskConfirmDonation)

	// Doneru integration
	http.HandleFunc("/api/admin/config/doneru", middleware.RequireAdminAuth(admin.GetDoneruConfig))
	http.HandleFunc("/api/admin/config/doneru/set", middleware.RequireAdminAuth(admin.SetDoneruConfig))

	// Doneru public endpoints
	http.HandleFunc("/api/doneru/status", controllers.GetDoneruStatus)

	// Ko-fi integration
	http.HandleFunc("/api/admin/config/kofi", middleware.RequireAdminAuth(admin.GetKofiConfig))
	http.HandleFunc("/api/admin/config/kofi/set", middleware.RequireAdminAuth(admin.SetKofiConfig))

	// Ko-fi public endpoints
	http.HandleFunc("/api/kofi/status", controllers.GetKofiStatus)
	http.HandleFunc("/api/kofi/webhook", controllers.KofiWebhook)

	// Aggregated payments endpoints (avoid provider names in URL path)
	http.HandleFunc("/api/payments/status", controllers.GetPaymentsStatus)
	http.HandleFunc("/api/payments/create", controllers.CreatePayment)

	// PayPal integration
	http.HandleFunc("/api/admin/config/paypal", middleware.RequireAdminAuth(admin.GetPayPalConfig))
	http.HandleFunc("/api/admin/config/paypal/set", middleware.RequireAdminAuth(admin.SetPayPalConfig))

	// PayPal public endpoints
	http.HandleFunc("/api/paypal/status", controllers.GetPayPalStatus)
	http.HandleFunc("/api/paypal/create", controllers.PayPalCreatePayment)
	http.HandleFunc("/api/paypal/webhook", controllers.PayPalWebhook)
	http.HandleFunc("/donation/paypal/complete", controllers.PayPalCompletePayment)
	http.HandleFunc("/donation/paypal/cancel", controllers.PayPalCancelPayment)

	// Stripe integration
	http.HandleFunc("/api/admin/config/stripe", middleware.RequireAdminAuth(admin.GetStripeConfig))
	http.HandleFunc("/api/admin/config/stripe/set", middleware.RequireAdminAuth(admin.SetStripeConfig))

	// Stripe public endpoints
	http.HandleFunc("/api/stripe/status", controllers.GetStripeStatus)
	http.HandleFunc("/api/stripe/create", controllers.StripeCreatePayment)
	http.HandleFunc("/api/stripe/webhook", controllers.StripeWebhook)
	http.HandleFunc("/donation/stripe/complete", controllers.StripeCompletePayment)
	http.HandleFunc("/donation/stripe/cancel", controllers.StripeCancelPayment)

	// Crypto price endpoints
	http.HandleFunc("/api/crypto/price", controllers.GetCryptoPrice)
	http.HandleFunc("/api/crypto/prices", controllers.GetMultipleCryptoPrices)

	// Logo path
	http.HandleFunc("/api/admin/config/logo", middleware.RequireAdminAuth(admin.SetLogo))

	// Live poster: shown while live before the first thumbnail is generated.
	http.HandleFunc("/api/admin/config/liveposter", middleware.RequireAdminAuth(admin.SetLivePoster))
	http.HandleFunc("/liveposter", controllers.GetLivePosterImage)

	// Server tags
	http.HandleFunc("/api/admin/config/tags", middleware.RequireAdminAuth(admin.SetTags))

	// ffmpeg
	http.HandleFunc("/api/admin/config/ffmpegpath", middleware.RequireAdminAuth(admin.SetFfmpegPath))

	// Server http port
	http.HandleFunc("/api/admin/config/webserverport", middleware.RequireAdminAuth(admin.SetWebServerPort))

	// Server http listen address
	http.HandleFunc("/api/admin/config/webserverip", middleware.RequireAdminAuth(admin.SetWebServerIP))

	// Server rtmp port
	http.HandleFunc("/api/admin/config/rtmpserverport", middleware.RequireAdminAuth(admin.SetRTMPServerPort))

	// RTMPS settings
	http.HandleFunc("/api/admin/config/rtmps/enabled", middleware.RequireAdminAuth(admin.SetRTMPSEnabled))
	http.HandleFunc("/api/admin/config/rtmps/port", middleware.RequireAdminAuth(admin.SetRTMPSServerPort))
	http.HandleFunc("/api/admin/config/rtmps/certpath", middleware.RequireAdminAuth(admin.SetRTMPSCertPath))
	http.HandleFunc("/api/admin/config/rtmps/keypath", middleware.RequireAdminAuth(admin.SetRTMPSKeyPath))

	// Websocket host override
	http.HandleFunc("/api/admin/config/sockethostoverride", middleware.RequireAdminAuth(admin.SetSocketHostOverride))

	// Is server marked as NSFW
	http.HandleFunc("/api/admin/config/nsfw", middleware.RequireAdminAuth(admin.SetNSFW))

	// directory enabled
	http.HandleFunc("/api/admin/config/directoryenabled", middleware.RequireAdminAuth(admin.SetDirectoryEnabled))

	// social handles
	http.HandleFunc("/api/admin/config/socialhandles", middleware.RequireAdminAuth(admin.SetSocialHandles))

	// set the number of video segments and duration per segment in a playlist
	http.HandleFunc("/api/admin/config/video/streamlatencylevel", middleware.RequireAdminAuth(admin.SetStreamLatencyLevel))

	// set an array of video output configurations
	http.HandleFunc("/api/admin/config/video/streamoutputvariants", middleware.RequireAdminAuth(admin.SetStreamOutputVariants))

	// set s3 configuration
	http.HandleFunc("/api/admin/config/s3", middleware.RequireAdminAuth(admin.SetS3Configuration))

	// set server url
	http.HandleFunc("/api/admin/config/serverurl", middleware.RequireAdminAuth(admin.SetServerURL))

	// reset the YP registration
	http.HandleFunc("/api/admin/yp/reset", middleware.RequireAdminAuth(admin.ResetYPRegistration))

	// set external action links
	http.HandleFunc("/api/admin/config/externalactions", middleware.RequireAdminAuth(admin.SetExternalActions))

	// set custom style css
	http.HandleFunc("/api/admin/config/customstyles", middleware.RequireAdminAuth(admin.SetCustomStyles))

	// set custom style javascript
	http.HandleFunc("/api/admin/config/customjavascript", middleware.RequireAdminAuth(admin.SetCustomJavascript))

	// Video playback metrics
	http.HandleFunc("/api/admin/metrics/video", middleware.RequireAdminAuth(admin.GetVideoPlaybackMetrics))

	// Is the viewer count hidden from viewers
	http.HandleFunc("/api/admin/config/hideviewercount", middleware.RequireAdminAuth(admin.SetHideViewerCount))

	// Inline chat moderation actions

	// Update chat message visibility
	http.HandleFunc("/api/chat/messagevisibility", middleware.RequireUserModerationScopeAccesstoken(admin.UpdateMessageVisibility))

	// Enable/disable a user
	http.HandleFunc("/api/chat/users/setenabled", middleware.RequireUserModerationScopeAccesstoken(admin.UpdateUserEnabled))

	// Get a user's details
	http.HandleFunc("/api/moderation/chat/user/", middleware.RequireUserModerationScopeAccesstoken(moderation.GetUserDetails))

	// Configure Federation features

	// enable/disable federation features
	http.HandleFunc("/api/admin/config/federation/enable", middleware.RequireAdminAuth(admin.SetFederationEnabled))

	// set if federation activities are private
	http.HandleFunc("/api/admin/config/federation/private", middleware.RequireAdminAuth(admin.SetFederationActivityPrivate))

	// set if fediverse engagement appears in chat
	http.HandleFunc("/api/admin/config/federation/showengagement", middleware.RequireAdminAuth(admin.SetFederationShowEngagement))

	// set local federated username
	http.HandleFunc("/api/admin/config/federation/username", middleware.RequireAdminAuth(admin.SetFederationUsername))

	// set federated go live message
	http.HandleFunc("/api/admin/config/federation/livemessage", middleware.RequireAdminAuth(admin.SetFederationGoLiveMessage))

	// Federation blocked domains
	http.HandleFunc("/api/admin/config/federation/blockdomains", middleware.RequireAdminAuth(admin.SetFederationBlockDomains))

	// send a public message to the Fediverse from the server's user
	http.HandleFunc("/api/admin/federation/send", middleware.RequireAdminAuth(admin.SendFederatedMessage))

	// Return federated activities
	http.HandleFunc("/api/admin/federation/actions", middleware.RequireAdminAuth(middleware.HandlePagination(admin.GetFederatedActions)))

	// Prometheus metrics
	http.Handle("/api/admin/prometheus", middleware.RequireAdminAuth(func(rw http.ResponseWriter, r *http.Request) {
		promhttp.Handler().ServeHTTP(rw, r)
	}))

	// Configure outbound notification channels.
	http.HandleFunc("/api/admin/config/notifications/discord", middleware.RequireAdminAuth(admin.SetDiscordNotificationConfiguration))
	http.HandleFunc("/api/admin/config/notifications/browser", middleware.RequireAdminAuth(admin.SetBrowserNotificationConfiguration))
	http.HandleFunc("/api/admin/config/notifications/twitter", middleware.RequireAdminAuth(admin.SetTwitterNotificationConfiguration))

	// Discord auth configuration
	http.HandleFunc("/api/admin/config/discordauth", middleware.RequireAdminAuth(admin.SetDiscordAuthConfiguration))

	// X auth configuration
	http.HandleFunc("/api/admin/config/xauth", middleware.RequireAdminAuth(admin.SetXAuthConfiguration))

	// Google auth configuration
	http.HandleFunc("/api/admin/config/googleauth", middleware.RequireAdminAuth(admin.SetGoogleAuthConfiguration))

	// GitHub auth configuration
	http.HandleFunc("/api/admin/config/githubauth", middleware.RequireAdminAuth(admin.SetGitHubAuthConfiguration))

	// WebRTC / LL-HLS Streaming Protocol Configuration
	http.HandleFunc("/api/admin/config/streamprotocol", middleware.RequireAdminAuth(admin.GetStreamProtocolConfig))
	http.HandleFunc("/api/admin/config/streamprotocol/set", middleware.RequireAdminAuth(admin.SetStreamProtocolConfig))
	http.HandleFunc("/api/admin/config/llhls/latencylevel", middleware.RequireAdminAuth(admin.SetLLHLSLatencyLevel))
	http.HandleFunc("/api/admin/config/llhls/latencylevels", middleware.RequireAdminAuth(admin.GetLLHLSLatencyLevels))
	http.HandleFunc("/api/admin/webrtc/stats", middleware.RequireAdminAuth(admin.GetWebRTCStats))
	http.HandleFunc("/api/admin/webrtc/disconnect", middleware.RequireAdminAuth(admin.DisconnectWebRTCViewer))
	http.HandleFunc("/api/admin/webrtc/disconnectall", middleware.RequireAdminAuth(admin.DisconnectAllWebRTCViewers))

	// WebRTC public endpoints
	http.HandleFunc("/api/webrtc/offer", controllers.HandleWebRTCOffer)
	http.HandleFunc("/api/webrtc/ice", controllers.HandleWebRTCICECandidate)
	http.HandleFunc("/api/webrtc/disconnect", controllers.HandleWebRTCDisconnect)
	http.HandleFunc("/api/webrtc/config", controllers.GetWebRTCConfig)

	// Auth

	// Start auth flow
	http.HandleFunc("/api/auth/indieauth", middleware.RequireUserAccessToken(indieauth.StartAuthFlow))
	http.HandleFunc("/api/auth/indieauth/callback", indieauth.HandleRedirect)
	http.HandleFunc("/api/auth/provider/indieauth", indieauth.HandleAuthEndpoint)

	http.HandleFunc("/api/auth/fediverse", middleware.RequireUserAccessToken(fediverseauth.RegisterFediverseOTPRequest))
	http.HandleFunc("/api/auth/fediverse/verify", fediverseauth.VerifyFediverseOTPRequest)

	// Discord auth
	http.HandleFunc("/api/auth/discord", middleware.RequireUserAccessToken(discordauth.StartAuthFlow))
	http.HandleFunc("/api/auth/discord/callback", discordauth.HandleRedirect)

	// X auth (OAuth 2.0)
	http.HandleFunc("/api/auth/x", middleware.RequireUserAccessToken(xauth.StartAuthFlow))
	http.HandleFunc("/api/auth/x/callback", xauth.HandleRedirect)

	// Google auth
	http.HandleFunc("/api/auth/google", middleware.RequireUserAccessToken(googleauth.StartAuthFlow))
	http.HandleFunc("/api/auth/google/callback", googleauth.HandleRedirect)

	// GitHub auth
	http.HandleFunc("/api/auth/github", middleware.RequireUserAccessToken(githubauth.StartAuthFlow))
	http.HandleFunc("/api/auth/github/callback", githubauth.HandleRedirect)

	// Unlink a linked social account from the requesting user
	http.HandleFunc("/api/auth/unlink", middleware.RequireUserAccessToken(controllers.UnlinkAuth))

	// ActivityPub has its own router
	activitypub.Start(data.GetDatastore())

	// websocket
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		chat.HandleClientConnection(w, r)
	})

	// Optional public static files
	http.Handle("/public/", http.StripPrefix("/public/", http.FileServer(http.Dir(config.PublicFilesPath))))

	port := config.WebServerPort
	ip := config.WebServerIP

	h2s := &http2.Server{}

	// Create a custom mux handler to intercept the /debug/vars endpoint.
	// This is a hack because Prometheus enables this endpoint by default
	// due to its use of expvar and we do not want this exposed.
	defaultMux := h2c.NewHandler(http.DefaultServeMux, h2s)
	m := http.NewServeMux()

	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/debug/vars" {
			w.WriteHeader(http.StatusNotFound)
			return
		} else if r.URL.Path == "/embed/chat/" || r.URL.Path == "/embed/chat" {
			// Redirect /embed/chat
			http.Redirect(w, r, "/embed/chat/readonly", http.StatusTemporaryRedirect)
		} else {
			defaultMux.ServeHTTP(w, r)
		}
	})

	compress, _ := httpcompression.DefaultAdapter() // Use the default configuration
	server := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", ip, port),
		ReadHeaderTimeout: 4 * time.Second,
		Handler:           compress(m),
	}

	log.Infof("Web server is listening on IP %s port %d.", ip, port)
	log.Infoln("The web admin interface is available at /admin.")

	return server.ListenAndServe()
}
