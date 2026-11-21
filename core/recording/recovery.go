package recording

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"time"

	log "github.com/sirupsen/logrus"
)

// sessionIDTimeLayout is the timestamp a session ID starts with.
const sessionIDTimeLayout = "20060102-150405"

// sessionIDPattern matches the directory names StartSession creates. Startup
// recovery only ever touches directories that look like one, so anything else
// an operator keeps under the archive directory is left alone.
var sessionIDPattern = regexp.MustCompile(`^[0-9]{8}-[0-9]{6}(-[0-9a-z]+)?$`)

// RecoverInterruptedSessions repairs recordings that a previous run of the
// server left unfinished, so stopping the server in the middle of a broadcast
// (a deploy, a crash, a reboot) doesn't cost the recording.
//
// Two kinds of leftovers exist:
//
//   - A session directory without a manifest: the process died before
//     FinishSession ran. Its variant playlists are closed, a manifest is
//     written from what is on disk, and it becomes a hidden archive marked
//     Recovered. A session with less than minSessionSeconds of media is
//     removed, as FinishSession would have done.
//   - A manifest that still has PendingMedia set: the session was finished
//     (possibly by FinishSessionForShutdown) but the MP4 remux and the S3
//     offload never completed. They are run again.
//
// It must be called once at startup, before the ingest can begin a new
// session, because every manifest-less session directory is taken to be
// abandoned. Playlists and manifests are written before it returns; the remux
// and the offload then run in the background, one session at a time.
func RecoverInterruptedSessions() {
	pending := recoverSessions()
	if len(pending) == 0 {
		return
	}
	go finalizePendingSessions(pending)
}

// recoverSessions is the synchronous part of RecoverInterruptedSessions. It
// returns the IDs of the sessions whose media still has to be post-processed,
// oldest first.
func recoverSessions() []string {
	entries, err := os.ReadDir(ArchiveBasePath)
	if err != nil {
		// Nothing has been recorded yet.
		return nil
	}
	activeID := recorder.activeSessionID()

	var pending []string
	for _, e := range entries {
		id := e.Name()
		if !e.IsDir() || !sessionIDPattern.MatchString(id) || id == activeID {
			continue
		}
		if m, ok := ReadManifest(id); ok {
			if m.PendingMedia {
				pending = append(pending, id)
			}
			continue
		}
		if recoverSession(id) {
			pending = append(pending, id)
		}
	}
	// Session IDs start with their timestamp, so this is chronological.
	sort.Strings(pending)
	return pending
}

// finalizePendingSessions runs the media post-processing for each session in
// turn. One at a time keeps a restart with several leftovers from loading the
// disk with parallel remuxes while a new broadcast may already be starting.
func finalizePendingSessions(sessionIDs []string) {
	for _, id := range sessionIDs {
		finalizeSessionMedia(id, filepath.Join(ArchiveBasePath, id))
	}
}

