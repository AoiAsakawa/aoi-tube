package recording

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// useTempArchive points the package at a throwaway archive directory and
// unwires the injected remuxer and uploader for the duration of a test.
func useTempArchive(t *testing.T) {
	t.Helper()
	origBase, origRemuxer, origFactory, origBlocker := ArchiveBasePath, remuxer, uploaderFactory, offloadBlocker
	ArchiveBasePath = t.TempDir()
	remuxer = nil
	uploaderFactory = nil
	offloadBlocker = nil
	t.Cleanup(func() {
		ArchiveBasePath, remuxer, uploaderFactory, offloadBlocker = origBase, origRemuxer, origFactory, origBlocker
	})
}

// remuxCalls records the playlists the stub remuxer was asked to remux.
type remuxCalls struct {
	mu        sync.Mutex
	playlists []string
}

func (c *remuxCalls) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.playlists)
}

// stubRemuxer wires a remuxer that writes a placeholder replay.mp4. Call it
// after useTempArchive, which restores the original on cleanup.
func stubRemuxer() *remuxCalls {
	calls := &remuxCalls{}
	remuxer = func(playlistPath, outputPath string) error {
		calls.mu.Lock()
		calls.playlists = append(calls.playlists, playlistPath)
		calls.mu.Unlock()
		return os.WriteFile(outputPath, []byte("mp4"), 0o600)
	}
	return calls
}

// writeInterruptedSession lays out a session directory the way the recorder
// leaves it while a broadcast is running: a growing variant playlist without
// #EXT-X-ENDLIST and the one-second segments it names. It returns the session
// directory.
func writeInterruptedSession(t *testing.T, sessionID string, segments int) string {
	t.Helper()
	variantDir := filepath.Join(ArchiveBasePath, sessionID, "0")
	if err := os.MkdirAll(variantDir, 0o750); err != nil {
		t.Fatal(err)
	}

	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MEDIA-SEQUENCE:0\n")
	for i := 0; i < segments; i++ {
		name := fmt.Sprintf("stream-abc-%d.ts", i)
		fmt.Fprintf(&b, "#EXTINF:1.000000,\n%s\n", name)
		writeTestFile(t, filepath.Join(variantDir, name), "segment")
	}
	writeTestFile(t, filepath.Join(variantDir, "stream.m3u8"), b.String())
	return filepath.Dir(variantDir)
}

func mustReadManifest(t *testing.T, sessionID string) Manifest {
	t.Helper()
	m, ok := ReadManifest(sessionID)
	if !ok {
		t.Fatalf("session %s has no readable manifest", sessionID)
	}
	return m
}

func readTestFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path) // nolint:gosec
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestRecoverSessionsFinalizesInterruptedRecording(t *testing.T) {
	useTempArchive(t)
	calls := stubRemuxer()

	const sessionID = "20260711-004829-qlc89z06"
	sessionDir := writeInterruptedSession(t, sessionID, 8)
	startedAt := time.Now().Add(-8 * time.Second)
	info, _ := json.Marshal(sessionInfo{Title: "Late night stream", StartedAt: startedAt})
	writeTestFile(t, filepath.Join(sessionDir, sessionInfoFile), string(info))

	pending := recoverSessions()
	if len(pending) != 1 || pending[0] != sessionID {
		t.Fatalf("pending = %v, want [%s]", pending, sessionID)
	}

	m := mustReadManifest(t, sessionID)
	if !m.Recovered || !m.PendingMedia || !m.FinishedOk {
		t.Errorf("manifest flags = recovered:%v pending:%v finishedOk:%v, want all true", m.Recovered, m.PendingMedia, m.FinishedOk)
	}
	if m.Visible {
		t.Error("a recovered session must stay hidden")
	}
	if m.Title != "Late night stream" {
		t.Errorf("title = %q, want the one stored at session start", m.Title)
	}
	if !m.StartedAt.Equal(startedAt) {
		t.Errorf("startedAt = %v, want %v", m.StartedAt, startedAt)
	}
	if m.DurationS < 7 || m.DurationS > 60 {
		t.Errorf("duration = %ds, want about 8s", m.DurationS)
	}
	if len(m.Variants) != 1 || m.Variants[0] != 0 {
		t.Errorf("variants = %v, want [0]", m.Variants)
	}

	playlist := readTestFile(t, filepath.Join(sessionDir, "0", "stream.m3u8"))
	if !strings.HasSuffix(playlist, "#EXT-X-ENDLIST\n") {
		t.Errorf("variant playlist was not closed:\n%s", playlist)
	}
	if got := strings.Count(playlist, "#EXTINF:"); got != 8 {
		t.Errorf("variant playlist lists %d segments, want 8", got)
	}
	if master := readTestFile(t, filepath.Join(sessionDir, "stream.m3u8")); !strings.Contains(master, "0/stream.m3u8") {
		t.Errorf("master playlist does not reference the variant:\n%s", master)
	}
	if _, err := os.Stat(filepath.Join(sessionDir, sessionInfoFile)); !os.IsNotExist(err) {
		t.Error("the session info file should be removed once the manifest exists")
	}
	if calls.count() != 0 {
		t.Error("the remux must not run in the synchronous part of the recovery")
	}

	finalizePendingSessions(pending)

	if calls.count() != 1 {
		t.Fatalf("remux ran %d times, want 1", calls.count())
	}
	m = mustReadManifest(t, sessionID)
	if m.Mp4 != "replay.mp4" || m.PendingMedia || m.SizeBytes == 0 {
		t.Errorf("after post-processing: mp4=%q pending=%v size=%d", m.Mp4, m.PendingMedia, m.SizeBytes)
	}

	// A second start finds nothing left to do.
	if again := recoverSessions(); len(again) != 0 {
		t.Errorf("second recovery returned %v, want nothing", again)
	}
	if !mustReadManifest(t, sessionID).Recovered {
		t.Error("the recovered flag must survive a second recovery pass")
	}
}

func TestRecoverSessionsDiscardsTooShortRecording(t *testing.T) {
	useTempArchive(t)

	const sessionID = "20260712-050712-9xyqy4wq"
	sessionDir := writeInterruptedSession(t, sessionID, minSessionSeconds-1)

	if pending := recoverSessions(); len(pending) != 0 {
		t.Errorf("pending = %v, want nothing", pending)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Errorf("a session below the minimum length should be removed, stat err = %v", err)
	}
}

func TestRecoverSessionsKeepsOnlySegmentsOnDisk(t *testing.T) {
	useTempArchive(t)

	const sessionID = "20260711-014640-4p3nqh98"
	sessionDir := writeInterruptedSession(t, sessionID, 7)
	variantDir := filepath.Join(sessionDir, "0")
	// One segment never reached the disk and one was cut off while empty.
	if err := os.Remove(filepath.Join(variantDir, "stream-abc-3.ts")); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(variantDir, "stream-abc-6.ts"), "")

	if pending := recoverSessions(); len(pending) != 1 {
		t.Fatalf("pending = %v, want the session", pending)
	}
	playlist := readTestFile(t, filepath.Join(variantDir, "stream.m3u8"))
	if got := strings.Count(playlist, "#EXTINF:"); got != 5 {
		t.Errorf("playlist lists %d segments, want the 5 present on disk:\n%s", got, playlist)
	}
	for _, missing := range []string{"stream-abc-3.ts", "stream-abc-6.ts"} {
		if strings.Contains(playlist, missing) {
			t.Errorf("playlist still names %s", missing)
		}
	}
}

func TestRecoverSessionsFallsBackToIDForStartTime(t *testing.T) {
	useTempArchive(t)

	// No session info file: a session recorded by an older build.
	const sessionID = "20260710-234441-0p6qu3o6"
	writeInterruptedSession(t, sessionID, 6)

	if pending := recoverSessions(); len(pending) != 1 {
		t.Fatalf("pending = %v, want the session", pending)
	}
	m := mustReadManifest(t, sessionID)
	want := time.Date(2026, 7, 10, 23, 44, 41, 0, time.Local)
	if !m.StartedAt.Equal(want) {
		t.Errorf("startedAt = %v, want %v from the session ID", m.StartedAt, want)
	}
	if m.Title != "" {
		t.Errorf("title = %q, want empty", m.Title)
	}
}

