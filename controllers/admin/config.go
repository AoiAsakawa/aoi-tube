package admin

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"

	"github.com/aoiasakawa/aoitube/activitypub/outbox"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/controllers"
	"github.com/aoiasakawa/aoitube/core"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

const maxOfflineClipUploadSizeBytes int64 = 25 << 20  // 25MB
const maxOfflineMediaUploadSizeBytes int64 = 50 << 20 // 50MB

// ConfigValue is a container object that holds a value, is encoded, and saved to the database.
type ConfigValue struct {
	Value interface{} `json:"value"`
}

// SetTags will handle the web config request to set tags.
func SetTags(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValues, success := getValuesFromRequest(w, r)
	if !success {
		return
	}

	tagStrings := make([]string, 0)
	for _, tag := range configValues {
		tagStrings = append(tagStrings, strings.TrimLeft(tag.Value.(string), "#"))
	}

	if err := data.SetServerMetadataTags(tagStrings); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Update Fediverse followers about this change.
	if err := outbox.UpdateFollowersWithAccountUpdates(); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetStreamTitle will handle the web config request to set the current stream title.
func SetStreamTitle(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	value := configValue.Value.(string)

	if err := data.SetStreamTitle(value); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if value != "" {
		sendSystemChatAction(fmt.Sprintf("Stream title changed to **%s**", value), true)
		go webhooks.SendStreamStatusEvent(models.StreamTitleUpdated)
	}
	controllers.WriteSimpleResponse(w, true, "changed")
}

// ExternalSetStreamTitle will change the stream title on behalf of an external integration API request.
func ExternalSetStreamTitle(integration user.ExternalAPIUser, w http.ResponseWriter, r *http.Request) {
	SetStreamTitle(w, r)
}

// ExternalGetStatus will return the server status to an external integration API request.
func ExternalGetStatus(integration user.ExternalAPIUser, w http.ResponseWriter, r *http.Request) {
	status := core.GetStatus()
	controllers.WriteResponse(w, status)
}

func sendSystemChatAction(messageText string, ephemeral bool) {
	if err := chat.SendSystemAction(messageText, ephemeral); err != nil {
		log.Errorln(err)
	}
}

// SetServerName will handle the web config request to set the server's name.
func SetServerName(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetServerName(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Update Fediverse followers about this change.
	if err := outbox.UpdateFollowersWithAccountUpdates(); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetServerSummary will handle the web config request to set the about/summary text.
func SetServerSummary(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetServerSummary(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Update Fediverse followers about this change.
	if err := outbox.UpdateFollowersWithAccountUpdates(); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetStreamSchedule sets the operator's free-text next-stream schedule note,
// shown to viewers on the offline screen.
func SetStreamSchedule(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetStreamSchedule(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetCoinWalletEnabled toggles the prepaid coin wallet feature.
func SetCoinWalletEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	enabled, ok := configValue.Value.(bool)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "enabled must be a boolean")
		return
	}
	if err := data.SetCoinWalletEnabled(enabled); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetCoinChargeBonusPercent sets the bonus percentage granted on a coin charge.
func SetCoinChargeBonusPercent(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	percent, ok := configValue.Value.(float64)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "percent must be a number")
		return
	}
	if err := data.SetCoinChargeBonusPercent(int(percent)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetCustomOfflineMessage will set a message to display when the server is offline.
func SetCustomOfflineMessage(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetCustomOfflineMessage(strings.TrimSpace(configValue.Value.(string))); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetServerWelcomeMessage will handle the web config request to set the welcome message text.
func SetServerWelcomeMessage(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetServerWelcomeMessage(strings.TrimSpace(configValue.Value.(string))); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetExtraPageContent will handle the web config request to set the page markdown content.
func SetExtraPageContent(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetExtraPageBodyContent(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetAdminPassword will handle the web config request to set the server admin password.
func SetAdminPassword(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetAdminPassword(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetLogo will handle a new logo image file being uploaded.
func SetLogo(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	value, ok := configValue.Value.(string)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "unable to find image data")
		return
	}
	bytes, extension, err := utils.DecodeBase64Image(value)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	imgPath := filepath.Join("data", "logo"+extension)
	if err := os.WriteFile(imgPath, bytes, 0o600); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	if err := data.SetLogoPath("logo" + extension); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	if err := data.SetLogoUniquenessString(shortid.MustGenerate()); err != nil {
		log.Error("Error saving logo uniqueness string: ", err)
	}

	// Update Fediverse followers about this change.
	if err := outbox.UpdateFollowersWithAccountUpdates(); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetLivePoster uploads the poster image shown while the stream is live but
// no thumbnail has been generated yet (start of broadcast, pre-play).
func SetLivePoster(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	value, ok := configValue.Value.(string)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "unable to find image data")
		return
	}

	// An empty value resets to the built-in "LIVE" placeholder.
	if value == "" {
		if err := data.SetLivePosterPath(""); err != nil {
			controllers.WriteSimpleResponse(w, false, err.Error())
			return
		}
		controllers.WriteSimpleResponse(w, true, "reset")
		return
	}

	bytes, extension, err := utils.DecodeBase64Image(value)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	imgPath := filepath.Join("data", "live-poster"+extension)
	if err := os.WriteFile(imgPath, bytes, 0o600); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	if err := data.SetLivePosterPath("live-poster" + extension); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetOfflineClip will handle uploading a custom offline waiting screen clip.
// The file should be a single HLS TS segment matching AoiTube's expected offline segment duration.
// It will be stored in the data directory and will override the embedded default.
func SetOfflineClip(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxOfflineClipUploadSizeBytes)
	if err := r.ParseMultipartForm(maxOfflineClipUploadSizeBytes); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid upload")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "missing file")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".ts" && ext != ".tsclip" {
		controllers.WriteSimpleResponse(w, false, "unsupported file type")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to read upload")
		return
	}
	if len(data) == 0 {
		controllers.WriteSimpleResponse(w, false, "empty file")
		return
	}

	if err := os.MkdirAll(config.DataDirectory, 0o755); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	target := filepath.Join(config.DataDirectory, "offline.tsclip")
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := utils.Move(tmp, target); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// ResetOfflineClip removes the custom offline clip override and falls back to the embedded default.
func ResetOfflineClip(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	target := filepath.Join(config.DataDirectory, "offline.tsclip")
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetOfflineMedia will handle uploading a custom offline waiting screen media (image or mp4).
// The file will be stored in the data directory and served via /offline-media.
func SetOfflineMedia(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxOfflineMediaUploadSizeBytes)
	if err := r.ParseMultipartForm(maxOfflineMediaUploadSizeBytes); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid upload")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "missing file")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]struct{}{
		".mp4":  {},
		".jpg":  {},
		".jpeg": {},
		".png":  {},
		".gif":  {},
		".webp": {},
	}
	if _, ok := allowed[ext]; !ok {
		controllers.WriteSimpleResponse(w, false, "unsupported file type")
		return
	}

	mediaType := "image"
	if ext == ".mp4" {
		mediaType = "video"
	}

	bytes, err := io.ReadAll(file)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to read upload")
		return
	}
	if len(bytes) == 0 {
		controllers.WriteSimpleResponse(w, false, "empty file")
		return
	}

	filename := "offline-media" + ext
	path := filepath.Join("data", filename)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, bytes, 0o600); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := utils.Move(tmp, path); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Remove any previously stored offline media file if it differs.
	previous := data.GetOfflineMediaPath()
	if previous != "" && previous != filename {
		_ = os.Remove(filepath.Join("data", previous))
	}

	if err := data.SetOfflineMediaPath(filename); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := data.SetOfflineMediaType(mediaType); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := data.SetOfflineMediaUniquenessString(shortid.MustGenerate()); err != nil {
		log.Error("Error saving offline media uniqueness string: ", err)
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// ResetOfflineMedia removes the custom offline media override.
func ResetOfflineMedia(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	previous := data.GetOfflineMediaPath()
	if previous != "" {
		_ = os.Remove(filepath.Join("data", previous))
	}

	if err := data.SetOfflineMediaPath(""); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := data.SetOfflineMediaType(""); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	_ = data.SetOfflineMediaUniquenessString("")

	controllers.WriteSimpleResponse(w, true, "changed")
}

const maxNotificationThumbnailUploadSizeBytes = 10 * 1024 * 1024 // 10MB

// SetNotificationThumbnail will handle uploading a custom notification thumbnail image.
func SetNotificationThumbnail(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxNotificationThumbnailUploadSizeBytes)
	if err := r.ParseMultipartForm(maxNotificationThumbnailUploadSizeBytes); err != nil {
		controllers.WriteSimpleResponse(w, false, "invalid upload")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "missing file")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]struct{}{
		".jpg":  {},
		".jpeg": {},
		".png":  {},
		".gif":  {},
		".webp": {},
	}
	if _, ok := allowed[ext]; !ok {
		controllers.WriteSimpleResponse(w, false, "unsupported file type (jpg, png, gif, webp only)")
		return
	}

	bytes, err := io.ReadAll(file)
	if err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to read upload")
		return
	}
	if len(bytes) == 0 {
		controllers.WriteSimpleResponse(w, false, "empty file")
		return
	}

	filename := "notification-thumbnail" + ext
	path := filepath.Join("data", filename)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, bytes, 0o600); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := utils.Move(tmp, path); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	// Remove any previously stored notification thumbnail if it differs.
	previous := data.GetNotificationThumbnailPath()
	if previous != "" && previous != filename {
		_ = os.Remove(filepath.Join("data", previous))
	}

	if err := data.SetNotificationThumbnailPath(filename); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	if err := data.SetNotificationThumbnailUniquenessString(shortid.MustGenerate()); err != nil {
		log.Error("Error saving notification thumbnail uniqueness string: ", err)
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// ResetNotificationThumbnail removes the custom notification thumbnail.
func ResetNotificationThumbnail(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	previous := data.GetNotificationThumbnailPath()
	if previous != "" {
		_ = os.Remove(filepath.Join("data", previous))
	}

	if err := data.SetNotificationThumbnailPath(""); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	// A fresh uniqueness value even on reset: link-preview crawlers (X,
	// Discord) cache og:image by URL, so the fallback image only shows up
	// once the URL changes.
	_ = data.SetNotificationThumbnailUniquenessString(shortid.MustGenerate())

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetNSFW will handle the web config request to set the NSFW flag.
func SetNSFW(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetNSFW(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetFfmpegPath will handle the web config request to validate and set an updated copy of ffmpg.
func SetFfmpegPath(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	path := configValue.Value.(string)
	if err := utils.VerifyFFMpegPath(path); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	if err := data.SetFfmpegPath(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}

// SetWebServerPort will handle the web config request to set the server's HTTP port.
func SetWebServerPort(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if port, ok := configValue.Value.(float64); ok {
		if (port < 1) || (port > 65535) {
			controllers.WriteSimpleResponse(w, false, "Port number must be between 1 and 65535")
			return
		}
		if err := data.SetHTTPPortNumber(port); err != nil {
			controllers.WriteSimpleResponse(w, false, err.Error())
			return
		}

		controllers.WriteSimpleResponse(w, true, "HTTP port set")
		return
	}

	controllers.WriteSimpleResponse(w, false, "Invalid type or value, port must be a number")
}

// SetWebServerIP will handle the web config request to set the server's HTTP listen address.
func SetWebServerIP(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if input, ok := configValue.Value.(string); ok {
		if ip := net.ParseIP(input); ip != nil {
			if err := data.SetHTTPListenAddress(ip.String()); err != nil {
				controllers.WriteSimpleResponse(w, false, err.Error())
				return
			}

			controllers.WriteSimpleResponse(w, true, "HTTP listen address set")
			return
		}

		controllers.WriteSimpleResponse(w, false, "Invalid IP address")
		return
	}
	controllers.WriteSimpleResponse(w, false, "Invalid type or value, IP address must be a string")
}

// SetRTMPServerPort will handle the web config request to set the inbound RTMP port.
func SetRTMPServerPort(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetRTMPPortNumber(configValue.Value.(float64)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "rtmp port set")
}

// SetRTMPSEnabled will handle the web config request to enable/disable RTMPS.
func SetRTMPSEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetRTMPSEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "rtmps enabled status set")
}

// SetRTMPSServerPort will handle the web config request to set the inbound RTMPS port.
func SetRTMPSServerPort(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetRTMPSPortNumber(configValue.Value.(float64)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "rtmps port set")
}

// SetRTMPSCertPath will handle the web config request to set the RTMPS certificate path.
func SetRTMPSCertPath(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	certPath, ok := configValue.Value.(string)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "could not read certificate path")
		return
	}

	// Validate the certificate file exists if path is provided
	if certPath != "" {
		if _, err := os.Stat(certPath); os.IsNotExist(err) {
			controllers.WriteSimpleResponse(w, false, "certificate file does not exist")
			return
		}
	}

	if err := data.SetRTMPSCertPath(certPath); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "rtmps certificate path set")
}

// SetRTMPSKeyPath will handle the web config request to set the RTMPS key path.
func SetRTMPSKeyPath(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	keyPath, ok := configValue.Value.(string)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "could not read key path")
		return
	}

	// Validate the key file exists if path is provided
	if keyPath != "" {
		if _, err := os.Stat(keyPath); os.IsNotExist(err) {
			controllers.WriteSimpleResponse(w, false, "key file does not exist")
			return
		}
	}

	if err := data.SetRTMPSKeyPath(keyPath); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "rtmps key path set")
}

// SetServerURL will handle the web config request to set the full server URL.
func SetServerURL(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	rawValue, ok := configValue.Value.(string)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "could not read server url")
		return
	}

	serverHostString := utils.GetHostnameFromURLString(rawValue)
	if serverHostString == "" {
		controllers.WriteSimpleResponse(w, false, "server url value invalid")
		return
	}

	// Trim any trailing slash
	serverURL := strings.TrimRight(rawValue, "/")

	if err := data.SetServerURL(serverURL); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "server url set")
}

