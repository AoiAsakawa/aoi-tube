package core

import (
	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/core/recording"
)

// Shutdown saves what would otherwise be lost when the process stops. It is
// called on SIGINT/SIGTERM, right before the process exits, and has to return
// quickly: it only does local disk work.
//
// A recording in progress is closed into a playable archive. Its MP4 remux and
// S3 offload are left for the next start, which picks them up in
// recording.RecoverInterruptedSessions.
func Shutdown() {
	rec := recording.Get()
	if !rec.IsActive() {
		return
	}

	log.Infoln("Stopping during a broadcast: finalizing the recording before exit.")
	rec.SetQuality(recordedQualityLabel())
	rec.FinishSessionForShutdown()
}
