// Package recording captures a live broadcast into an on-disk VOD archive.
//
// Owncast serves LL-HLS with a rolling window (only the most recent segments
// stay in the live playlist), so a full recording cannot be produced by
// copying files at stream-stop time. Instead the recorder mirrors each
// variant's live playlist into a growing VOD playlist as segments are
// written, copying every referenced segment before the online cleanup timer
// can remove it, and finalizes the playlists (adds #EXT-X-ENDLIST) when the
// stream ends.
package recording

import (
	"bufio"
	cryptorand "crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/config"
	log "github.com/sirupsen/logrus"
)

// ArchiveBasePath is the directory recorded sessions are written to.
var ArchiveBasePath = filepath.Join(config.DataDirectory, "archives")

// minSessionSeconds is the least amount of recorded media a session must have
// to be kept; shorter sessions (broadcast blips, reconnect churn) are deleted
// on finish instead of becoming one-second junk archives.
const minSessionSeconds = 5

// Manifest describes a recorded session for listing and playback.
type Manifest struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	StartedAt  time.Time `json:"startedAt"`
	EndedAt    time.Time `json:"endedAt"`
	DurationS  int64     `json:"durationSeconds"`
	Variants   []int     `json:"variants"`
	Thumbnail  string    `json:"thumbnail,omitempty"`
	Visible    bool      `json:"visible"`
	FinishedOk bool      `json:"finishedOk"`
	// RemoteMedia is true when the session's media segments were offloaded to
	// S3 (local disk keeps only playlists/manifest/events/thumbnail). The
	// archive controller proxies segment requests from S3 for these sessions.
	RemoteMedia bool `json:"remoteMedia,omitempty"`
	// AccessMode controls who may view the archive:
	//   "" / "public"   — anyone (default, backward compatible)
	//   "authenticated" — any logged-in viewer
	//   "paid"          — only authenticated viewers who purchased it
	AccessMode string `json:"accessMode,omitempty"`
	// Price is the purchase price in the currency's smallest unit (yen for
	// JPY, cents for USD, ...) when AccessMode is "paid".
	Price int64 `json:"price,omitempty"`
	// Currency is the ISO currency code for Price (e.g. "JPY").
	Currency string `json:"currency,omitempty"`
	// Quality is a human label of the recorded rendition (e.g. "1080p60"),
	// captured from the broadcast settings when the session ends.
	Quality string `json:"quality,omitempty"`
	// Mp4 is the filename of the single-file progressive remux of the
	// recording ("replay.mp4"), created losslessly (-c copy) at finish.
	// Players prefer it over the HLS VOD playlist: VideoJS's VHS engine
	// mis-times fMP4 HLS VOD (constant A/V offset), while plain MP4 playback
	// is handled natively and stays in sync.
	Mp4 string `json:"mp4,omitempty"`
	// SizeBytes is the total size of the session's media files, captured at
	// finalize while everything is still local (it therefore also reflects
	// the session's S3 consumption after an offload). Zero on older
	// manifests; the admin listing backfills it lazily.
	SizeBytes int64 `json:"sizeBytes,omitempty"`
}

// Access mode values for Manifest.AccessMode.
const (
	AccessModePublic        = "public"
	AccessModeAuthenticated = "authenticated"
	AccessModePaid          = "paid"
)

// ArchiveUploader offloads recording media to remote object storage. It is an
// interface implemented in core/storageproviders and injected from the core
// package to avoid a recording -> storageproviders -> transcoder -> recording
// import cycle.
type ArchiveUploader interface {
	// Upload stores a local file at the given archive-relative path
	// ("<sessionID>/<variant>/<name>").
	Upload(localPath, archiveRelPath string) error
	// DeletePrefix removes every object for a session ("<sessionID>").
	DeletePrefix(sessionID string) error
}

// remuxer losslessly concatenates a finished session's HLS VOD into a single
// progressive MP4 (playlistPath -> outputPath). Injected from core (which
// knows the ffmpeg path) to keep this package free of transcoder imports.
var remuxer func(playlistPath, outputPath string) error

// SetRemuxer wires the MP4 remux implementation.
func SetRemuxer(f func(playlistPath, outputPath string) error) {
	remuxer = f
}

