package data

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
	"github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
)

const (
	extraContentKey                      = "extra_page_content"
	streamTitleKey                       = "stream_title"
	adminPasswordKey                     = "admin_password_key"
	logoPathKey                          = "logo_path"
	logoUniquenessKey                    = "logo_uniqueness"
	offlineMediaPathKey                  = "offline_media_path"
	offlineMediaTypeKey                  = "offline_media_type"
	offlineMediaUniquenessKey            = "offline_media_uniqueness"
	notificationThumbnailPathKey         = "notification_thumbnail_path"
	notificationThumbnailUniquenessKey   = "notification_thumbnail_uniqueness"
	serverSummaryKey                     = "server_summary"
	serverWelcomeMessageKey              = "server_welcome_message"
	serverNameKey                        = "server_name"
	serverURLKey                         = "server_url"
	httpPortNumberKey                    = "http_port_number"
	httpListenAddressKey                 = "http_listen_address"
	websocketHostOverrideKey             = "websocket_host_override"
	rtmpPortNumberKey                    = "rtmp_port_number"
	rtmpsPortNumberKey                   = "rtmps_port_number"
	rtmpsEnabledKey                      = "rtmps_enabled"
	rtmpsCertPathKey                     = "rtmps_cert_path"
	rtmpsKeyPathKey                      = "rtmps_key_path"
	serverMetadataTagsKey                = "server_metadata_tags"
	directoryEnabledKey                  = "directory_enabled"
	directoryRegistrationKeyKey          = "directory_registration_key"
	socialHandlesKey                     = "social_handles"
	peakViewersSessionKey                = "peak_viewers_session"
	peakViewersOverallKey                = "peak_viewers_overall"
	lastDisconnectTimeKey                = "last_disconnect_time"
	ffmpegPathKey                        = "ffmpeg_path"
	nsfwKey                              = "nsfw"
	s3StorageConfigKey                   = "s3_storage_config"
	videoLatencyLevel                    = "video_latency_level"
	videoStreamOutputVariantsKey         = "video_stream_output_variants"
	chatDisabledKey                      = "chat_disabled"
	silentStreamModeKey                  = "silent_stream_mode"
	externalActionsKey                   = "external_actions"
	customStylesKey                      = "custom_styles"
	customJavascriptKey                  = "custom_javascript"
	videoCodecKey                        = "video_codec"
	blockedUsernamesKey                  = "blocked_usernames"
	publicKeyKey                         = "public_key"
	privateKeyKey                        = "private_key"
	serverInitDateKey                    = "server_init_date"
	federationEnabledKey                 = "federation_enabled"
	federationUsernameKey                = "federation_username"
	federationPrivateKey                 = "federation_private"
	federationGoLiveMessageKey           = "federation_go_live_message"
	federationShowEngagementKey          = "federation_show_engagement"
	federationBlockedDomainsKey          = "federation_blocked_domains"
	suggestedUsernamesKey                = "suggested_usernames"
	chatJoinMessagesEnabledKey           = "chat_join_messages_enabled"
	chatEstablishedUsersOnlyModeKey      = "chat_established_users_only_mode"
	chatSpamProtectionEnabledKey         = "chat_spam_protection_enabled"
	chatSlurFilterEnabledKey             = "chat_slur_filter_enabled"
	recordingEnabledKey                  = "recording_enabled"
	recordingRetentionKey                = "recording_retention_count"
	recordingStoreOnS3Key                = "recording_store_on_s3"
	backupEnabledKey                     = "backup_enabled"
	backupIntervalHoursKey               = "backup_interval_hours"
	backupRetentionCountKey              = "backup_retention_count"
	backupStoreOnS3Key                   = "backup_store_on_s3"
	notificationsEnabledKey              = "notifications_enabled"
	discordConfigurationKey              = "discord_configuration"
	discordAuthConfigurationKey          = "discord_auth_configuration"
	xAuthConfigurationKey                = "x_auth_configuration"
	googleAuthConfigurationKey           = "google_auth_configuration"
	githubAuthConfigurationKey           = "github_auth_configuration"
	livePosterPathKey                    = "live_poster_path"
	recordingHighestOnlyKey              = "recording_highest_only"
	browserPushConfigurationKey          = "browser_push_configuration"
	browserPushPublicKeyKey              = "browser_push_public_key"
	browserPushPrivateKeyKey             = "browser_push_private_key"
	hasConfiguredInitialNotificationsKey = "has_configured_initial_notifications"
	hideViewerCountKey                   = "hide_viewer_count"
	customOfflineMessageKey              = "custom_offline_message"
	customColorVariableValuesKey         = "custom_color_variable_values"
	streamKeysKey                        = "stream_keys"
	twitterConfigurationKey              = "twitter_configuration"
	requireTwitterAuthKey                = "require_twitter_auth"
)

// GetExtraPageBodyContent will return the user-supplied body content.
func GetExtraPageBodyContent() string {
	content, err := _datastore.GetString(extraContentKey)
	if err != nil {
		log.Traceln(extraContentKey, err)
		return config.GetDefaults().PageBodyContent
	}

	return content
}

// SetExtraPageBodyContent will set the user-supplied body content.
func SetExtraPageBodyContent(content string) error {
	return _datastore.SetString(extraContentKey, content)
}

// GetStreamTitle will return the name of the current stream.
func GetStreamTitle() string {
	title, err := _datastore.GetString(streamTitleKey)
	if err != nil {
		return ""
	}

	return title
}

// SetStreamTitle will set the name of the current stream.
func SetStreamTitle(title string) error {
	return _datastore.SetString(streamTitleKey, title)
}

// GetAdminPassword will return the hashed admin password.
func GetAdminPassword() string {
	key, _ := _datastore.GetString(adminPasswordKey)
	return key
}

// SetAdminPassword will hash and set the admin password using bcrypt.
func SetAdminPassword(key string) error {
	// If already hashed (starts with $2a$ or $2b$), store as-is (migration case)
	if strings.HasPrefix(key, "$2a$") || strings.HasPrefix(key, "$2b$") {
		return _datastore.SetString(adminPasswordKey, key)
	}
	// Hash with bcrypt; passwords over 72 bytes are pre-compressed so they
	// don't error out (upstream #4331).
	hashedPassword, err := utils.HashPassword(key)
	if err != nil {
		return errors.Wrap(err, "failed to hash admin password")
	}
	return _datastore.SetString(adminPasswordKey, hashedPassword)
}