func TestRecoverSessionsResumesPendingMedia(t *testing.T) {
	useTempArchive(t)
	calls := stubRemuxer()

	// Finished by a shutdown: the manifest exists, the post-processing doesn't.
	const pendingID = "20260801-200000-aaaaaaaa"
	writeInterruptedSession(t, pendingID, 6)
	if err := WriteManifest(pendingID, Manifest{ID: pendingID, Title: "Kept", Variants: []int{0}, FinishedOk: true, Visible: true, PendingMedia: true}); err != nil {
		t.Fatal(err)
	}

	// Finished normally long ago: must not be touched.
	const doneID = "20260701-200000-bbbbbbbb"
	doneDir := writeInterruptedSession(t, doneID, 6)
	if err := WriteManifest(doneID, Manifest{ID: doneID, Variants: []int{0}, FinishedOk: true}); err != nil {
		t.Fatal(err)
	}
	doneBefore := readTestFile(t, filepath.Join(doneDir, "manifest.json"))

	pending := recoverSessions()
	if len(pending) != 1 || pending[0] != pendingID {
		t.Fatalf("pending = %v, want [%s]", pending, pendingID)
	}
	finalizePendingSessions(pending)

	m := mustReadManifest(t, pendingID)
	if m.Mp4 != "replay.mp4" || m.PendingMedia {
		t.Errorf("pending session after post-processing: mp4=%q pending=%v", m.Mp4, m.PendingMedia)
	}
	if !m.Visible || m.Title != "Kept" || m.Recovered {
		t.Errorf("post-processing changed curated fields: %+v", m)
	}
	if calls.count() != 1 {
		t.Errorf("remux ran %d times, want 1", calls.count())
	}
	if after := readTestFile(t, filepath.Join(doneDir, "manifest.json")); after != doneBefore {
		t.Errorf("a finished session's manifest was rewritten:\n%s", after)
	}
}

func TestRecoverSessionsLeavesUnreadableManifestAlone(t *testing.T) {
	useTempArchive(t)

	const sessionID = "20260802-200000-cccccccc"
	sessionDir := writeInterruptedSession(t, sessionID, 6)
	writeTestFile(t, filepath.Join(sessionDir, "manifest.json"), "{not json")
	playlistBefore := readTestFile(t, filepath.Join(sessionDir, "0", "stream.m3u8"))

	if pending := recoverSessions(); len(pending) != 0 {
		t.Errorf("pending = %v, want nothing", pending)
	}
	if got := readTestFile(t, filepath.Join(sessionDir, "manifest.json")); got != "{not json" {
		t.Errorf("unreadable manifest was replaced with %q", got)
	}
	if got := readTestFile(t, filepath.Join(sessionDir, "0", "stream.m3u8")); got != playlistBefore {
		t.Error("the playlist of a session with an unreadable manifest was rewritten")
	}
}

func TestRecoverSessionsIgnoresForeignDirectories(t *testing.T) {
	useTempArchive(t)

	foreign := filepath.Join(ArchiveBasePath, "my-backup")
	if err := os.MkdirAll(foreign, 0o750); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(foreign, "notes.txt"), "keep me")
	writeTestFile(t, filepath.Join(ArchiveBasePath, "README"), "not a session")

	if pending := recoverSessions(); len(pending) != 0 {
		t.Errorf("pending = %v, want nothing", pending)
	}
	if got := readTestFile(t, filepath.Join(foreign, "notes.txt")); got != "keep me" {
		t.Errorf("a directory that is not a session was modified: %q", got)
	}
}