// uploaderFactory builds an ArchiveUploader on demand, or returns (nil, nil)
// when S3 recording offload is disabled, or an error when it is enabled but
// misconfigured. Wired by the core package; nil means "always local".
var uploaderFactory func() (ArchiveUploader, error)

// SetUploaderFactory wires the remote-storage backend for recordings.
func SetUploaderFactory(f func() (ArchiveUploader, error)) {
	uploaderFactory = f
}

// currentUploader resolves the uploader for this operation, or nil to keep
// recordings on local disk.
func currentUploader() ArchiveUploader {
	if uploaderFactory == nil {
		return nil
	}
	u, err := uploaderFactory()
	if err != nil {
		log.Warnln("recording: S3 offload unavailable, keeping recording on local disk:", err)
		return nil
	}
	return u
}

// isArchiveMediaFile reports whether a file is a media segment (offloaded to
// S3) rather than metadata (playlist/manifest/events/thumbnail, kept local).
func isArchiveMediaFile(name string) bool {
	switch filepath.Ext(name) {
	case ".m4s", ".ts", ".mp4":
		return true
	default:
		return false
	}
}

// variantRecorder tracks the archived state of a single quality variant.
type variantRecorder struct {
	index           int
	dir             string
	segmentDuration map[string]float64 // segment filename -> EXTINF duration
	order           []string           // segment filenames in playlist order
	initCopied      bool               // fMP4 EXT-X-MAP init copied
	initURI         string
	// skippedFirst is the first live segment of this variant, which is
	// deliberately NOT archived: at session start the muxer emits audio
	// immediately but video only from the first keyframe, so segment one
	// carries leading audio with no matching video. VOD players (VHS/MSE)
	// normalize each track's timeline to its own first sample, which turned
	// that lead into a constant audible A/V offset for the whole replay.
	// From the second segment on, both tracks start together.
	skippedFirst   string
	targetDuration int
	isFmp4         bool
}

// recordedEvent is a broadcast payload captured during a session, stamped
// with its offset from the stream start so it can be replayed in sync with
// VOD playback.
type recordedEvent struct {
	OffsetMs int64          `json:"offsetMs"`
	Payload  map[string]any `json:"payload"`
}

// Recorder is the process-wide recording session controller.
type Recorder struct {
	mu         sync.Mutex
	active     bool
	sessionID  string
	sessionDir string
	title      string
	startedAt  time.Time
	variants   map[int]*variantRecorder

	// eventsMu guards the captured chat/donation/effect event log separately
	// from the media state so recording an event never contends with segment
	// copying.
	// keepVariant limits recording to a single quality variant index; -1
	// records every variant. Archiving only the top quality keeps VOD size
	// (and S3 cost) to a fraction without touching live distribution.
	keepVariant int
	// quality is the human rendition label written into the manifest.
	quality string

	eventsMu sync.Mutex
	events   []recordedEvent
}

var recorder = &Recorder{variants: map[int]*variantRecorder{}}

// Get returns the singleton recorder.
func Get() *Recorder {
	return recorder
}

// randomIDSuffix returns 8 crypto-random base36 characters for session IDs.
func randomIDSuffix() string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 8)
	if _, err := cryptorand.Read(b); err != nil {
		// Extremely unlikely; fall back to a time-derived suffix rather than
		// failing the recording session.
		return fmt.Sprintf("%08x", time.Now().UnixNano()&0xffffffff)
	}
	for i, v := range b {
		b[i] = alphabet[int(v)%len(alphabet)]
	}
	return string(b)
}

// SetQuality records the human rendition label (e.g. "1080p60") for the
// active session's manifest. Called at disconnect time, when passthrough
// streams' inbound dimensions are known.
func (r *Recorder) SetQuality(quality string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.active {
		r.quality = quality
	}
}