// VerifyAdminPassword checks if the provided password matches the stored hash.
func VerifyAdminPassword(password string) bool {
	storedHash := GetAdminPassword()
	if storedHash == "" {
		return false
	}
	// Check if password is hashed (bcrypt hash starts with $2a$ or $2b$)
	if strings.HasPrefix(storedHash, "$2a$") || strings.HasPrefix(storedHash, "$2b$") {
		return utils.CompareHash(storedHash, password) == nil
	}
	// Legacy: plain text comparison (for backwards compatibility during migration)
	// This should be removed after migration period
	return storedHash == password
}

// GetLogoPath will return the path for the logo, relative to webroot.
func GetLogoPath() string {
	logo, err := _datastore.GetString(logoPathKey)
	if err != nil {
		log.Traceln(logoPathKey, err)
		return config.GetDefaults().Logo
	}

	if logo == "" {
		return config.GetDefaults().Logo
	}

	return logo
}

// SetLogoPath will set the path for the logo, relative to webroot.
func SetLogoPath(logo string) error {
	return _datastore.SetString(logoPathKey, logo)
}

// SetLogoUniquenessString will set the logo cache busting string.
func SetLogoUniquenessString(uniqueness string) error {
	return _datastore.SetString(logoUniquenessKey, uniqueness)
}

// GetOfflineMediaPath will return the configured offline media filename within the data directory.
func GetOfflineMediaPath() string {
	path, err := _datastore.GetString(offlineMediaPathKey)
	if err != nil {
		log.Traceln(offlineMediaPathKey, err)
		return ""
	}
	return path
}

// SetOfflineMediaPath will set the offline media filename within the data directory.
func SetOfflineMediaPath(path string) error {
	return _datastore.SetString(offlineMediaPathKey, path)
}

// GetOfflineMediaType will return the configured offline media type ("image" or "video").
func GetOfflineMediaType() string {
	typeValue, err := _datastore.GetString(offlineMediaTypeKey)
	if err != nil {
		log.Traceln(offlineMediaTypeKey, err)
		return ""
	}
	return typeValue
}

// SetOfflineMediaType will set the offline media type ("image" or "video").
func SetOfflineMediaType(typeValue string) error {
	return _datastore.SetString(offlineMediaTypeKey, typeValue)
}

// SetOfflineMediaUniquenessString will set the offline media cache busting string.
func SetOfflineMediaUniquenessString(uniqueness string) error {
	return _datastore.SetString(offlineMediaUniquenessKey, uniqueness)
}

// GetOfflineMediaUniquenessString will return the offline media cache busting string.
func GetOfflineMediaUniquenessString() string {
	uniqueness, err := _datastore.GetString(offlineMediaUniquenessKey)
	if err != nil {
		log.Traceln(offlineMediaUniquenessKey, err)
		return ""
	}
	return uniqueness
}

// GetNotificationThumbnailPath will return the configured notification thumbnail filename within the data directory.
func GetNotificationThumbnailPath() string {
	path, err := _datastore.GetString(notificationThumbnailPathKey)
	if err != nil {
		log.Traceln(notificationThumbnailPathKey, err)
		return ""
	}
	return path
}

// SetNotificationThumbnailPath will set the notification thumbnail filename within the data directory.
func SetNotificationThumbnailPath(path string) error {
	return _datastore.SetString(notificationThumbnailPathKey, path)
}

// GetNotificationThumbnailUniquenessString will return the notification thumbnail cache busting string.
func GetNotificationThumbnailUniquenessString() string {
	uniqueness, err := _datastore.GetString(notificationThumbnailUniquenessKey)
	if err != nil {
		log.Traceln(notificationThumbnailUniquenessKey, err)
		return ""
	}
	return uniqueness
}

// SetNotificationThumbnailUniquenessString will set the notification thumbnail cache busting string.
func SetNotificationThumbnailUniquenessString(uniqueness string) error {
	return _datastore.SetString(notificationThumbnailUniquenessKey, uniqueness)
}

// GetLogoUniquenessString will return the logo cache busting string.
func GetLogoUniquenessString() string {
	uniqueness, err := _datastore.GetString(logoUniquenessKey)
	if err != nil {
		log.Traceln(logoUniquenessKey, err)
		return ""
	}

	return uniqueness
}

// GetServerSummary will return the server summary text.
func GetServerSummary() string {
	summary, err := _datastore.GetString(serverSummaryKey)
	if err != nil {
		log.Traceln(serverSummaryKey, err)
		return ""
	}

	return summary
}

// SetServerSummary will set the server summary text.
func SetServerSummary(summary string) error {
	return _datastore.SetString(serverSummaryKey, summary)
}

const streamScheduleKey = "stream_schedule"

// GetStreamSchedule returns the operator's free-text next-stream schedule note
// (e.g. "次回配信: 7/15 21:00〜"), shown to viewers on the offline screen.
func GetStreamSchedule() string {
	schedule, err := _datastore.GetString(streamScheduleKey)
	if err != nil {
		log.Traceln(streamScheduleKey, err)
		return ""
	}
	return schedule
}

// SetStreamSchedule sets the next-stream schedule note.
func SetStreamSchedule(schedule string) error {
	return _datastore.SetString(streamScheduleKey, schedule)
}

// GetServerWelcomeMessage will return the server welcome message text.
func GetServerWelcomeMessage() string {
	welcomeMessage, err := _datastore.GetString(serverWelcomeMessageKey)
	if err != nil {
		log.Traceln(serverWelcomeMessageKey, err)
		return config.GetDefaults().ServerWelcomeMessage
	}

	return welcomeMessage
}

// SetServerWelcomeMessage will set the server welcome message text.
func SetServerWelcomeMessage(welcomeMessage string) error {
	return _datastore.SetString(serverWelcomeMessageKey, welcomeMessage)
}

// GetServerName will return the server name text.
func GetServerName() string {
	name, err := _datastore.GetString(serverNameKey)
	if err != nil {
		log.Traceln(serverNameKey, err)
		return config.GetDefaults().Name
	}

	return name
}

// SetServerName will set the server name text.
func SetServerName(name string) error {
	return _datastore.SetString(serverNameKey, name)
}

// GetServerURL will return the server URL.
func GetServerURL() string {
	url, err := _datastore.GetString(serverURLKey)
	if err != nil {
		return ""
	}

	return url
}

// SetServerURL will set the server URL.
func SetServerURL(url string) error {
	return _datastore.SetString(serverURLKey, url)
}

