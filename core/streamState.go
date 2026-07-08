package core

import (
	"context"
	"fmt"
	"io"
	"math"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/activitypub"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/rtmp"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
	"github.com/aoiasakawa/aoitube/core/transcoder"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/core/webrtc"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/notifications"
	"github.com/aoiasakawa/aoitube/utils"
)

// After the stream goes offline this timer fires a full cleanup after N min.
var _offlineCleanupTimer *time.Timer

// While a stream takes place cleanup old HLS content every N min.
var _onlineCleanupTicker *time.Ticker

var _currentBroadcast *models.CurrentBroadcast

var _onlineTimerCancelFunc context.CancelFunc

var _lastNotified *time.Time

// setStreamAsConnected sets the stream as connected.
func setStreamAsConnected(rtmpOut *io.PipeReader) {
	now := utils.NullTime{Time: time.Now(), Valid: true}
	_stats.StreamConnected = true
	_stats.LastDisconnectTime = nil
	_stats.LastConnectTime = &now
	_stats.SessionMaxViewerCount = 0

	_currentBroadcast = &models.CurrentBroadcast{
		LatencyLevel:   data.GetStreamLatencyLevel(),
		OutputSettings: data.GetStreamOutputVariants(),
	}

	StopOfflineCleanupTimer()
	startOnlineCleanupTimer()

	silentMode := data.GetSilentStreamMode()
	if silentMode {
		log.Infoln("Silent stream mode is enabled: skipping all go-live notifications (webhooks, browser push, Discord, X, Fediverse, directory)")
	}

	if _yp != nil && !silentMode {
		go _yp.Start()
	}

	segmentPath := config.HLSStoragePath

	// Wipe playlists left over from the previous session: they end with the
	// offline clip and an ENDLIST tag, so serving them for the new stream
	// would make players start on the stale VOD instead of the live stream.
	utils.CleanupDirectory(segmentPath)

	if err := setupStorage(); err != nil {
		log.Fatalln("failed to setup the storage", err)
	}

	// Start archiving this broadcast to a VOD recording when enabled. All
	// recordings finish hidden and are published manually from the admin
	// archive list (see FinishSession below).
	if data.GetRecordingEnabled() {
		// Archive only the top-quality variant by default: recording every
		// rendition multiplied VOD storage for no viewer benefit (playback
		// uses one rendition and R2/S3 cost scales with bytes stored).
		keepVariant := -1
		if data.GetRecordingHighestOnly() {
			keepVariant = data.FindHighestVideoQualityIndex(_currentBroadcast.OutputSettings)
		}
		recording.Get().StartSession(data.GetStreamTitle(), keepVariant)
	}

	// Feed the transcoder directly unless WebRTC is enabled, in which case the
	// RTMP stream is teed so the WebRTC media pipeline gets its own copy without
	// ever back-pressuring the HLS transcoder. Reload first so a stale enabled
	// flag can't start the pipeline after WebRTC was disabled.
	transcoderStdin := rtmpOut
	webrtcSFU := webrtc.GetSFU()
	webrtcSFU.ReloadConfig()
	if data.GetWebRTCEnabled() {
		log.Infoln("WebRTC enabled: teeing RTMP stream to the WebRTC media pipeline")
		transcoderStdin = startWebRTCMediaTee(rtmpOut)
	}

	go func() {
		// Use the LLHLSTranscoder when LL-HLS is enabled
		if transcoder.IsLLHLSEnabled() {
			log.Infoln("Starting LL-HLS transcoder for low-latency streaming")
			llhlsTranscoder := transcoder.NewLLHLSTranscoder()
			_transcoder = llhlsTranscoder.Transcoder
			_transcoder.TranscoderCompleted = func(error) {
				SetStreamAsDisconnected()
				_transcoder = nil
				_currentBroadcast = nil
			}
			_transcoder.SetStdin(transcoderStdin)
			llhlsTranscoder.Start()
		} else {
			log.Infoln("Starting standard HLS transcoder")
			_transcoder = transcoder.NewTranscoder()
			_transcoder.TranscoderCompleted = func(error) {
				SetStreamAsDisconnected()
				_transcoder = nil
				_currentBroadcast = nil
			}
			_transcoder.SetStdin(transcoderStdin)
			_transcoder.Start()
		}
	}()

	if !silentMode {
		go webhooks.SendStreamStatusEvent(models.StreamStarted)
	}
	transcoder.StartThumbnailGenerator(segmentPath, data.FindHighestVideoQualityIndex(_currentBroadcast.OutputSettings))

	if !silentMode {
		_ = chat.SendTranslatableSystemAction("streamStarting", nil, "Stay tuned, the stream is **starting**!", true)
		chat.SendAllWelcomeMessage()
	}

	// Send delayed notification messages (Fediverse, browser push, Discord, X).
	if !silentMode {
		_onlineTimerCancelFunc = startLiveStreamNotificationsTimer()
	}
}

