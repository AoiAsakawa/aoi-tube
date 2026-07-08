package core

import (
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"

	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/auth"
	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/chat"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/rtmp"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
	"github.com/aoiasakawa/aoitube/core/transcoder"
	"github.com/aoiasakawa/aoitube/core/user"
	"github.com/aoiasakawa/aoitube/core/webhooks"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/notifications"
	"github.com/aoiasakawa/aoitube/utils"
	"github.com/aoiasakawa/aoitube/yp"
)

var (
	_stats       *models.Stats
	_storage     models.StorageProvider
	_transcoder  *transcoder.Transcoder
	_yp          *yp.YP
	_broadcaster *models.Broadcaster
	handler      transcoder.HLSHandler
	fileWriter   = transcoder.FileWriterReceiverService{}
)

// Start starts up the core processing.
func Start() error {
	resetDirectories()

	data.PopulateDefaults()

	if err := data.VerifySettings(); err != nil {
		log.Error(err)
		return err
	}

	if err := setupStats(); err != nil {
		log.Error("failed to setup the stats")
		return err
	}

	// The HLS handler takes the written HLS playlists and segments
	// and makes storage decisions.  It's rather simple right now
	// but will play more useful when recordings come into play.
	handler = transcoder.HLSHandler{}

	if err := setupStorage(); err != nil {
		log.Errorln("storage error", err)
	}

	// Wire recording's S3 offload. The factory is consulted at each session
	// finish/prune: it returns nil (keep local) when the operator hasn't
	// enabled S3 recording, or a fresh uploader built from the current S3
	// credentials otherwise. This keeps the recording package free of a
	// storageproviders import (which would cycle through the transcoder).
	recording.SetUploaderFactory(func() (recording.ArchiveUploader, error) {
		if !data.GetRecordingStoreOnS3() {
			return nil, nil
		}
		return storageproviders.NewArchiveS3()
	})

	// Wire the purchase lookup that shields sold archives from retention
	// pruning (same injection pattern, avoiding a recording→data import).
	recording.SetEntitlementChecker(func(archiveID string) bool {
		has, err := data.ArchiveHasAnyPurchase(archiveID)
		return err == nil && has
	})

	// Wire the lossless MP4 remux for finished recordings. -c copy over local
	// files is disk-bound (seconds), runs in recording's background finalize.
	recording.SetRemuxer(func(playlistPath, outputPath string) error {
		ffmpeg := utils.ValidatedFfmpegPath(data.GetFfMpegPath())
		cmd := exec.Command(ffmpeg, // nolint:gosec
			"-y", "-i", playlistPath, "-c", "copy", "-movflags", "+faststart", outputPath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("%w: %s", err, string(out))
		}
		return nil
	})

	user.SetupUsers()
	auth.Setup(data.GetDatastore())

	fileWriter.SetupFileWriterReceiverService(&handler)

	// Begin scheduled database backups (config, users, purchase entitlements).
	startBackupScheduler()

	if err := createInitialOfflineState(); err != nil {
		log.Error("failed to create the initial offline state")
		return err
	}

	_yp = yp.NewYP(GetStatus)

	if err := chat.Start(GetStatus); err != nil {
		log.Errorln(err)
	}

	// start the rtmp server
	go rtmp.Start(setStreamAsConnected, setBroadcaster)

	rtmpPort := data.GetRTMPPortNumber()
	log.Infof("RTMP is accepting inbound streams on port %d.", rtmpPort)

	// Log RTMPS status if enabled
	if data.GetRTMPSEnabled() {
		rtmpsPort := data.GetRTMPSPortNumber()
		log.Infof("RTMPS (encrypted) is accepting inbound streams on port %d.", rtmpsPort)
	}

	webhooks.InitWorkerPool()

	notifications.Setup(data.GetStore())

	return nil
}

func createInitialOfflineState() error {
	transitionToOfflineVideoStreamContent()

	return nil
}

// transitionToOfflineVideoStreamContent will overwrite the current stream with the
// offline video stream state only.  No live stream HLS segments will continue to be
// referenced.
func transitionToOfflineVideoStreamContent() {
	log.Traceln("Firing transcoder with offline stream state")

	_transcoder := transcoder.NewTranscoder()
	_transcoder.SetIdentifier("offline")
	_transcoder.SetLatencyLevel(models.GetLatencyLevel(4))
	_transcoder.SetIsEvent(true)

	offlineFilePath, err := saveOfflineClipToDisk("offline.ts")
	if err != nil {
		log.Fatalln("unable to save offline clip:", err)
	}

	_transcoder.SetInput(offlineFilePath)
	go _transcoder.Start()

	// Copy the logo to be the thumbnail
	logo := data.GetLogoPath()
	dst := filepath.Join(config.TempDir, "thumbnail.jpg")
	if err = utils.Copy(filepath.Join("data", logo), dst); err != nil {
		log.Warnln(err)
	}

	// Delete the preview Gif
	_ = os.Remove(path.Join(config.DataDirectory, "preview.gif"))
}

func resetDirectories() {
	log.Trace("Resetting file directories to a clean slate.")

	// Wipe hls data directory
	utils.CleanupDirectory(config.HLSStoragePath)

	// Remove the previous thumbnail
	logo := data.GetLogoPath()
	if utils.DoesFileExists(logo) {
		err := utils.Copy(path.Join("data", logo), filepath.Join(config.DataDirectory, "thumbnail.jpg"))
		if err != nil {
			log.Warnln(err)
		}
	}
}