func TestFinishSessionForShutdownLeavesPostProcessingPending(t *testing.T) {
	useTempArchive(t)
	calls := stubRemuxer()

	const sessionID = "20260803-200000-dddddddd"
	sessionDir := writeInterruptedSession(t, sessionID, 6)
	variant := &variantRecorder{index: 0, dir: filepath.Join(sessionDir, "0"), segmentDuration: map[string]float64{}}
	for i := 0; i < 6; i++ {
		name := fmt.Sprintf("stream-abc-%d.ts", i)
		variant.order = append(variant.order, name)
		variant.segmentDuration[name] = 1
	}
	r := &Recorder{
		active:     true,
		sessionID:  sessionID,
		sessionDir: sessionDir,
		title:      "Cut short by a deploy",
		startedAt:  time.Now().Add(-6 * time.Second),
		variants:   map[int]*variantRecorder{0: variant},
	}

	r.FinishSessionForShutdown()

	if r.IsActive() {
		t.Error("the session should no longer be active")
	}
	m := mustReadManifest(t, sessionID)
	if !m.PendingMedia || m.Mp4 != "" || m.Visible || m.Recovered {
		t.Errorf("manifest after shutdown: pending=%v mp4=%q visible=%v recovered=%v", m.PendingMedia, m.Mp4, m.Visible, m.Recovered)
	}
	if m.Title != "Cut short by a deploy" {
		t.Errorf("title = %q", m.Title)
	}
	if playlist := readTestFile(t, filepath.Join(sessionDir, "0", "stream.m3u8")); !strings.HasSuffix(playlist, "#EXT-X-ENDLIST\n") {
		t.Errorf("variant playlist was not closed:\n%s", playlist)
	}
	if calls.count() != 0 {
		t.Error("a shutdown must not start the remux")
	}

	// The next start completes it.
	pending := recoverSessions()
	if len(pending) != 1 || pending[0] != sessionID {
		t.Fatalf("pending = %v, want [%s]", pending, sessionID)
	}
	finalizePendingSessions(pending)
	if m := mustReadManifest(t, sessionID); m.Mp4 != "replay.mp4" || m.PendingMedia {
		t.Errorf("after the next start: mp4=%q pending=%v", m.Mp4, m.PendingMedia)
	}
}