// SetStreamAsDisconnected sets the stream as disconnected.
func SetStreamAsDisconnected() {
	if !data.GetSilentStreamMode() {
		_ = chat.SendTranslatableSystemAction("streamEnding", nil, "The stream is ending.", true)
	}

	now := utils.NullTime{Time: time.Now(), Valid: true}
	if _onlineTimerCancelFunc != nil {
		_onlineTimerCancelFunc()
	}

	// Capture the recorded rendition label for the archive manifest while the
	// inbound stream details still exist (passthrough variants take their
	// resolution/framerate from the broadcaster, which is nil'd just below).
	recording.Get().SetQuality(recordedQualityLabel())

	_stats.StreamConnected = false
	_stats.LastDisconnectTime = &now
	_stats.LastConnectTime = nil
	_broadcaster = nil

	offlineFilename := "offline.ts"

	offlineFilePath, err := saveOfflineClipToDisk(offlineFilename)
	if err != nil {
		log.Errorln(err)
		return
	}

	transcoder.StopThumbnailGenerator()
	rtmp.Disconnect()

	// WebRTC viewers get the same end-of-stream clip that HLS viewers see
	// appended to their playlists; the SFU tears down after it plays out (in
	// the background — this path must not block). With no viewers or no
	// pipeline it degrades to an immediate stop.
	go webrtc.GetSFU().PlayEndClipAndStop(
		utils.ValidatedFfmpegPath(data.GetFfMpegPath()), offlineFilePath)

	// Finalize the VOD recording (adds #EXT-X-ENDLIST + manifest) if one was
	// being captured. No-op when recording was not active. Every recording
	// starts hidden so the operator can review it (and optionally set pricing)
	// before publishing it from the admin archive list. S3 offload runs in the
	// background inside FinishSession; pruning goes to the background here too
	// (deleting a large offloaded session's S3 prefix can take a while) so
	// this disconnect path never blocks on storage I/O.
	recording.Get().FinishSession(false)
	go recording.PruneOldSessions(data.GetRecordingRetentionCount())

	// Live HLS segments uploaded to S3 for distribution are dead weight once
	// the broadcast ends (VOD playback uses archives/), and historically they
	// were never deleted — ~90GB of one-second segments accumulated in six
	// months. Purge them after the stream has stayed offline for a minute;
	// the delay keeps an instant OBS reconnect (whose fresh segments land
	// under the same hls/ prefix) from racing the deletion.
	go purgeLiveS3SegmentsAfterDelay()

	if _yp != nil {
		_yp.Stop()
	}

	// If there is no current broadcast available the previous stream
	// likely failed for some reason. Don't try to append to it.
	// Just transition to offline.
	if _currentBroadcast == nil {
		stopOnlineCleanupTimer()
		transitionToOfflineVideoStreamContent()
		log.Errorln("unexpected nil _currentBroadcast")
		return
	}

	for index := range _currentBroadcast.OutputSettings {
		makeVariantIndexOffline(index, offlineFilePath, offlineFilename)
	}

	StartOfflineCleanupTimer()
	stopOnlineCleanupTimer()
	saveStats()

	if !data.GetSilentStreamMode() {
		go webhooks.SendStreamStatusEvent(models.StreamStopped)
	}
}