// SetSocketHostOverride will set the host override for the websocket.
func SetSocketHostOverride(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetWebsocketOverrideHost(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "websocket host override set")
}

// SetDirectoryEnabled will handle the web config request to enable or disable directory registration.
func SetDirectoryEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetDirectoryEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "directory state changed")
}

// SetStreamLatencyLevel will handle the web config request to set the stream latency level.
func SetStreamLatencyLevel(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetStreamLatencyLevel(configValue.Value.(float64)); err != nil {
		controllers.WriteSimpleResponse(w, false, "error setting stream latency "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "set stream latency")
}

// SetS3Configuration will handle the web config request to set the storage configuration.
func SetS3Configuration(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type s3ConfigurationRequest struct {
		Value models.S3 `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var newS3Config s3ConfigurationRequest
	if err := decoder.Decode(&newS3Config); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update s3 config with provided values")
		return
	}

	if newS3Config.Value.Enabled {
		if newS3Config.Value.Endpoint == "" || !utils.IsValidURL((newS3Config.Value.Endpoint)) {
			controllers.WriteSimpleResponse(w, false, "s3 support requires an endpoint")
			return
		}

		if newS3Config.Value.AccessKey == "" || newS3Config.Value.Secret == "" {
			controllers.WriteSimpleResponse(w, false, "s3 support requires an access key and secret")
			return
		}

		if newS3Config.Value.Region == "" {
			controllers.WriteSimpleResponse(w, false, "s3 support requires a region and endpoint")
			return
		}

		if newS3Config.Value.Bucket == "" {
			controllers.WriteSimpleResponse(w, false, "s3 support requires a bucket created for storing public video segments")
			return
		}
	}

	if err := data.SetS3Config(newS3Config.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "storage configuration changed")
}

// SetStreamOutputVariants will handle the web config request to set the video output stream variants.
func SetStreamOutputVariants(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type streamOutputVariantRequest struct {
		Value []models.StreamOutputVariant `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var videoVariants streamOutputVariantRequest
	if err := decoder.Decode(&videoVariants); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update video config with provided values "+err.Error())
		return
	}

	if err := data.SetStreamOutputVariants(videoVariants.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update video config with provided values "+err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "stream output variants updated")
}

// SetSocialHandles will handle the web config request to set the external social profile links.
func SetSocialHandles(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type socialHandlesRequest struct {
		Value []models.SocialHandle `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var socialHandles socialHandlesRequest
	if err := decoder.Decode(&socialHandles); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update social handles with provided values")
		return
	}

	if err := data.SetSocialHandles(socialHandles.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update social handles with provided values")
		return
	}

	// Update Fediverse followers about this change.
	if err := outbox.UpdateFollowersWithAccountUpdates(); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "social handles updated")
}

// SetChatDisabled will disable chat functionality.
func SetChatDisabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update chat disabled")
		return
	}

	if err := data.SetChatDisabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "chat disabled status updated")
}

// SetSilentStreamMode will enable or disable silent (test) stream mode,
// which suppresses all external go-live notifications.
func SetSilentStreamMode(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update silent stream mode")
		return
	}

	if err := data.SetSilentStreamMode(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "silent stream mode updated")
}

// SetRecordingEnabled enables or disables VOD recording of broadcasts.
func SetRecordingEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update recording setting")
		return
	}

	if err := data.SetRecordingEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "recording setting updated")
}

// SetRecordingStoreOnS3 enables or disables offloading finished recordings to
// the configured S3 bucket instead of keeping them on local disk.
func SetRecordingStoreOnS3(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update recording storage setting")
		return
	}

	enabled, ok := configValue.Value.(bool)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "recording storage setting must be a boolean")
		return
	}

	// Guard against enabling S3 offload without configured credentials, which
	// would silently keep recordings local on every stream.
	if enabled {
		s3 := data.GetS3Config()
		if s3.AccessKey == "" || s3.Secret == "" || s3.Bucket == "" {
			controllers.WriteSimpleResponse(w, false, "configure S3 storage credentials first (Server > Storage)")
			return
		}
	}

	if err := data.SetRecordingStoreOnS3(enabled); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "recording storage setting updated")
}

// SetBackupEnabled enables or disables scheduled database backups.
func SetBackupEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}
	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update backup setting")
		return
	}
	enabled, ok := configValue.Value.(bool)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "backup setting must be a boolean")
		return
	}
	if err := data.SetBackupEnabled(enabled); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "backup setting updated")
}

// SetBackupIntervalHours sets how often scheduled backups run.
func SetBackupIntervalHours(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}
	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update backup interval")
		return
	}
	hours, ok := numericConfigValue(configValue.Value)
	if !ok || hours < 1 {
		controllers.WriteSimpleResponse(w, false, "backup interval must be at least 1 hour")
		return
	}
	if err := data.SetBackupIntervalHours(int(hours)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "backup interval updated")
}

// SetBackupRetentionCount sets how many local backups to keep.
func SetBackupRetentionCount(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}
	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update backup retention")
		return
	}
	count, ok := numericConfigValue(configValue.Value)
	if !ok || count < 0 {
		controllers.WriteSimpleResponse(w, false, "backup retention must be 0 or more")
		return
	}
	if err := data.SetBackupRetentionCount(int(count)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "backup retention updated")
}

// SetBackupStoreOnS3 enables or disables uploading backups to S3.
func SetBackupStoreOnS3(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}
	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update backup storage setting")
		return
	}
	enabled, ok := configValue.Value.(bool)
	if !ok {
		controllers.WriteSimpleResponse(w, false, "backup storage setting must be a boolean")
		return
	}
	if enabled {
		s3 := data.GetS3Config()
		if s3.AccessKey == "" || s3.Secret == "" || s3.Bucket == "" {
			controllers.WriteSimpleResponse(w, false, "configure S3 storage credentials first (Server > Storage)")
			return
		}
	}
	if err := data.SetBackupStoreOnS3(enabled); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "backup storage setting updated")
}

// numericConfigValue coerces a JSON config value (number or numeric string)
// to a float64, mirroring how the recording-retention setter is tolerant of
// the form sending either a number or a string.
func numericConfigValue(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case string:
		f, err := strconv.ParseFloat(n, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

// SetRecordingRetention sets how many recordings to keep (0 = unlimited).
func SetRecordingRetention(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update recording retention")
		return
	}

	// Accept both a JSON number and a numeric string: the admin number field
	// posts its value as a string, and rejecting that made the save silently
	// ineffective.
	var count float64
	switch v := configValue.Value.(type) {
	case float64:
		count = v
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			controllers.WriteSimpleResponse(w, false, "retention must be a non-negative number")
			return
		}
		count = parsed
	default:
		controllers.WriteSimpleResponse(w, false, "retention must be a non-negative number")
		return
	}
	if count < 0 {
		controllers.WriteSimpleResponse(w, false, "retention must be a non-negative number")
		return
	}

	if err := data.SetRecordingRetentionCount(int(count)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "recording retention updated")
}

// SetVideoCodec will change the codec used for video encoding.
func SetVideoCodec(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to change video codec")
		return
	}

	if err := data.SetVideoCodec(configValue.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update codec")
		return
	}

	controllers.WriteSimpleResponse(w, true, "video codec updated")
}

// SetExternalActions will set the 3rd party actions for the web interface.
func SetExternalActions(w http.ResponseWriter, r *http.Request) {
	type externalActionsRequest struct {
		Value []models.ExternalAction `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var actions externalActionsRequest
	if err := decoder.Decode(&actions); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update external actions with provided values")
		return
	}

	if err := data.SetExternalActions(actions.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update external actions with provided values")
		return
	}

	controllers.WriteSimpleResponse(w, true, "external actions update")
}

// SetCustomStyles will set the CSS string we insert into the page.
func SetCustomStyles(w http.ResponseWriter, r *http.Request) {
	customStyles, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update custom styles")
		return
	}

	if err := data.SetCustomStyles(customStyles.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "custom styles updated")
}

// SetCustomJavascript will set the Javascript string we insert into the page.
func SetCustomJavascript(w http.ResponseWriter, r *http.Request) {
	customJavascript, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update custom javascript")
		return
	}

	if err := data.SetCustomJavascript(customJavascript.Value.(string)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "custom styles updated")
}