// StartSession begins recording a new broadcast. It is a no-op if a session
// is already active. The session ID is the start time plus a random suffix so
// archives sort chronologically, never collide, and can't be enumerated.
func (r *Recorder) StartSession(title string, keepVariant int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.active {
		return
	}
	r.keepVariant = keepVariant

	now := time.Now()
	// Timestamp prefix keeps directories chronologically sortable (pruning
	// relies on lexical order); the random suffix makes session IDs — which
	// appear in public URLs — unguessable, so hidden/unpublished recordings
	// can't be enumerated from the broadcast schedule.
	id := now.Format("20060102-150405") + "-" + randomIDSuffix()
	dir := filepath.Join(ArchiveBasePath, id)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		log.Errorln("recording: unable to create archive directory:", err)
		return
	}

	r.active = true
	r.sessionID = id
	r.sessionDir = dir
	r.title = title
	r.startedAt = now
	r.variants = map[int]*variantRecorder{}

	r.eventsMu.Lock()
	r.events = nil
	r.eventsMu.Unlock()

	log.Infoln("recording: started archive session", id)
}

// RecordEvent captures a broadcast payload (chat message, Super Chat, screen
// effect, join/part, etc.) into the active session's replay log. It is a
// cheap no-op when no session is recording. Only replay-relevant event types
// are kept to keep the log small.
func (r *Recorder) RecordEvent(payload map[string]any) {
	r.mu.Lock()
	active := r.active
	startedAt := r.startedAt
	r.mu.Unlock()
	if !active {
		return
	}

	t, _ := payload["type"].(string)
	if !replayableEventTypes[t] {
		return
	}

	r.eventsMu.Lock()
	r.events = append(r.events, recordedEvent{
		OffsetMs: time.Since(startedAt).Milliseconds(),
		Payload:  payload,
	})
	r.eventsMu.Unlock()
}

// replayableEventTypes are the broadcast event types worth recording for VOD
// replay. Transient/system types (PING, connected-client-info) are skipped.
var replayableEventTypes = map[string]bool{
	"CHAT":                        true,
	"NAME_CHANGE":                 true,
	"USER_JOINED":                 true,
	"USER_PARTED":                 true,
	"CHAT_ACTION":                 true,
	"SYSTEM":                      true,
	"DONATION":                    true,
	"FEDIVERSE_ENGAGEMENT_FOLLOW": true,
	"FEDIVERSE_ENGAGEMENT_LIKE":   true,
	"FEDIVERSE_ENGAGEMENT_REPOST": true,
}

// IsActive reports whether a session is currently recording.
func (r *Recorder) IsActive() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.active
}

// HandleVariantPlaylist mirrors newly-written live playlist segments into the
// session's VOD playlist. livePlaylistPath is a variant's stream.m3u8 on disk
// (e.g. data/hls/0/stream.m3u8).
func (r *Recorder) HandleVariantPlaylist(livePlaylistPath string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.active {
		return
	}

	variantIndex, err := variantIndexFromPath(livePlaylistPath)
	if err != nil {
		return
	}
	if r.keepVariant >= 0 && variantIndex != r.keepVariant {
		return
	}

	v := r.variants[variantIndex]
	if v == nil {
		v = &variantRecorder{
			index:           variantIndex,
			dir:             filepath.Join(r.sessionDir, strconv.Itoa(variantIndex)),
			segmentDuration: map[string]float64{},
		}
		if err := os.MkdirAll(v.dir, 0o750); err != nil {
			log.Errorln("recording: unable to create variant directory:", err)
			return
		}
		r.variants[variantIndex] = v
	}

	liveDir := filepath.Dir(livePlaylistPath)
	entries, mapURI, targetDuration, isFmp4 := parseLivePlaylist(livePlaylistPath)
	v.isFmp4 = isFmp4
	if targetDuration > v.targetDuration {
		v.targetDuration = targetDuration
	}

	// Copy the fMP4 init segment once. Older ffmpeg (<5.1.7) leaves the %v
	// variant placeholder unexpanded in the init filename; '%' is an invalid
	// URL escape that Go's HTTP server rejects with 400, so the archived copy
	// gets a sanitized name.
	if isFmp4 && mapURI != "" && !v.initCopied {
		destName := mapURI
		if strings.Contains(destName, "%") {
			destName = fmt.Sprintf("init-%d.mp4", v.index)
		}
		if err := copyFile(filepath.Join(liveDir, mapURI), filepath.Join(v.dir, destName)); err == nil {
			v.initCopied = true
			v.initURI = destName
		}
	}

	// Register any segments we have not seen yet, preserving playlist order.
	// Segment bytes are normally copied by HandleSegmentWritten the moment
	// ffmpeg finishes writing them; the copy here is only a fallback for
	// segments that appeared in the playlist without a segment event.
	for _, e := range entries {
		if _, seen := v.segmentDuration[e.filename]; seen {
			continue
		}
		// Never archive the offline-clip transcoder's segments (see the matching
		// guard in HandleSegmentWritten): a broadcaster reconnecting within the
		// post-boot offline window would otherwise splice the placeholder clip
		// into the recording.
		if strings.Contains(e.filename, "-offline-") {
			continue
		}
		if v.skippedFirst == "" && len(v.order) == 0 {
			// Drop the session's first segment (see skippedFirst above).
			v.skippedFirst = e.filename
			continue
		}
		if e.filename == v.skippedFirst {
			continue
		}
		dst := filepath.Join(v.dir, e.filename)
		if _, err := os.Stat(dst); err != nil {
			src := filepath.Join(liveDir, e.filename)
			if err := copyFile(src, dst); err != nil {
				// The segment may have been rotated out already; skip it.
				continue
			}
		}
		v.segmentDuration[e.filename] = e.duration
		v.order = append(v.order, e.filename)
	}

	r.writeVariantVOD(v, false)
}