// recordedQualityLabel describes the rendition the recorder archived, e.g.
// "1080p60". Passthrough variants report the inbound stream's real
// dimensions; encoded variants report their configured scale/framerate.
func recordedQualityLabel() string {
	if _currentBroadcast == nil || len(_currentBroadcast.OutputSettings) == 0 {
		return ""
	}
	idx := data.FindHighestVideoQualityIndex(_currentBroadcast.OutputSettings)
	v := _currentBroadcast.OutputSettings[idx]
	if v.IsVideoPassthrough {
		if b := GetBroadcaster(); b != nil && b.StreamDetails.Height > 0 {
			// NTSC-style rates report as 59.94/29.97: round (not truncate) so
			// the label reads 1080p60, not 1080p59.
			return fmt.Sprintf("%dp%d", b.StreamDetails.Height, int(math.Round(float64(b.StreamDetails.VideoFramerate))))
		}
		return ""
	}
	height := v.ScaledHeight
	if height == 0 {
		// Encoded at source resolution (no explicit scale): use the inbound
		// dimensions.
		if b := GetBroadcaster(); b != nil {
			height = b.StreamDetails.Height
		}
	}
	if height > 0 {
		return fmt.Sprintf("%dp%d", height, v.GetFramerate())
	}
	return ""
}

// purgeLiveS3SegmentsAfterDelay removes the hls/ distribution objects from
// the shared bucket once the stream has stayed offline for a minute. No-op
// when S3 credentials are not configured.
func purgeLiveS3SegmentsAfterDelay() {
	time.Sleep(time.Minute)
	if _stats.StreamConnected {
		return
	}
	s3, err := storageproviders.NewArchiveS3()
	if err != nil {
		return
	}
	objects, bytes, err := s3.PrefixUsage("hls/")
	if err != nil || objects == 0 {
		return
	}
	if err := s3.DeleteRawPrefix("hls/"); err != nil {
		log.Warnln("storage: unable to purge live hls/ segments:", err)
		return
	}
	log.Infof("storage: purged %d live hls/ segments (%.1f MB) from S3", objects, float64(bytes)/1024/1024)
}

// StartOfflineCleanupTimer will fire a cleanup after n minutes being disconnected.
func StartOfflineCleanupTimer() {
	_offlineCleanupTimer = time.NewTimer(5 * time.Minute)
	go func() {
		for range _offlineCleanupTimer.C {
			// Set video to offline state
			resetDirectories()
			transitionToOfflineVideoStreamContent()
		}
	}()
}

// StopOfflineCleanupTimer will stop the previous cleanup timer.
func StopOfflineCleanupTimer() {
	if _offlineCleanupTimer != nil {
		_offlineCleanupTimer.Stop()
	}
}

func startOnlineCleanupTimer() {
	_onlineCleanupTicker = time.NewTicker(1 * time.Minute)
	go func() {
		for range _onlineCleanupTicker.C {
			transcoder.CleanupOldContent(config.HLSStoragePath)
		}
	}()
}

func stopOnlineCleanupTimer() {
	if _onlineCleanupTicker != nil {
		_onlineCleanupTicker.Stop()
	}
}

func startLiveStreamNotificationsTimer() context.CancelFunc {
	// Send delayed notification messages.
	c, cancelFunc := context.WithCancel(context.Background())
	_onlineTimerCancelFunc = cancelFunc
	go func(c context.Context) {
		select {
		case <-time.After(time.Minute * 2.0):
			if _lastNotified != nil && time.Since(*_lastNotified) < 10*time.Minute {
				return
			}

			// Send Fediverse message.
			if data.GetFederationEnabled() {
				log.Traceln("Sending Federated Go Live message.")
				if err := activitypub.SendLive(); err != nil {
					log.Errorln(err)
				}
			}

			// Send notification to those who have registered for them.
			if notifier, err := notifications.New(data.GetDatastore()); err != nil {
				log.Errorln(err)
			} else {
				notifier.Notify()
			}

			now := time.Now()
			_lastNotified = &now
		case <-c.Done():
		}
	}(c)

	return cancelFunc
}