func TestFinalizeSessionMediaSkipsOffloadedSession(t *testing.T) {
	useTempArchive(t)
	calls := stubRemuxer()

	// Offloaded to S3 already; only the pending marker was never cleared.
	const sessionID = "20260804-200000-eeeeeeee"
	sessionDir := filepath.Join(ArchiveBasePath, sessionID)
	if err := os.MkdirAll(sessionDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := WriteManifest(sessionID, Manifest{ID: sessionID, Variants: []int{0}, FinishedOk: true, RemoteMedia: true, Mp4: "replay.mp4", SizeBytes: 123456, PendingMedia: true}); err != nil {
		t.Fatal(err)
	}

	finalizeSessionMedia(sessionID, sessionDir)

	m := mustReadManifest(t, sessionID)
	if m.PendingMedia {
		t.Error("the pending marker should be cleared")
	}
	if m.SizeBytes != 123456 || !m.RemoteMedia || m.Mp4 != "replay.mp4" {
		t.Errorf("an offloaded session's manifest was changed: %+v", m)
	}
	if calls.count() != 0 {
		t.Error("an offloaded session has nothing local to remux")
	}
}

func TestStartSessionStoresInfoForRecovery(t *testing.T) {
	useTempArchive(t)

	r := &Recorder{variants: map[int]*variantRecorder{}}
	r.StartSession("Opening night", -1)
	if !r.IsActive() {
		t.Fatal("session did not start")
	}

	// Recovery only touches directories that look like a session ID.
	if !sessionIDPattern.MatchString(r.sessionID) {
		t.Errorf("session ID %q does not match the pattern recovery looks for", r.sessionID)
	}
	info := readSessionInfo(r.sessionDir, r.sessionID)
	if info.Title != "Opening night" || info.StartedAt.IsZero() {
		t.Errorf("stored session info = %+v", info)
	}
}

func TestWriteManifestLeavesNoTemporaryFiles(t *testing.T) {
	useTempArchive(t)

	const sessionID = "20260805-200000-ffffffff"
	sessionDir := filepath.Join(ArchiveBasePath, sessionID)
	if err := os.MkdirAll(sessionDir, 0o750); err != nil {
		t.Fatal(err)
	}
	for _, title := range []string{"first", "second"} {
		if err := WriteManifest(sessionID, Manifest{ID: sessionID, Title: title}); err != nil {
			t.Fatal(err)
		}
	}

	if m := mustReadManifest(t, sessionID); m.Title != "second" {
		t.Errorf("title = %q, want the last one written", m.Title)
	}
	entries, err := os.ReadDir(sessionDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "manifest.json" {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("session directory holds %v, want only manifest.json", names)
	}

	if err := WriteManifest("20990101-000000-missing0", Manifest{}); err == nil {
		t.Error("writing a manifest for a session that does not exist should fail")
	}
}

func TestFinalizeSessionMediaKeepsMediaLocalWhileOffloadIsBlocked(t *testing.T) {
	useTempArchive(t)
	stubRemuxer()
	up := &fakeUploader{}
	SetUploaderFactory(func() (ArchiveUploader, error) { return up, nil })

	const sessionID = "20261123-010000-abcdabcd"
	sessionDir := writeInterruptedSession(t, sessionID, 3)
	if err := WriteManifest(sessionID, Manifest{ID: sessionID, Variants: []int{0}, FinishedOk: true, PendingMedia: true}); err != nil {
		t.Fatal(err)
	}

	SetOffloadBlocker(func() string { return "live S3 distribution is on" })
	finalizeSessionMedia(sessionID, sessionDir)

	if len(up.uploaded) != 0 {
		t.Errorf("uploaded %v while offload was blocked", up.uploaded)
	}
	m := mustReadManifest(t, sessionID)
	if m.RemoteMedia || m.PendingMedia || m.Mp4 != "replay.mp4" {
		t.Errorf("manifest = %+v, want a finished local recording", m)
	}
	if _, err := os.Stat(filepath.Join(sessionDir, "0", "stream-abc-0.ts")); err != nil {
		t.Errorf("media must stay on disk: %v", err)
	}
}

func TestFinalizeSessionMediaOffloadsWhenNotBlocked(t *testing.T) {
	useTempArchive(t)
	stubRemuxer()
	up := &fakeUploader{}
	SetUploaderFactory(func() (ArchiveUploader, error) { return up, nil })
	SetOffloadBlocker(func() string { return "" })

	const sessionID = "20261123-020000-abcdabcd"
	sessionDir := writeInterruptedSession(t, sessionID, 3)
	if err := WriteManifest(sessionID, Manifest{ID: sessionID, Variants: []int{0}, FinishedOk: true}); err != nil {
		t.Fatal(err)
	}

	finalizeSessionMedia(sessionID, sessionDir)

	if len(up.uploaded) == 0 {
		t.Fatal("nothing was uploaded")
	}
	if m := mustReadManifest(t, sessionID); !m.RemoteMedia {
		t.Errorf("manifest = %+v, want remote media", m)
	}
}

func TestOffloadBlockerDoesNotStopRemoteDeletion(t *testing.T) {
	useTempArchive(t)
	up := &fakeUploader{}
	SetOffloadBlocker(func() string { return "live S3 distribution is on" })

	const sessionID = "20261123-030000-abcdabcd"
	if err := os.MkdirAll(filepath.Join(ArchiveBasePath, sessionID), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := WriteManifest(sessionID, Manifest{ID: sessionID, RemoteMedia: true}); err != nil {
		t.Fatal(err)
	}

	DeleteRemoteMedia(sessionID, up)
	if len(up.deleted) != 1 || up.deleted[0] != sessionID {
		t.Errorf("deleted = %v, want the session's S3 objects removed", up.deleted)
	}
}