// HandleSegmentWritten copies a just-finished live segment into the recording
// session. It fires on the transcoder's segment-written event — after the
// file's bytes are fully on disk — and always overwrites, so a segment that
// ffmpeg re-uploads (PUT retry truncates and rewrites the file in place) ends
// up complete in the archive. Copying only from the playlist handler raced
// those rewrites and produced corrupt archived segments.
func (r *Recorder) HandleSegmentWritten(localFilePath string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.active {
		return
	}

	variantIndex, err := variantIndexFromPath(localFilePath)
	if err != nil {
		return
	}
	if r.keepVariant >= 0 && variantIndex != r.keepVariant {
		return
	}

	name := filepath.Base(localFilePath)
	// Init segments are handled via the playlist's EXT-X-MAP.
	if strings.HasPrefix(name, "init-") {
		return
	}
	// Never record the offline-clip transcoder's output. It runs for ~10s
	// after every server boot, so a broadcaster (re)connecting within that
	// window would otherwise get its MPEG-TS segment spliced into the fMP4
	// recording — which truncated the -c copy replay.mp4 at the container
	// switch (a 7-minute archive played as 4 seconds).
	if strings.Contains(name, "-offline-") {
		return
	}
	if v0 := r.variants[variantIndex]; v0 != nil {
		if v0.skippedFirst == "" && len(v0.order) == 0 && len(v0.segmentDuration) == 0 {
			v0.skippedFirst = name
			return
		}
		if name == v0.skippedFirst {
			return
		}
	}

	v := r.variants[variantIndex]
	if v == nil {
		v = &variantRecorder{
			index:           variantIndex,
			dir:             filepath.Join(r.sessionDir, strconv.Itoa(variantIndex)),
			segmentDuration: map[string]float64{},
		}
		if err := os.MkdirAll(v.dir, 0o750); err != nil {
			log.Errorln("recording: unable to create variant directory:", err)
			return
		}
		r.variants[variantIndex] = v
	}

	if err := copyFile(localFilePath, filepath.Join(v.dir, name)); err != nil {
		log.Debugln("recording: unable to copy segment:", err)
	}
}