// recoverSession turns one manifest-less session directory into an archive.
// It reports whether the session was kept and now needs its media
// post-processed.
func recoverSession(sessionID string) bool {
	sessionDir := filepath.Join(ArchiveBasePath, sessionID)

	// A manifest that exists but can't be read is not ours to replace: it may
	// hold visibility and pricing that can't be rebuilt from the media.
	if _, err := os.Stat(filepath.Join(sessionDir, "manifest.json")); err == nil {
		log.Warnf("recording: session %s has an unreadable manifest, leaving it untouched", sessionID)
		return false
	}

	variants, lastWrite := readRecordedVariants(sessionDir)
	var recordedSeconds float64
	for _, v := range variants {
		var sum float64
		for _, d := range v.segmentDuration {
			sum += d
		}
		if sum > recordedSeconds {
			recordedSeconds = sum
		}
	}
	if recordedSeconds < minSessionSeconds {
		log.Infof("recording: discarding interrupted session %s (%.1fs of media is below the %ds minimum)", sessionID, recordedSeconds, minSessionSeconds)
		if err := os.RemoveAll(sessionDir); err != nil {
			log.Errorln("recording: unable to remove interrupted session:", err)
		}
		return false
	}

	indexes := make([]int, 0, len(variants))
	for _, v := range variants {
		writeVariantVODFile(v, true)
		indexes = append(indexes, v.index)
	}
	writeMasterPlaylistFile(sessionDir, indexes)

	info := readSessionInfo(sessionDir, sessionID)
	endedAt := lastWrite
	startedAt := info.StartedAt
	if startedAt.IsZero() || startedAt.After(endedAt) {
		startedAt = endedAt.Add(-time.Duration(recordedSeconds * float64(time.Second)))
	}

	manifest := Manifest{
		ID:           sessionID,
		Title:        info.Title,
		StartedAt:    startedAt,
		EndedAt:      endedAt,
		DurationS:    int64(endedAt.Sub(startedAt).Seconds()),
		Variants:     indexes,
		Visible:      false,
		FinishedOk:   true,
		PendingMedia: true,
		Recovered:    true,
	}
	if err := WriteManifest(sessionID, manifest); err != nil {
		log.Errorln("recording: unable to write the manifest of an interrupted session:", err)
		return false
	}
	_ = os.Remove(filepath.Join(sessionDir, sessionInfoFile))

	log.Infof("recording: recovered interrupted session %s (%.0fs of media)", sessionID, recordedSeconds)
	return true
}

// readRecordedVariants rebuilds the recorder's view of a session from disk:
// one variantRecorder per numbered sub-directory, listing the segments its VOD
// playlist names that are actually present. Variants are returned in index
// order, together with the time the newest of those segments was written.
func readRecordedVariants(sessionDir string) ([]*variantRecorder, time.Time) {
	var variants []*variantRecorder
	var lastWrite time.Time

	entries, err := os.ReadDir(sessionDir)
	if err != nil {
		return nil, lastWrite
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		index, err := strconv.Atoi(e.Name())
		if err != nil || index < 0 {
			continue
		}

		dir := filepath.Join(sessionDir, e.Name())
		segments, mapURI, targetDuration, isFmp4 := parseLivePlaylist(filepath.Join(dir, "stream.m3u8"))
		v := &variantRecorder{
			index:           index,
			dir:             dir,
			segmentDuration: map[string]float64{},
			targetDuration:  targetDuration,
			isFmp4:          isFmp4,
		}
		if mapURI != "" && filepath.Base(mapURI) == mapURI {
			v.initURI = mapURI
			v.initCopied = true
		}
		for _, s := range segments {
			// The playlist is our own, but only ever follow plain file names.
			if filepath.Base(s.filename) != s.filename {
				continue
			}
			if _, seen := v.segmentDuration[s.filename]; seen {
				continue
			}
			info, err := os.Stat(filepath.Join(dir, s.filename))
			if err != nil || info.IsDir() || info.Size() == 0 {
				// Named in the playlist but never fully written.
				continue
			}
			v.segmentDuration[s.filename] = s.duration
			v.order = append(v.order, s.filename)
			if info.ModTime().After(lastWrite) {
				lastWrite = info.ModTime()
			}
		}
		if len(v.order) > 0 {
			variants = append(variants, v)
		}
	}

	sort.Slice(variants, func(i, j int) bool { return variants[i].index < variants[j].index })
	return variants, lastWrite
}

// readSessionInfo returns the title and start time StartSession stored for a
// session. A session recorded before the info file existed has no title, and
// its start time is taken from the timestamp its ID begins with.
func readSessionInfo(sessionDir, sessionID string) sessionInfo {
	var info sessionInfo
	if b, err := os.ReadFile(filepath.Join(sessionDir, sessionInfoFile)); err == nil { // nolint:gosec
		if err := json.Unmarshal(b, &info); err != nil {
			info = sessionInfo{}
		}
	}
	if info.StartedAt.IsZero() && len(sessionID) >= len(sessionIDTimeLayout) {
		if t, err := time.ParseInLocation(sessionIDTimeLayout, sessionID[:len(sessionIDTimeLayout)], time.Local); err == nil {
			info.StartedAt = t
		}
	}
	return info
}