// SetChatSpamProtectionEnabled will enable or disable the chat spam protection.
func SetChatSpamProtectionEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetChatSpamProtectionEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "chat spam protection changed")
}

// SetChatSlurFilterEnabled will enable or disable the chat slur filter.
func SetChatSlurFilterEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		return
	}

	if err := data.SetChatSlurFilterEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}
	controllers.WriteSimpleResponse(w, true, "chat message slur filter changed")
}

// SetForbiddenUsernameList will set the list of usernames we do not allow to use.
func SetForbiddenUsernameList(w http.ResponseWriter, r *http.Request) {
	type forbiddenUsernameListRequest struct {
		Value []string `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var request forbiddenUsernameListRequest
	if err := decoder.Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update forbidden usernames with provided values")
		return
	}

	if err := data.SetForbiddenUsernameList(request.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "forbidden username list updated")
}

// SetSuggestedUsernameList will set the list of suggested usernames that newly registered users are assigned if it isn't inferred otherwise (i.e. through a proxy).
func SetSuggestedUsernameList(w http.ResponseWriter, r *http.Request) {
	type suggestedUsernameListRequest struct {
		Value []string `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var request suggestedUsernameListRequest

	if err := decoder.Decode(&request); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update suggested usernames with provided values")
		return
	}

	if err := data.SetSuggestedUsernamesList(request.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "suggested username list updated")
}