// GetHTTPPortNumber will return the server HTTP port.
func GetHTTPPortNumber() int {
	port, err := _datastore.GetNumber(httpPortNumberKey)
	if err != nil {
		log.Traceln(httpPortNumberKey, err)
		return config.GetDefaults().WebServerPort
	}

	if port == 0 {
		return config.GetDefaults().WebServerPort
	}
	return int(port)
}

// SetWebsocketOverrideHost will set the host override for websockets.
func SetWebsocketOverrideHost(host string) error {
	return _datastore.SetString(websocketHostOverrideKey, host)
}

// GetWebsocketOverrideHost will return the host override for websockets.
func GetWebsocketOverrideHost() string {
	host, _ := _datastore.GetString(websocketHostOverrideKey)

	return host
}

// SetHTTPPortNumber will set the server HTTP port.
func SetHTTPPortNumber(port float64) error {
	return _datastore.SetNumber(httpPortNumberKey, port)
}

// GetHTTPListenAddress will return the HTTP listen address.
func GetHTTPListenAddress() string {
	address, err := _datastore.GetString(httpListenAddressKey)
	if err != nil {
		log.Traceln(httpListenAddressKey, err)
		return config.GetDefaults().WebServerIP
	}
	return address
}

// SetHTTPListenAddress will set the server HTTP listen address.
func SetHTTPListenAddress(address string) error {
	return _datastore.SetString(httpListenAddressKey, address)
}

// GetRTMPPortNumber will return the server RTMP port.
func GetRTMPPortNumber() int {
	port, err := _datastore.GetNumber(rtmpPortNumberKey)
	if err != nil {
		log.Traceln(rtmpPortNumberKey, err)
		return config.GetDefaults().RTMPServerPort
	}

	if port == 0 {
		return config.GetDefaults().RTMPServerPort
	}

	return int(port)
}

// SetRTMPPortNumber will set the server RTMP port.
func SetRTMPPortNumber(port float64) error {
	return _datastore.SetNumber(rtmpPortNumberKey, port)
}

// GetRTMPSEnabled will return whether RTMPS is enabled.
func GetRTMPSEnabled() bool {
	enabled, err := _datastore.GetBool(rtmpsEnabledKey)
	if err != nil {
		return false
	}
	return enabled
}

// SetRTMPSEnabled will set whether RTMPS is enabled.
func SetRTMPSEnabled(enabled bool) error {
	return _datastore.SetBool(rtmpsEnabledKey, enabled)
}

// GetRTMPSPortNumber will return the server RTMPS port.
func GetRTMPSPortNumber() int {
	port, err := _datastore.GetNumber(rtmpsPortNumberKey)
	if err != nil {
		return 1936 // Default RTMPS port
	}
	if port == 0 {
		return 1936
	}
	return int(port)
}

// SetRTMPSPortNumber will set the server RTMPS port.
func SetRTMPSPortNumber(port float64) error {
	return _datastore.SetNumber(rtmpsPortNumberKey, port)
}

// GetRTMPSCertPath will return the path to the TLS certificate.
func GetRTMPSCertPath() string {
	path, _ := _datastore.GetString(rtmpsCertPathKey)
	return path
}

// SetRTMPSCertPath will set the path to the TLS certificate.
func SetRTMPSCertPath(path string) error {
	return _datastore.SetString(rtmpsCertPathKey, path)
}

// GetRTMPSKeyPath will return the path to the TLS private key.
func GetRTMPSKeyPath() string {
	path, _ := _datastore.GetString(rtmpsKeyPathKey)
	return path
}

// SetRTMPSKeyPath will set the path to the TLS private key.
func SetRTMPSKeyPath(path string) error {
	return _datastore.SetString(rtmpsKeyPathKey, path)
}

// GetServerMetadataTags will return the metadata tags.
func GetServerMetadataTags() []string {
	tagsString, err := _datastore.GetString(serverMetadataTagsKey)
	if tagsString == "" {
		return []string{}
	}

	if err != nil {
		log.Traceln(serverMetadataTagsKey, err)
		return []string{}
	}

	return strings.Split(tagsString, ",")
}

// SetServerMetadataTags will return the metadata tags.
func SetServerMetadataTags(tags []string) error {
	tagString := strings.Join(tags, ",")
	return _datastore.SetString(serverMetadataTagsKey, tagString)
}

// GetDirectoryEnabled will return if this server should register to YP.
func GetDirectoryEnabled() bool {
	enabled, err := _datastore.GetBool(directoryEnabledKey)
	if err != nil {
		return config.GetDefaults().YPEnabled
	}

	return enabled
}

// SetDirectoryEnabled will set if this server should register to YP.
func SetDirectoryEnabled(enabled bool) error {
	return _datastore.SetBool(directoryEnabledKey, enabled)
}

// SetDirectoryRegistrationKey will set the YP protocol registration key.
func SetDirectoryRegistrationKey(key string) error {
	return _datastore.SetString(directoryRegistrationKeyKey, key)
}

// GetDirectoryRegistrationKey will return the YP protocol registration key.
func GetDirectoryRegistrationKey() string {
	key, _ := _datastore.GetString(directoryRegistrationKeyKey)
	return key
}

// GetSocialHandles will return the external social links.
func GetSocialHandles() []models.SocialHandle {
	var socialHandles []models.SocialHandle

	configEntry, err := _datastore.Get(socialHandlesKey)
	if err != nil {
		log.Traceln(socialHandlesKey, err)
		return socialHandles
	}

	if err := configEntry.getObject(&socialHandles); err != nil {
		log.Traceln(err)
		return socialHandles
	}

	return socialHandles
}

// SetSocialHandles will set the external social links.
func SetSocialHandles(socialHandles []models.SocialHandle) error {
	configEntry := ConfigEntry{Key: socialHandlesKey, Value: socialHandles}
	return _datastore.Save(configEntry)
}

// GetPeakSessionViewerCount will return the max number of viewers for this stream.
func GetPeakSessionViewerCount() int {
	count, err := _datastore.GetNumber(peakViewersSessionKey)
	if err != nil {
		return 0
	}
	return int(count)
}

// SetPeakSessionViewerCount will set the max number of viewers for this stream.
func SetPeakSessionViewerCount(count int) error {
	return _datastore.SetNumber(peakViewersSessionKey, float64(count))
}

// GetPeakOverallViewerCount will return the overall max number of viewers.
func GetPeakOverallViewerCount() int {
	count, err := _datastore.GetNumber(peakViewersOverallKey)
	if err != nil {
		return 0
	}
	return int(count)
}