// FinishSession finalizes all variant playlists with #EXT-X-ENDLIST, writes
// the master playlist and the session manifest, and clears session state.
func (r *Recorder) FinishSession(visible bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.active {
		return
	}
	r.active = false

	// Broadcast blips (encoder crash loops, instant OBS reconnects) produce
	// sessions of a few seconds at most. Keeping them floods the archive list
	// with useless entries — one reconnect burst generated dozens of
	// one-second archives — so anything below the minimum is discarded whole.
	var recordedSeconds float64
	for _, v := range r.variants {
		var sum float64
		for _, d := range v.segmentDuration {
			sum += d
		}
		if sum > recordedSeconds {
			recordedSeconds = sum
		}
	}
	if recordedSeconds < minSessionSeconds {
		log.Infof("recording: discarding archive session %s (%.1fs of media is below the %ds minimum)", r.sessionID, recordedSeconds, minSessionSeconds)
		if r.sessionDir != "" {
			if err := os.RemoveAll(r.sessionDir); err != nil {
				log.Errorln("recording: unable to remove short session:", err)
			}
		}
		r.variants = map[int]*variantRecorder{}
		return
	}

	variantIndexes := make([]int, 0, len(r.variants))
	for _, v := range r.variants {
		r.writeVariantVOD(v, true)
		variantIndexes = append(variantIndexes, v.index)
	}

	r.writeMasterPlaylist()
	r.writeEvents()

	// Snapshot the live thumbnail (regenerated every ~20s during the
	// broadcast) into the session so the archive list can show a preview.
	thumbnail := ""
	liveThumbnail := filepath.Join(config.TempDir, "thumbnail.jpg")
	if _, err := os.Stat(liveThumbnail); err == nil {
		if err := copyFile(liveThumbnail, filepath.Join(r.sessionDir, "thumbnail.jpg")); err == nil {
			thumbnail = "thumbnail.jpg"
		} else {
			log.Debugln("recording: unable to copy session thumbnail:", err)
		}
	}

	// The manifest is written before any S3 offload (RemoteMedia false) so the
	// archive is immediately complete and playable from local disk; a
	// successful background offload flips RemoteMedia afterwards.
	endedAt := time.Now()
	manifest := Manifest{
		ID:         r.sessionID,
		Title:      r.title,
		StartedAt:  r.startedAt,
		EndedAt:    endedAt,
		DurationS:  int64(endedAt.Sub(r.startedAt).Seconds()),
		Variants:   variantIndexes,
		Thumbnail:  thumbnail,
		Visible:    visible,
		FinishedOk: len(variantIndexes) > 0,
		Quality:    r.quality,
	}
	if err := WriteManifest(r.sessionID, manifest); err != nil {
		log.Errorln("recording: unable to write manifest:", err)
	}

	log.Infoln("recording: finished archive session", r.sessionID)

	sessionID := r.sessionID
	sessionDir := r.sessionDir
	r.variants = map[int]*variantRecorder{}

	// Finalize media in the background, outside the recorder lock: first the
	// lossless MP4 remux (players prefer it over the HLS VOD), then the S3
	// offload. Nothing here may run inline — this method runs inside the
	// stream-disconnect path (including the transcoder-completed callback);
	// doing storage work while holding r.mu once deadlocked the whole stream.
	go finalizeSessionMedia(sessionID, sessionDir)
}

// finalizeSessionMedia remuxes the finished session into replay.mp4 and then
// offloads the media to S3 when enabled.
func finalizeSessionMedia(sessionID, sessionDir string) {
	if remuxer != nil {
		// Remux the highest (usually only) recorded variant.
		if m, ok := ReadManifest(sessionID); ok && len(m.Variants) > 0 {
			playlist := filepath.Join(sessionDir, strconv.Itoa(m.Variants[0]), "stream.m3u8")
			output := filepath.Join(sessionDir, "replay.mp4")
			if err := remuxer(playlist, output); err != nil {
				log.Warnln("recording: MP4 remux failed, replay will use the HLS playlist:", err)
			} else {
				m.Mp4 = "replay.mp4"
				if err := WriteManifest(sessionID, m); err != nil {
					log.Errorln("recording: unable to record replay.mp4 in manifest:", err)
				}
				log.Infoln("recording: wrote single-file replay.mp4 for session", sessionID)
			}
		}
	}

	// Record the total media size while everything is still local — after an
	// S3 offload this equals the session's remote storage consumption.
	if m, ok := ReadManifest(sessionID); ok {
		if size := SessionSizeBytes(sessionID); size > 0 {
			m.SizeBytes = size
			if err := WriteManifest(sessionID, m); err != nil {
				log.Errorln("recording: unable to record session size in manifest:", err)
			}
		}
	}

	if uploader := currentUploader(); uploader != nil {
		offloadSessionToS3(sessionID, sessionDir, uploader)
	}
}