// SetChatJoinMessagesEnabled will enable or disable the chat join messages.
func SetChatJoinMessagesEnabled(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update chat join messages enabled")
		return
	}

	if err := data.SetChatJoinMessagesEnabled(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "chat join message status updated")
}

// SetHideViewerCount will enable or disable hiding the viewer count.
func SetHideViewerCount(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	configValue, success := getValueFromRequest(w, r)
	if !success {
		controllers.WriteSimpleResponse(w, false, "unable to update hiding viewer count")
		return
	}

	if err := data.SetHideViewerCount(configValue.Value.(bool)); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "hide viewer count setting updated")
}

func requirePOST(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != controllers.POST {
		controllers.WriteSimpleResponse(w, false, r.Method+" not supported")
		return false
	}

	return true
}

// maxConfigValueBodyBytes bounds JSON config bodies. The largest legitimate
// payloads are base64-encoded images (logo / live poster), so this is sized
// for those while still preventing an unbounded read.
const maxConfigValueBodyBytes int64 = 15 << 20 // 15MB

func getValueFromRequest(w http.ResponseWriter, r *http.Request) (ConfigValue, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxConfigValueBodyBytes)
	decoder := json.NewDecoder(r.Body)
	var configValue ConfigValue
	if err := decoder.Decode(&configValue); err != nil {
		log.Warnln(err)
		controllers.WriteSimpleResponse(w, false, "unable to parse new value")
		return configValue, false
	}

	return configValue, true
}

func getValuesFromRequest(w http.ResponseWriter, r *http.Request) ([]ConfigValue, bool) {
	var values []ConfigValue

	decoder := json.NewDecoder(r.Body)
	var configValue ConfigValue
	if err := decoder.Decode(&configValue); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to parse array of values")
		return values, false
	}

	object := reflect.ValueOf(configValue.Value)

	for i := 0; i < object.Len(); i++ {
		values = append(values, ConfigValue{Value: object.Index(i).Interface()})
	}

	return values, true
}

// SetStreamKeys will set the valid stream keys.
func SetStreamKeys(w http.ResponseWriter, r *http.Request) {
	if !requirePOST(w, r) {
		return
	}

	type streamKeysRequest struct {
		Value []models.StreamKey `json:"value"`
	}

	decoder := json.NewDecoder(r.Body)
	var streamKeys streamKeysRequest
	if err := decoder.Decode(&streamKeys); err != nil {
		controllers.WriteSimpleResponse(w, false, "unable to update stream keys with provided values")
		return
	}

	if err := data.SetStreamKeys(streamKeys.Value); err != nil {
		controllers.WriteSimpleResponse(w, false, err.Error())
		return
	}

	controllers.WriteSimpleResponse(w, true, "changed")
}