// SetPeakOverallViewerCount will set the overall max number of viewers.
func SetPeakOverallViewerCount(count int) error {
	return _datastore.SetNumber(peakViewersOverallKey, float64(count))
}

// GetLastDisconnectTime will return the time the last stream ended.
func GetLastDisconnectTime() (*utils.NullTime, error) {
	var disconnectTime utils.NullTime

	configEntry, err := _datastore.Get(lastDisconnectTimeKey)
	if err != nil {
		return nil, err
	}

	if err := configEntry.getObject(&disconnectTime); err != nil {
		return nil, err
	}

	if !disconnectTime.Valid || disconnectTime.Time.IsZero() {
		return nil, err
	}

	return &disconnectTime, nil
}

// SetLastDisconnectTime will set the time the last stream ended.
func SetLastDisconnectTime(disconnectTime time.Time) error {
	savedDisconnectTime := utils.NullTime{Time: disconnectTime, Valid: true}
	configEntry := ConfigEntry{Key: lastDisconnectTimeKey, Value: savedDisconnectTime}
	return _datastore.Save(configEntry)
}

// SetNSFW will set if this stream has NSFW content.
func SetNSFW(isNSFW bool) error {
	return _datastore.SetBool(nsfwKey, isNSFW)
}

// GetNSFW will return if this stream has NSFW content.
func GetNSFW() bool {
	nsfw, err := _datastore.GetBool(nsfwKey)
	if err != nil {
		return false
	}
	return nsfw
}

// SetFfmpegPath will set the custom ffmpeg path.
func SetFfmpegPath(path string) error {
	return _datastore.SetString(ffmpegPathKey, path)
}

// GetFfMpegPath will return the ffmpeg path.
func GetFfMpegPath() string {
	path, err := _datastore.GetString(ffmpegPathKey)
	if err != nil {
		return ""
	}
	return path
}

// GetS3Config will return the external storage configuration.
func GetS3Config() models.S3 {
	configEntry, err := _datastore.Get(s3StorageConfigKey)
	if err != nil {
		return models.S3{Enabled: false}
	}

	var s3Config models.S3
	if err := configEntry.getObject(&s3Config); err != nil {
		return models.S3{Enabled: false}
	}

	return s3Config
}