// SessionSizeBytes walks a session's directory and returns the total size of
// its files. Returns 0 when the session directory can't be read.
func SessionSizeBytes(sessionID string) int64 {
	var total int64
	root := filepath.Join(ArchiveBasePath, sessionID)
	_ = filepath.WalkDir(root, func(_ string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil // nolint:nilerr
		}
		if info, err := d.Info(); err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}

// WriteManifest persists a session manifest into the session directory.
func WriteManifest(sessionID string, m Manifest) error {
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	manifestPath := filepath.Join(ArchiveBasePath, sessionID, "manifest.json")
	return os.WriteFile(manifestPath, b, 0o640)
}

// offloadSessionToS3 moves a finished session's media to S3 and then marks the
// manifest as remote. Runs from the background finalize goroutine: on failure
// the media simply stays local and the recording remains playable.
func offloadSessionToS3(sessionID, sessionDir string, uploader ArchiveUploader) {
	if err := offloadMediaDir(sessionID, sessionDir, uploader); err != nil {
		log.Warnln("recording: S3 offload failed, keeping recording on local disk:", err)
		return
	}
	// Media now lives in the bucket: flip the manifest so playback proxies
	// from S3. An admin visibility/pricing edit racing this write is a
	// single-JSON-file last-writer-wins with a tiny window; acceptable.
	if m, ok := ReadManifest(sessionID); ok {
		m.RemoteMedia = true
		if err := WriteManifest(sessionID, m); err != nil {
			log.Errorln("recording: unable to update manifest after S3 offload:", err)
		}
	}
}

// offloadUploadWorkers bounds concurrent S3 uploads during an offload. LL-HLS
// sessions produce one small segment per second, so long broadcasts mean many
// thousands of objects; parallel PUTs keep the (background) offload from
// taking hours while still limiting connection pressure.
const offloadUploadWorkers = 8

// offloadMediaDir uploads every media segment of a finished session to S3,
// deleting the local copies only after every upload succeeded. Playlists,
// manifest, events and thumbnail are left on local disk. If any upload fails
// it rolls back the uploaded objects and leaves all local media in place (the
// recording stays fully local and playable).
func offloadMediaDir(sessionID, sessionDir string, uploader ArchiveUploader) error {
	var files []string
	walkErr := filepath.Walk(sessionDir, func(localPath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !isArchiveMediaFile(info.Name()) {
			return nil
		}
		files = append(files, localPath)
		return nil
	})
	if walkErr == nil {
		walkErr = uploadArchiveFiles(files, uploader)
	}
	if walkErr != nil {
		// Roll back: remove whatever we already put in S3 so a retry (or local
		// fallback) starts clean; local files are untouched on failure.
		if err := uploader.DeletePrefix(sessionID); err != nil {
			log.Debugln("recording: unable to clean up partial S3 offload:", err)
		}
		return walkErr
	}

	// All uploads succeeded — now remove the local media copies.
	for _, localPath := range files {
		if err := os.Remove(localPath); err != nil {
			log.Debugln("recording: unable to remove offloaded local segment:", err)
		}
	}
	log.Infof("recording: offloaded %d media segments of session %s to S3", len(files), sessionID)
	return nil
}

// uploadArchiveFiles uploads the given local files with bounded concurrency,
// stopping the dispatch of new uploads after the first failure.
func uploadArchiveFiles(files []string, uploader ArchiveUploader) error {
	sem := make(chan struct{}, offloadUploadWorkers)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error

	for _, localPath := range files {
		mu.Lock()
		failed := firstErr != nil
		mu.Unlock()
		if failed {
			break
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(p string) {
			defer wg.Done()
			defer func() { <-sem }()
			rel, err := filepath.Rel(ArchiveBasePath, p)
			if err == nil {
				// Use forward slashes for the S3 key regardless of host OS.
				archiveRelPath := filepath.ToSlash(rel)
				if uploadErr := uploader.Upload(p, archiveRelPath); uploadErr != nil {
					err = fmt.Errorf("upload %s: %w", archiveRelPath, uploadErr)
				}
			}
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
			}
		}(localPath)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	return firstErr
}

// entitlementChecker reports whether an archive has any recorded purchase.
// Injected from core (like SetUploaderFactory) to avoid an import cycle with
// the data layer.
var entitlementChecker func(archiveID string) bool

// SetEntitlementChecker wires the purchase lookup used to protect archives
// from retention pruning.
func SetEntitlementChecker(f func(archiveID string) bool) {
	entitlementChecker = f
}

// isPrunable reports whether retention may delete this session. Retention
// only cleans up unattended recordings: everything the operator curated —
// published, members-only or paid archives — and anything that was ever
// purchased (even if its access mode changed later) is exempt. Manifest-less
// orphan directories are prunable junk.
func isPrunable(sessionID string) bool {
	m, ok := ReadManifest(sessionID)
	if !ok {
		return true
	}
	if m.Visible || m.AccessMode == AccessModePaid || m.AccessMode == AccessModeAuthenticated {
		return false
	}
	if entitlementChecker != nil && entitlementChecker(m.ID) {
		return false
	}
	return true
}

// PruneOldSessions deletes the oldest prunable recorded sessions so that at
// most keepCount of them remain. keepCount <= 0 disables pruning entirely.
// Exempt sessions (see isPrunable) are never deleted and don't consume
// retention slots.
func PruneOldSessions(keepCount int) {
	if keepCount <= 0 {
		return
	}

	entries, err := os.ReadDir(ArchiveBasePath)
	if err != nil {
		return
	}

	// Session directory names are timestamps, so lexical sort is chronological.
	dirs := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() || !isPrunable(e.Name()) {
			continue
		}
		dirs = append(dirs, e.Name())
	}
	if len(dirs) <= keepCount {
		return
	}
	sort.Strings(dirs)

	uploader := currentUploader()
	for _, name := range dirs[:len(dirs)-keepCount] {
		DeleteRemoteMedia(name, uploader)
		if err := os.RemoveAll(filepath.Join(ArchiveBasePath, name)); err != nil {
			log.Warnln("recording: unable to prune old archive:", err)
			continue
		}
		log.Infoln("recording: pruned old archive", name)
	}
}

// DeleteRemoteMedia removes a session's offloaded media from S3 when the
// session was stored remotely. Safe to call with a nil uploader or on a
// local-only session (no-op). Exposed so the admin delete endpoint can purge
// S3 objects alongside the local directory.
func DeleteRemoteMedia(sessionID string, uploader ArchiveUploader) {
	if uploader == nil || sessionID == "" {
		return
	}
	// Only sessions whose manifest says the media is remote have S3 objects.
	if m, ok := ReadManifest(sessionID); !ok || !m.RemoteMedia {
		return
	}
	if err := uploader.DeletePrefix(sessionID); err != nil {
		log.Warnln("recording: unable to delete S3 archive objects for", sessionID, err)
	}
}

// ReadManifest loads a session's manifest from local disk. The second return
// value is false when the manifest is missing or unreadable.
func ReadManifest(sessionID string) (Manifest, bool) {
	var m Manifest
	if sessionID == "" || strings.ContainsAny(sessionID, "/\\") {
		return m, false
	}
	b, err := os.ReadFile(filepath.Join(ArchiveBasePath, sessionID, "manifest.json")) // nolint:gosec
	if err != nil {
		return m, false
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, false
	}
	return m, true
}

// NewUploader builds an ArchiveUploader via the wired factory, or nil when
// offload is disabled/unavailable. Used by callers outside recording (e.g. the
// admin delete endpoint) that need to purge S3 objects.
func NewUploader() ArchiveUploader {
	return currentUploader()
}

// writeVariantVOD writes the VOD playlist for a variant from the archived
// segments collected so far. When final is true it appends #EXT-X-ENDLIST.
func (r *Recorder) writeVariantVOD(v *variantRecorder, final bool) {
	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	version := 3
	if v.isFmp4 {
		version = 7
	}
	fmt.Fprintf(&b, "#EXT-X-VERSION:%d\n", version)
	td := v.targetDuration
	if td == 0 {
		td = 1
	}
	fmt.Fprintf(&b, "#EXT-X-TARGETDURATION:%d\n", td)
	b.WriteString("#EXT-X-PLAYLIST-TYPE:VOD\n")
	b.WriteString("#EXT-X-MEDIA-SEQUENCE:0\n")
	if v.isFmp4 && v.initURI != "" {
		fmt.Fprintf(&b, "#EXT-X-MAP:URI=\"%s\"\n", v.initURI)
	}
	for _, name := range v.order {
		fmt.Fprintf(&b, "#EXTINF:%.6f,\n%s\n", v.segmentDuration[name], name)
	}
	if final {
		b.WriteString("#EXT-X-ENDLIST\n")
	}

	playlistPath := filepath.Join(v.dir, "stream.m3u8")
	if err := os.WriteFile(playlistPath, []byte(b.String()), 0o640); err != nil {
		log.Errorln("recording: unable to write variant VOD playlist:", err)
	}
}

// writeEvents persists the captured replay event log as newline-delimited
// JSON, ordered by offset.
func (r *Recorder) writeEvents() {
	r.eventsMu.Lock()
	events := r.events
	r.events = nil
	r.eventsMu.Unlock()

	if len(events) == 0 {
		return
	}

	var b strings.Builder
	for _, e := range events {
		line, err := json.Marshal(e)
		if err != nil {
			continue
		}
		b.Write(line)
		b.WriteByte('\n')
	}

	path := filepath.Join(r.sessionDir, "events.jsonl")
	if err := os.WriteFile(path, []byte(b.String()), 0o640); err != nil {
		log.Errorln("recording: unable to write events log:", err)
	}
}

// writeMasterPlaylist writes a simple master playlist referencing each
// recorded variant.
func (r *Recorder) writeMasterPlaylist() {
	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	for _, v := range r.variants {
		// Bandwidth is unknown here; a nominal value keeps players happy and
		// higher indexes imply lower quality in Owncast's ordering.
		bandwidth := max(800000-v.index*100000, 100000)
		fmt.Fprintf(&b, "#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=%d\n%d/stream.m3u8\n", bandwidth, v.index)
	}
	if err := os.WriteFile(filepath.Join(r.sessionDir, "stream.m3u8"), []byte(b.String()), 0o640); err != nil {
		log.Errorln("recording: unable to write master playlist:", err)
	}
}

type playlistEntry struct {
	filename string
	duration float64
}

// parseLivePlaylist extracts segment entries, the fMP4 init URI, the target
// duration, and whether the playlist is fMP4 from a live variant playlist.
func parseLivePlaylist(path string) (entries []playlistEntry, mapURI string, targetDuration int, isFmp4 bool) {
	f, err := os.Open(path) // nolint:gosec
	if err != nil {
		return nil, "", 0, false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var pendingDuration float64
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		switch {
		case strings.HasPrefix(line, "#EXT-X-TARGETDURATION:"):
			if d, err := strconv.Atoi(strings.TrimPrefix(line, "#EXT-X-TARGETDURATION:")); err == nil {
				targetDuration = d
			}
		case strings.HasPrefix(line, "#EXT-X-MAP:"):
			isFmp4 = true
			mapURI = extractURI(line)
		case strings.HasPrefix(line, "#EXTINF:"):
			val := strings.TrimPrefix(line, "#EXTINF:")
			val = strings.TrimSuffix(strings.TrimSpace(val), ",")
			val = strings.TrimSuffix(val, ",")
			if d, err := strconv.ParseFloat(strings.TrimSuffix(val, ","), 64); err == nil {
				pendingDuration = d
			}
		case line == "" || strings.HasPrefix(line, "#"):
			// Skip blank lines and other tags.
		default:
			// A segment filename.
			if strings.HasSuffix(line, ".m4s") {
				isFmp4 = true
			}
			entries = append(entries, playlistEntry{filename: line, duration: pendingDuration})
			pendingDuration = 0
		}
	}
	if err := scanner.Err(); err != nil {
		log.Warnln("recording: error reading live playlist:", err)
	}
	return entries, mapURI, targetDuration, isFmp4
}

func extractURI(line string) string {
	_, after, found := strings.Cut(line, "URI=\"")
	if !found {
		return ""
	}
	uri, _, found := strings.Cut(after, "\"")
	if !found {
		return ""
	}
	return uri
}

// variantIndexFromPath returns the integer variant index from a live playlist
// path such as data/hls/2/stream.m3u8.
func variantIndexFromPath(playlistPath string) (int, error) {
	dir := filepath.Base(filepath.Dir(playlistPath))
	return strconv.Atoi(dir)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src) // nolint:gosec
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst) // nolint:gosec
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