// SetS3Config will set the external storage configuration.
func SetS3Config(config models.S3) error {
	configEntry := ConfigEntry{Key: s3StorageConfigKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetStreamLatencyLevel will return the stream latency level.
func GetStreamLatencyLevel() models.LatencyLevel {
	level, err := _datastore.GetNumber(videoLatencyLevel)
	if err != nil {
		level = 2 // default
	} else if level > 4 {
		level = 4 // highest
	}

	return models.GetLatencyLevel(int(level))
}

// SetStreamLatencyLevel will set the stream latency level.
func SetStreamLatencyLevel(level float64) error {
	return _datastore.SetNumber(videoLatencyLevel, level)
}

// GetStreamOutputVariants will return all of the stream output variants.
func GetStreamOutputVariants() []models.StreamOutputVariant {
	configEntry, err := _datastore.Get(videoStreamOutputVariantsKey)
	if err != nil {
		return config.GetDefaults().StreamVariants
	}

	var streamOutputVariants []models.StreamOutputVariant
	if err := configEntry.getObject(&streamOutputVariants); err != nil {
		return config.GetDefaults().StreamVariants
	}

	if len(streamOutputVariants) == 0 {
		return config.GetDefaults().StreamVariants
	}

	return streamOutputVariants
}

// SetStreamOutputVariants will set the stream output variants.
func SetStreamOutputVariants(variants []models.StreamOutputVariant) error {
	configEntry := ConfigEntry{Key: videoStreamOutputVariantsKey, Value: variants}
	return _datastore.Save(configEntry)
}

// SetChatDisabled will disable chat if set to true.
func SetChatDisabled(disabled bool) error {
	return _datastore.SetBool(chatDisabledKey, disabled)
}

// SetSilentStreamMode will enable or disable silent (test) stream mode.
// While enabled, going live does not fire any external notifications.
func SetSilentStreamMode(enabled bool) error {
	return _datastore.SetBool(silentStreamModeKey, enabled)
}

// GetSilentStreamMode returns if silent (test) stream mode is enabled.
// While enabled, going live does not fire any external notifications
// (webhooks, browser push, Discord, X/Twitter, Fediverse, directory).
func GetSilentStreamMode() bool {
	enabled, err := _datastore.GetBool(silentStreamModeKey)
	if err == nil {
		return enabled
	}

	return false
}

// SetRecordingEnabled sets whether broadcasts are archived to VOD recordings.
func SetRecordingEnabled(enabled bool) error {
	return _datastore.SetBool(recordingEnabledKey, enabled)
}

// GetRecordingEnabled returns whether broadcasts are archived. Disabled by
// default since recordings consume disk space.
func GetRecordingEnabled() bool {
	enabled, err := _datastore.GetBool(recordingEnabledKey)
	if err == nil {
		return enabled
	}

	return false
}

// SetRecordingRetentionCount sets how many recordings to keep (0 = unlimited).
func SetRecordingRetentionCount(count int) error {
	return _datastore.SetNumber(recordingRetentionKey, float64(count))
}

// GetRecordingRetentionCount returns how many recordings to keep. 0 means
// unlimited (no automatic pruning).
func GetRecordingRetentionCount() int {
	count, err := _datastore.GetNumber(recordingRetentionKey)
	if err != nil {
		return 0
	}
	return int(count)
}

// SetRecordingStoreOnS3 sets whether finished recordings are offloaded to the
// configured S3 bucket (under the archives/ prefix) instead of kept on local
// disk. The same S3 credentials as live HLS distribution are reused.
func SetRecordingStoreOnS3(enabled bool) error {
	return _datastore.SetBool(recordingStoreOnS3Key, enabled)
}

// GetRecordingStoreOnS3 returns whether recordings are offloaded to S3.
// Disabled by default (recordings stay on local disk).
func GetRecordingStoreOnS3() bool {
	enabled, err := _datastore.GetBool(recordingStoreOnS3Key)
	if err == nil {
		return enabled
	}
	return false
}

// SetBackupEnabled sets whether the database is backed up automatically on a
// schedule.
func SetBackupEnabled(enabled bool) error {
	return _datastore.SetBool(backupEnabledKey, enabled)
}

// GetBackupEnabled returns whether scheduled database backups run. Enabled by
// default — the DB holds config, users and purchase entitlements, so losing it
// is costly.
func GetBackupEnabled() bool {
	enabled, err := _datastore.GetBool(backupEnabledKey)
	if err == nil {
		return enabled
	}
	return true
}

// SetBackupIntervalHours sets how often (in hours) a scheduled backup runs.
func SetBackupIntervalHours(hours int) error {
	return _datastore.SetNumber(backupIntervalHoursKey, float64(hours))
}

// GetBackupIntervalHours returns the backup interval in hours (default 24,
// clamped to a sane minimum of 1).
func GetBackupIntervalHours() int {
	hours, err := _datastore.GetNumber(backupIntervalHoursKey)
	if err != nil || hours < 1 {
		return 24
	}
	return int(hours)
}

// SetBackupRetentionCount sets how many local backup files to keep.
func SetBackupRetentionCount(count int) error {
	return _datastore.SetNumber(backupRetentionCountKey, float64(count))
}

// GetBackupRetentionCount returns how many local backups to keep (default 7).
// 0 keeps them all.
func GetBackupRetentionCount() int {
	count, err := _datastore.GetNumber(backupRetentionCountKey)
	if err != nil {
		return 7
	}
	return int(count)
}

// SetBackupStoreOnS3 sets whether each backup is also uploaded to the
// configured S3 bucket (survives disk loss and enables node migration).
func SetBackupStoreOnS3(enabled bool) error {
	return _datastore.SetBool(backupStoreOnS3Key, enabled)
}

// GetBackupStoreOnS3 returns whether backups are uploaded to S3. Disabled by
// default (backups stay on local disk).
func GetBackupStoreOnS3() bool {
	enabled, err := _datastore.GetBool(backupStoreOnS3Key)
	if err == nil {
		return enabled
	}
	return false
}

// GetChatDisabled will return if chat is disabled.
func GetChatDisabled() bool {
	disabled, err := _datastore.GetBool(chatDisabledKey)
	if err == nil {
		return disabled
	}

	return false
}

// SetChatEstablishedUsersOnlyMode sets the state of established user only mode.
func SetChatEstablishedUsersOnlyMode(enabled bool) error {
	return _datastore.SetBool(chatEstablishedUsersOnlyModeKey, enabled)
}

// GetChatEstbalishedUsersOnlyMode returns the state of established user only mode.
func GetChatEstbalishedUsersOnlyMode() bool {
	enabled, err := _datastore.GetBool(chatEstablishedUsersOnlyModeKey)
	if err == nil {
		return enabled
	}

	return false
}

// SetChatSpamProtectionEnabled will enable chat spam protection if set to true.
func SetChatSpamProtectionEnabled(enabled bool) error {
	return _datastore.SetBool(chatSpamProtectionEnabledKey, enabled)
}

// GetChatSpamProtectionEnabled will return if chat spam protection is enabled.
func GetChatSpamProtectionEnabled() bool {
	enabled, err := _datastore.GetBool(chatSpamProtectionEnabledKey)
	if err == nil {
		return enabled
	}

	return true
}

// SetChatSlurFilterEnabled will enable the chat slur filter.
func SetChatSlurFilterEnabled(enabled bool) error {
	return _datastore.SetBool(chatSlurFilterEnabledKey, enabled)
}

// GetChatSlurFilterEnabled will return if the chat slur filter is enabled.
func GetChatSlurFilterEnabled() bool {
	enabled, err := _datastore.GetBool(chatSlurFilterEnabledKey)
	if err == nil {
		return enabled
	}

	return false
}

// SetRequireTwitterAuth sets whether Twitter authentication is required.
func SetRequireTwitterAuth(required bool) error {
	return _datastore.SetBool(requireTwitterAuthKey, required)
}

// GetSocialAuthRequired reports whether viewers must complete social
// authentication (X/Discord/Google/GitHub) to watch and chat. It is only
// effective when at least one provider is configured, so enabling the flag
// without a provider can't lock everyone out.
func GetSocialAuthRequired() bool {
	if !GetRequireTwitterAuth() {
		return false
	}
	return GetXAuthConfig().ClientID != "" ||
		GetDiscordAuthConfig().ClientID != "" ||
		GetGoogleAuthConfig().ClientID != "" ||
		GetGitHubAuthConfig().ClientID != ""
}

// GetRequireTwitterAuth returns whether Twitter authentication is required.
func GetRequireTwitterAuth() bool {
	required, err := _datastore.GetBool(requireTwitterAuthKey)
	if err == nil {
		return required
	}

	return false
}

// GetExternalActions will return the registered external actions.
func GetExternalActions() []models.ExternalAction {
	configEntry, err := _datastore.Get(externalActionsKey)
	if err != nil {
		return []models.ExternalAction{}
	}

	var externalActions []models.ExternalAction
	if err := configEntry.getObject(&externalActions); err != nil {
		return []models.ExternalAction{}
	}

	return externalActions
}

// SetExternalActions will save external actions.
func SetExternalActions(actions []models.ExternalAction) error {
	configEntry := ConfigEntry{Key: externalActionsKey, Value: actions}
	return _datastore.Save(configEntry)
}

// SetCustomStyles will save a string with CSS to insert into the page.
func SetCustomStyles(styles string) error {
	return _datastore.SetString(customStylesKey, styles)
}

// GetCustomStyles will return a string with CSS to insert into the page.
func GetCustomStyles() string {
	style, err := _datastore.GetString(customStylesKey)
	if err != nil {
		return ""
	}

	return style
}

// SetCustomJavascript will save a string with Javascript to insert into the page.
func SetCustomJavascript(styles string) error {
	return _datastore.SetString(customJavascriptKey, styles)
}

// GetCustomJavascript will return a string with Javascript to insert into the page.
func GetCustomJavascript() string {
	style, err := _datastore.GetString(customJavascriptKey)
	if err != nil {
		return ""
	}

	return style
}

// SetVideoCodec will set the codec used for video encoding.
func SetVideoCodec(codec string) error {
	return _datastore.SetString(videoCodecKey, codec)
}

// GetVideoCodec returns the codec to use for transcoding video.
func GetVideoCodec() string {
	codec, err := _datastore.GetString(videoCodecKey)
	if codec == "" || err != nil {
		return "libx264" // Default value
	}

	return codec
}

// VerifySettings will perform a sanity check for specific settings values.
func VerifySettings() error {
	if len(GetStreamKeys()) == 0 && config.TemporaryStreamKey == "" {
		log.Errorln("No stream key set. Streaming is disabled. Please set one via the admin or command line arguments")
	}

	if GetAdminPassword() == "" {
		return errors.New("no admin password set. Please set one via the admin or command line arguments")
	}

	logoPath := GetLogoPath()
	if !utils.DoesFileExists(filepath.Join(config.DataDirectory, logoPath)) {
		log.Traceln(logoPath, "not found in the data directory. copying a default logo.")
		logo := static.GetLogo()
		if err := os.WriteFile(filepath.Join(config.DataDirectory, "logo.png"), logo, 0o600); err != nil {
			return errors.Wrap(err, "failed to write logo to disk")
		}
		if err := SetLogoPath("logo.png"); err != nil {
			return errors.Wrap(err, "failed to save logo filename")
		}
	}

	return nil
}

// FindHighestVideoQualityIndex will return the highest quality from a slice of variants.
func FindHighestVideoQualityIndex(qualities []models.StreamOutputVariant) int {
	type IndexedQuality struct {
		index   int
		quality models.StreamOutputVariant
	}

	if len(qualities) < 2 {
		return 0
	}

	indexedQualities := make([]IndexedQuality, 0)
	for index, quality := range qualities {
		indexedQuality := IndexedQuality{index, quality}
		indexedQualities = append(indexedQualities, indexedQuality)
	}

	sort.Slice(indexedQualities, func(a, b int) bool {
		if indexedQualities[a].quality.IsVideoPassthrough && !indexedQualities[b].quality.IsVideoPassthrough {
			return true
		}

		if !indexedQualities[a].quality.IsVideoPassthrough && indexedQualities[b].quality.IsVideoPassthrough {
			return false
		}

		return indexedQualities[a].quality.VideoBitrate > indexedQualities[b].quality.VideoBitrate
	})

	return indexedQualities[0].index
}

// GetForbiddenUsernameList will return the blocked usernames as a comma separated string.
func GetForbiddenUsernameList() []string {
	usernames, err := _datastore.GetStringSlice(blockedUsernamesKey)
	if err != nil {
		return config.DefaultForbiddenUsernames
	}

	if len(usernames) == 0 {
		return config.DefaultForbiddenUsernames
	}

	return usernames
}

// SetForbiddenUsernameList set the username blocklist as a comma separated string.
func SetForbiddenUsernameList(usernames []string) error {
	return _datastore.SetStringSlice(blockedUsernamesKey, usernames)
}

// GetSuggestedUsernamesList will return the suggested usernames.
// If the number of suggested usernames is smaller than 10, the number pool is
// not used (see code in the CreateAnonymousUser function).
func GetSuggestedUsernamesList() []string {
	usernames, err := _datastore.GetStringSlice(suggestedUsernamesKey)

	if err != nil || len(usernames) == 0 {
		return []string{}
	}

	return usernames
}

// SetSuggestedUsernamesList sets the username suggestion list.
func SetSuggestedUsernamesList(usernames []string) error {
	return _datastore.SetStringSlice(suggestedUsernamesKey, usernames)
}

// GetServerInitTime will return when the server was first setup.
func GetServerInitTime() (*utils.NullTime, error) {
	var t utils.NullTime

	configEntry, err := _datastore.Get(serverInitDateKey)
	if err != nil {
		return nil, err
	}

	if err := configEntry.getObject(&t); err != nil {
		return nil, err
	}

	if !t.Valid {
		return nil, err
	}

	return &t, nil
}

// SetServerInitTime will set when the server was first created.
func SetServerInitTime(t time.Time) error {
	nt := utils.NullTime{Time: t, Valid: true}
	configEntry := ConfigEntry{Key: serverInitDateKey, Value: nt}
	return _datastore.Save(configEntry)
}

// SetFederationEnabled will enable federation if set to true.
func SetFederationEnabled(enabled bool) error {
	return _datastore.SetBool(federationEnabledKey, enabled)
}

// GetFederationEnabled will return if federation is enabled.
func GetFederationEnabled() bool {
	enabled, err := _datastore.GetBool(federationEnabledKey)
	if err == nil {
		return enabled
	}

	return false
}

// SetFederationUsername will set the username used in federated activities.
func SetFederationUsername(username string) error {
	return _datastore.SetString(federationUsernameKey, username)
}

// GetFederationUsername will return the username used in federated activities.
func GetFederationUsername() string {
	username, err := _datastore.GetString(federationUsernameKey)
	if username == "" || err != nil {
		return config.GetDefaults().FederationUsername
	}

	return username
}

// SetFederationGoLiveMessage will set the message sent when going live.
func SetFederationGoLiveMessage(message string) error {
	return _datastore.SetString(federationGoLiveMessageKey, message)
}

// GetFederationGoLiveMessage will return the message sent when going live.
func GetFederationGoLiveMessage() string {
	// Empty message means it's disabled.
	message, err := _datastore.GetString(federationGoLiveMessageKey)
	if err != nil {
		log.Traceln("unable to fetch go live message.", err)
	}

	return message
}

// SetFederationIsPrivate will set if federation activity is private.
func SetFederationIsPrivate(isPrivate bool) error {
	return _datastore.SetBool(federationPrivateKey, isPrivate)
}

// GetFederationIsPrivate will return if federation is private.
func GetFederationIsPrivate() bool {
	isPrivate, err := _datastore.GetBool(federationPrivateKey)
	if err == nil {
		return isPrivate
	}

	return false
}

// SetFederationShowEngagement will set if fediverse engagement shows in chat.
func SetFederationShowEngagement(showEngagement bool) error {
	return _datastore.SetBool(federationShowEngagementKey, showEngagement)
}

// GetFederationShowEngagement will return if fediverse engagement shows in chat.
func GetFederationShowEngagement() bool {
	showEngagement, err := _datastore.GetBool(federationShowEngagementKey)
	if err == nil {
		return showEngagement
	}

	return true
}

// SetBlockedFederatedDomains will set the blocked federated domains.
func SetBlockedFederatedDomains(domains []string) error {
	return _datastore.SetString(federationBlockedDomainsKey, strings.Join(domains, ","))
}

// GetBlockedFederatedDomains will return a list of blocked federated domains.
func GetBlockedFederatedDomains() []string {
	domains, err := _datastore.GetString(federationBlockedDomainsKey)
	if err != nil {
		return []string{}
	}

	if domains == "" {
		return []string{}
	}

	return strings.Split(domains, ",")
}

// SetChatJoinMessagesEnabled will set if chat join messages are enabled.
func SetChatJoinMessagesEnabled(enabled bool) error {
	return _datastore.SetBool(chatJoinMessagesEnabledKey, enabled)
}

// GetChatJoinMessagesEnabled will return if chat join messages are enabled.
func GetChatJoinMessagesEnabled() bool {
	enabled, err := _datastore.GetBool(chatJoinMessagesEnabledKey)
	if err != nil {
		return true
	}

	return enabled
}

// SetNotificationsEnabled will save the enabled state of notifications.
func SetNotificationsEnabled(enabled bool) error {
	return _datastore.SetBool(notificationsEnabledKey, enabled)
}

// GetNotificationsEnabled will return the enabled state of notifications.
func GetNotificationsEnabled() bool {
	enabled, _ := _datastore.GetBool(notificationsEnabledKey)
	return enabled
}

// GetDiscordConfig will return the Discord configuration.
func GetDiscordConfig() models.DiscordConfiguration {
	configEntry, err := _datastore.Get(discordConfigurationKey)
	if err != nil {
		return models.DiscordConfiguration{Enabled: false}
	}

	var config models.DiscordConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.DiscordConfiguration{Enabled: false}
	}

	return config
}

// SetDiscordConfig will set the Discord configuration.
func SetDiscordConfig(config models.DiscordConfiguration) error {
	configEntry := ConfigEntry{Key: discordConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetDiscordAuthConfig will return the Discord OAuth2 configuration.
func GetDiscordAuthConfig() models.DiscordAuthConfiguration {
	configEntry, err := _datastore.Get(discordAuthConfigurationKey)
	if err != nil {
		return models.DiscordAuthConfiguration{}
	}

	var config models.DiscordAuthConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.DiscordAuthConfiguration{}
	}

	return config
}

// SetDiscordAuthConfig will set the Discord OAuth2 configuration.
func SetDiscordAuthConfig(config models.DiscordAuthConfiguration) error {
	configEntry := ConfigEntry{Key: discordAuthConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetXAuthConfig will return the X OAuth2 authentication configuration.
func GetXAuthConfig() models.XAuthConfiguration {
	configEntry, err := _datastore.Get(xAuthConfigurationKey)
	if err != nil {
		return models.XAuthConfiguration{}
	}

	var config models.XAuthConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.XAuthConfiguration{}
	}

	return config
}

// SetXAuthConfig will set the X OAuth2 authentication configuration.
func SetXAuthConfig(config models.XAuthConfiguration) error {
	configEntry := ConfigEntry{Key: xAuthConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetGoogleAuthConfig will return the Google OAuth2 authentication configuration.
func GetGoogleAuthConfig() models.GoogleAuthConfiguration {
	configEntry, err := _datastore.Get(googleAuthConfigurationKey)
	if err != nil {
		return models.GoogleAuthConfiguration{}
	}

	var config models.GoogleAuthConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.GoogleAuthConfiguration{}
	}

	return config
}

// SetGoogleAuthConfig will set the Google OAuth2 authentication configuration.
func SetGoogleAuthConfig(config models.GoogleAuthConfiguration) error {
	configEntry := ConfigEntry{Key: googleAuthConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetGitHubAuthConfig will return the GitHub OAuth2 authentication configuration.
func GetGitHubAuthConfig() models.GitHubAuthConfiguration {
	configEntry, err := _datastore.Get(githubAuthConfigurationKey)
	if err != nil {
		return models.GitHubAuthConfiguration{}
	}

	var config models.GitHubAuthConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.GitHubAuthConfiguration{}
	}

	return config
}

// SetGitHubAuthConfig will set the GitHub OAuth2 authentication configuration.
func SetGitHubAuthConfig(config models.GitHubAuthConfiguration) error {
	configEntry := ConfigEntry{Key: githubAuthConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetRecordingHighestOnly reports whether recordings keep only the highest
// quality variant (default) instead of every rendition.
func GetRecordingHighestOnly() bool {
	enabled, err := _datastore.GetBool(recordingHighestOnlyKey)
	if err == nil {
		return enabled
	}
	return true
}

// SetRecordingHighestOnly sets whether recordings keep only the highest
// quality variant.
func SetRecordingHighestOnly(only bool) error {
	return _datastore.SetBool(recordingHighestOnlyKey, only)
}

// GetLivePosterPath returns the filename (relative to the data directory) of
// the operator-uploaded live poster image, or empty when none is set.
func GetLivePosterPath() string {
	path, err := _datastore.GetString(livePosterPathKey)
	if err != nil {
		return ""
	}
	return path
}

// SetLivePosterPath sets the filename of the uploaded live poster image.
func SetLivePosterPath(path string) error {
	return _datastore.SetString(livePosterPathKey, path)
}

// GetTwitterConfig will return the Twitter configuration.
func GetTwitterConfig() models.TwitterConfiguration {
	configEntry, err := _datastore.Get(twitterConfigurationKey)
	if err != nil {
		return models.TwitterConfiguration{Enabled: false}
	}

	var config models.TwitterConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.TwitterConfiguration{Enabled: false}
	}

	return config
}

// SetTwitterConfig will set the Twitter configuration.
func SetTwitterConfig(config models.TwitterConfiguration) error {
	configEntry := ConfigEntry{Key: twitterConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetBrowserPushConfig will return the browser push configuration.
func GetBrowserPushConfig() models.BrowserNotificationConfiguration {
	configEntry, err := _datastore.Get(browserPushConfigurationKey)
	if err != nil {
		return models.BrowserNotificationConfiguration{Enabled: false}
	}

	var config models.BrowserNotificationConfiguration
	if err := configEntry.getObject(&config); err != nil {
		return models.BrowserNotificationConfiguration{Enabled: false}
	}

	return config
}

// SetBrowserPushConfig will set the browser push configuration.
func SetBrowserPushConfig(config models.BrowserNotificationConfiguration) error {
	configEntry := ConfigEntry{Key: browserPushConfigurationKey, Value: config}
	return _datastore.Save(configEntry)
}

// SetBrowserPushPublicKey will set the public key for browser pushes.
func SetBrowserPushPublicKey(key string) error {
	return _datastore.SetString(browserPushPublicKeyKey, key)
}

// GetBrowserPushPublicKey will return the public key for browser pushes.
func GetBrowserPushPublicKey() (string, error) {
	return _datastore.GetString(browserPushPublicKeyKey)
}

// SetBrowserPushPrivateKey will set the private key for browser pushes.
func SetBrowserPushPrivateKey(key string) error {
	return _datastore.SetString(browserPushPrivateKeyKey, key)
}

// GetBrowserPushPrivateKey will return the private key for browser pushes.
func GetBrowserPushPrivateKey() (string, error) {
	return _datastore.GetString(browserPushPrivateKeyKey)
}

// SetHasPerformedInitialNotificationsConfig sets when performed initial setup.
func SetHasPerformedInitialNotificationsConfig(hasConfigured bool) error {
	return _datastore.SetBool(hasConfiguredInitialNotificationsKey, true)
}

// GetHasPerformedInitialNotificationsConfig gets when performed initial setup.
func GetHasPerformedInitialNotificationsConfig() bool {
	configured, _ := _datastore.GetBool(hasConfiguredInitialNotificationsKey)
	return configured
}

// GetHideViewerCount will return if the viewer count shold be hidden.
func GetHideViewerCount() bool {
	hide, _ := _datastore.GetBool(hideViewerCountKey)
	return hide
}

// SetHideViewerCount will set if the viewer count should be hidden.
func SetHideViewerCount(hide bool) error {
	return _datastore.SetBool(hideViewerCountKey, hide)
}

// GetCustomOfflineMessage will return the custom offline message.
func GetCustomOfflineMessage() string {
	message, _ := _datastore.GetString(customOfflineMessageKey)
	return message
}

// SetCustomOfflineMessage will set the custom offline message.
func SetCustomOfflineMessage(message string) error {
	return _datastore.SetString(customOfflineMessageKey, message)
}

// SetCustomColorVariableValues sets CSS variable names and values.
func SetCustomColorVariableValues(variables map[string]string) error {
	return _datastore.SetStringMap(customColorVariableValuesKey, variables)
}

// GetCustomColorVariableValues gets CSS variable names and values.
func GetCustomColorVariableValues() map[string]string {
	values, _ := _datastore.GetStringMap(customColorVariableValuesKey)
	return values
}

// GetStreamKeys will return valid stream keys.
func GetStreamKeys() []models.StreamKey {
	configEntry, err := _datastore.Get(streamKeysKey)
	if err != nil {
		return []models.StreamKey{}
	}

	var streamKeys []models.StreamKey
	if err := configEntry.getObject(&streamKeys); err != nil {
		return []models.StreamKey{}
	}

	return streamKeys
}

// SetStreamKeys will set valid stream keys.
func SetStreamKeys(actions []models.StreamKey) error {
	configEntry := ConfigEntry{Key: streamKeysKey, Value: actions}
	return _datastore.Save(configEntry)
}

// Stream Protocol Configuration (LL-HLS / WebRTC)
const (
	streamProtocolConfigKey = "stream_protocol_config"
	llhlsLatencyLevelKey    = "llhls_latency_level"
)

// GetStreamProtocolConfig returns the streaming protocol configuration.
func GetStreamProtocolConfig() models.StreamProtocolConfig {
	// Guard against being called before the datastore is initialized (e.g. from
	// webRTCUDPPort when the SFU is built in unit tests without a data store).
	if _datastore == nil {
		return models.DefaultStreamProtocolConfig()
	}
	configEntry, err := _datastore.Get(streamProtocolConfigKey)
	if err != nil {
		return models.DefaultStreamProtocolConfig()
	}

	var config models.StreamProtocolConfig
	if err := configEntry.getObject(&config); err != nil {
		return models.DefaultStreamProtocolConfig()
	}

	return config
}

// SetStreamProtocolConfig sets the streaming protocol configuration.
func SetStreamProtocolConfig(config models.StreamProtocolConfig) error {
	configEntry := ConfigEntry{Key: streamProtocolConfigKey, Value: config}
	return _datastore.Save(configEntry)
}

// GetLLHLSEnabled returns whether LL-HLS is enabled.
func GetLLHLSEnabled() bool {
	return GetStreamProtocolConfig().LLHLSEnabled
}

// SetLLHLSEnabled sets whether LL-HLS is enabled.
func SetLLHLSEnabled(enabled bool) error {
	config := GetStreamProtocolConfig()
	config.LLHLSEnabled = enabled
	return SetStreamProtocolConfig(config)
}

// GetLLHLSLatencyLevel returns the LL-HLS latency level.
func GetLLHLSLatencyLevel() models.LLHLSLatencyLevel {
	level, err := _datastore.GetNumber(llhlsLatencyLevelKey)
	if err != nil {
		log.Debugf("LL-HLS latency level not set in config, using default (level 2)")
		level = 2 // default to medium
	} else if level > 4 {
		level = 4
	}
	log.Debugf("LL-HLS latency level: %v", level)
	return models.GetLLHLSLatencyLevel(int(level))
}

// SetLLHLSLatencyLevel sets the LL-HLS latency level.
func SetLLHLSLatencyLevel(level float64) error {
	return _datastore.SetNumber(llhlsLatencyLevelKey, level)
}

// GetWebRTCEnabled returns whether WebRTC is enabled.
func GetWebRTCEnabled() bool {
	return GetStreamProtocolConfig().WebRTCEnabled
}

// SetWebRTCEnabled sets whether WebRTC is enabled.
func SetWebRTCEnabled(enabled bool) error {
	config := GetStreamProtocolConfig()
	config.WebRTCEnabled = enabled
	return SetStreamProtocolConfig(config)
}

// GetWebRTCICEServers returns the WebRTC ICE server configuration.
func GetWebRTCICEServers() string {
	config := GetStreamProtocolConfig()
	if config.WebRTCICEServers == "" {
		return `[{"urls": ["stun:stun.l.google.com:19302"]}]`
	}
	return config.WebRTCICEServers
}

// SetWebRTCICEServers sets the WebRTC ICE server configuration.
func SetWebRTCICEServers(servers string) error {
	config := GetStreamProtocolConfig()
	config.WebRTCICEServers = servers
	return SetStreamProtocolConfig(config)
}

// GetWebRTCMaxViewers returns the maximum WebRTC viewers.
func GetWebRTCMaxViewers() int {
	config := GetStreamProtocolConfig()
	if config.WebRTCMaxViewers == 0 {
		return 50 // default
	}
	return config.WebRTCMaxViewers
}

// SetWebRTCMaxViewers sets the maximum WebRTC viewers.
func SetWebRTCMaxViewers(maxViewers int) error {
	config := GetStreamProtocolConfig()
	config.WebRTCMaxViewers = maxViewers
	return SetStreamProtocolConfig(config)
}
