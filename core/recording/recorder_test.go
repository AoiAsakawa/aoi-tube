package recording

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestParseLivePlaylistTS(t *testing.T) {
	dir := t.TempDir()
	playlist := `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:1
#EXT-X-MEDIA-SEQUENCE:5
#EXTINF:1.000000,
stream-abc-5.ts
#EXTINF:0.960000,
stream-abc-6.ts
`
	p := filepath.Join(dir, "stream.m3u8")
	if err := os.WriteFile(p, []byte(playlist), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, mapURI, td, isFmp4 := parseLivePlaylist(p)
	if isFmp4 {
		t.Errorf("TS playlist misdetected as fMP4")
	}
	if mapURI != "" {
		t.Errorf("unexpected map URI %q", mapURI)
	}
	if td != 1 {
		t.Errorf("target duration = %d, want 1", td)
	}
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(entries))
	}
	if entries[0].filename != "stream-abc-5.ts" || entries[0].duration != 1.0 {
		t.Errorf("entry0 = %+v", entries[0])
	}
	if entries[1].duration != 0.96 {
		t.Errorf("entry1 duration = %v, want 0.96", entries[1].duration)
	}
}

func TestParseLivePlaylistFmp4(t *testing.T) {
	dir := t.TempDir()
	playlist := `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:1
#EXT-X-MAP:URI="init.mp4"
#EXTINF:1.000000,
stream-abc-3.m4s
`
	p := filepath.Join(dir, "stream.m3u8")
	if err := os.WriteFile(p, []byte(playlist), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, mapURI, _, isFmp4 := parseLivePlaylist(p)
	if !isFmp4 {
		t.Errorf("fMP4 playlist not detected")
	}
	if mapURI != "init.mp4" {
		t.Errorf("map URI = %q, want init.mp4", mapURI)
	}
	if len(entries) != 1 || entries[0].filename != "stream-abc-3.m4s" {
		t.Fatalf("entries = %+v", entries)
	}
}

func TestWriteVariantVODFinal(t *testing.T) {
	dir := t.TempDir()
	v := &variantRecorder{
		index:           0,
		dir:             dir,
		segmentDuration: map[string]float64{"a.m4s": 1.0, "b.m4s": 0.5},
		order:           []string{"a.m4s", "b.m4s"},
		isFmp4:          true,
		initURI:         "init.mp4",
		targetDuration:  1,
	}
	r := &Recorder{}
	r.writeVariantVOD(v, true)

	out, err := os.ReadFile(filepath.Join(dir, "stream.m3u8"))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, want := range []string{
		"#EXT-X-PLAYLIST-TYPE:VOD",
		"#EXT-X-MAP:URI=\"init.mp4\"",
		"#EXTINF:1.000000,\na.m4s",
		"#EXTINF:0.500000,\nb.m4s",
		"#EXT-X-ENDLIST",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("VOD playlist missing %q\n---\n%s", want, s)
		}
	}
}

func TestVariantIndexFromPath(t *testing.T) {
	i, err := variantIndexFromPath("data/hls/2/stream.m3u8")
	if err != nil || i != 2 {
		t.Errorf("index = %d, err = %v; want 2, nil", i, err)
	}
}

func TestPruneOldSessions(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()

	// Create 5 timestamped session dirs.
	names := []string{
		"20260101-100000", "20260102-100000", "20260103-100000",
		"20260104-100000", "20260105-100000",
	}
	for _, n := range names {
		if err := os.MkdirAll(filepath.Join(ArchiveBasePath, n), 0o750); err != nil {
			t.Fatal(err)
		}
	}

	// Keep the newest 2; the 3 oldest should be pruned.
	PruneOldSessions(2)

	remaining, _ := os.ReadDir(ArchiveBasePath)
	if len(remaining) != 2 {
		t.Fatalf("remaining = %d, want 2", len(remaining))
	}
	got := map[string]bool{}
	for _, e := range remaining {
		got[e.Name()] = true
	}
	if !got["20260104-100000"] || !got["20260105-100000"] {
		t.Errorf("wrong sessions kept: %v", got)
	}

	// keepCount 0 disables pruning.
	PruneOldSessions(0)
	remaining, _ = os.ReadDir(ArchiveBasePath)
	if len(remaining) != 2 {
		t.Errorf("keepCount 0 should not prune; got %d", len(remaining))
	}
}

// Sessions with less recorded media than the minimum must be deleted on
// finish: broadcast blips / reconnect churn once flooded the archive list
// with dozens of one-second junk sessions.
func TestFinishSessionDiscardsShortSessions(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()

	dir := filepath.Join(ArchiveBasePath, "20260106-120000")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatal(err)
	}

	r := &Recorder{
		active:     true,
		sessionID:  "20260106-120000",
		sessionDir: dir,
		variants: map[int]*variantRecorder{
			0: {segmentDuration: map[string]float64{"a.ts": 1, "b.ts": 1.5}},
		},
	}

	r.FinishSession(true)

	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("short session dir should have been deleted, stat err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "manifest.json")); !os.IsNotExist(err) {
		t.Errorf("short session must not produce a manifest")
	}
}

// fakeUploader records Upload/DeletePrefix calls for offload tests. Uploads
// run on concurrent workers, so the fake is mutex-guarded.
type fakeUploader struct {
	mu           sync.Mutex
	uploaded     []string
	deleted      []string
	failOnUpload bool
}

func (f *fakeUploader) Upload(localPath, archiveRelPath string) error {
	if f.failOnUpload {
		return errTestUpload
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.uploaded = append(f.uploaded, archiveRelPath)
	return nil
}

func (f *fakeUploader) DeletePrefix(sessionID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, sessionID)
	return nil
}

var errTestUpload = fmtErrorf("upload failed")

func fmtErrorf(s string) error { return &testErr{s} }

type testErr struct{ s string }

func (e *testErr) Error() string { return e.s }

func TestOffloadMediaToS3(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()

	sessionID := "20260101-120000"
	variantDir := filepath.Join(ArchiveBasePath, sessionID, "0")
	if err := os.MkdirAll(variantDir, 0o750); err != nil {
		t.Fatal(err)
	}
	// Media files (should be uploaded + deleted) and metadata (kept local).
	writeTestFile(t, filepath.Join(variantDir, "init-0.mp4"), "init")
	writeTestFile(t, filepath.Join(variantDir, "seg-1.m4s"), "seg1")
	writeTestFile(t, filepath.Join(variantDir, "seg-2.m4s"), "seg2")
	writeTestFile(t, filepath.Join(variantDir, "stream.m3u8"), "#EXTM3U")
	writeTestFile(t, filepath.Join(ArchiveBasePath, sessionID, "manifest.json"), "{}")

	up := &fakeUploader{}
	if err := offloadMediaDir(sessionID, filepath.Join(ArchiveBasePath, sessionID), up); err != nil {
		t.Fatalf("offload failed: %v", err)
	}

	if len(up.uploaded) != 3 {
		t.Errorf("expected 3 media uploads, got %d: %v", len(up.uploaded), up.uploaded)
	}
	// Media deleted locally, metadata retained.
	for _, gone := range []string{"0/init-0.mp4", "0/seg-1.m4s", "0/seg-2.m4s"} {
		if _, err := os.Stat(filepath.Join(ArchiveBasePath, sessionID, gone)); !os.IsNotExist(err) {
			t.Errorf("expected local media %s to be deleted", gone)
		}
	}
	for _, kept := range []string{"0/stream.m3u8", "manifest.json"} {
		if _, err := os.Stat(filepath.Join(ArchiveBasePath, sessionID, kept)); err != nil {
			t.Errorf("expected local metadata %s to be kept: %v", kept, err)
		}
	}
}

func TestOffloadMediaToS3FailureKeepsLocal(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()

	sessionID := "20260101-120000"
	variantDir := filepath.Join(ArchiveBasePath, sessionID, "0")
	if err := os.MkdirAll(variantDir, 0o750); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(variantDir, "seg-1.m4s"), "seg1")

	up := &fakeUploader{failOnUpload: true}
	if err := offloadMediaDir(sessionID, filepath.Join(ArchiveBasePath, sessionID), up); err == nil {
		t.Fatal("expected offload to fail")
	}
	// On failure the local media must remain (fully-local fallback).
	if _, err := os.Stat(filepath.Join(variantDir, "seg-1.m4s")); err != nil {
		t.Errorf("expected local segment to be kept on upload failure: %v", err)
	}
	// Cleanup of any partial remote state attempted.
	if len(up.deleted) != 1 || up.deleted[0] != sessionID {
		t.Errorf("expected DeletePrefix(%q) on failure, got %v", sessionID, up.deleted)
	}
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// Retention must only clean up unattended recordings: published, members-only,
// paid and ever-purchased archives are all exempt; hidden unrestricted
// sessions and manifest-less orphans are prunable.
func TestPruneOldSessionsProtectsCuratedArchives(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()
	defer SetEntitlementChecker(nil)

	paid := "20260101-100000"      // paid, hidden
	members := "20260102-100000"   // members-only (authenticated), hidden
	published := "20260103-100000" // public + visible
	purchased := "20260104-100000" // mode changed back to public, but was sold
	orphan1 := "20260105-100000"   // no manifest
	orphan2 := "20260106-100000"   // no manifest
	hidden := "20260107-100000"    // hidden unrestricted (prunable)

	all := []string{paid, members, published, purchased, orphan1, orphan2, hidden}
	for _, n := range all {
		if err := os.MkdirAll(filepath.Join(ArchiveBasePath, n), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	writeM := func(id string, m Manifest) {
		m.ID = id
		m.FinishedOk = true
		if err := WriteManifest(id, m); err != nil {
			t.Fatal(err)
		}
	}
	writeM(paid, Manifest{AccessMode: AccessModePaid, Price: 500})
	writeM(members, Manifest{AccessMode: AccessModeAuthenticated})
	writeM(published, Manifest{Visible: true})
	writeM(purchased, Manifest{AccessMode: AccessModePublic})
	writeM(hidden, Manifest{})
	SetEntitlementChecker(func(archiveID string) bool { return archiveID == purchased })

	// Prunable set = orphan1, orphan2, hidden (3 sessions). Keep 2: the
	// oldest prunable (orphan1) goes, every protected archive stays.
	PruneOldSessions(2)

	for _, kept := range []string{paid, members, published, purchased, orphan2, hidden} {
		if _, err := os.Stat(filepath.Join(ArchiveBasePath, kept)); err != nil {
			t.Errorf("expected %s to survive pruning: %v", kept, err)
		}
	}
	if _, err := os.Stat(filepath.Join(ArchiveBasePath, orphan1)); !os.IsNotExist(err) {
		t.Error("oldest prunable session should have been pruned")
	}
}

// A successful background offload flips the manifest to RemoteMedia.
func TestOffloadSessionToS3MarksManifestRemote(t *testing.T) {
	orig := ArchiveBasePath
	ArchiveBasePath = t.TempDir()
	defer func() { ArchiveBasePath = orig }()

	sessionID := "20260101-130000"
	variantDir := filepath.Join(ArchiveBasePath, sessionID, "0")
	if err := os.MkdirAll(variantDir, 0o750); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(variantDir, "seg-1.m4s"), "seg1")
	if err := WriteManifest(sessionID, Manifest{ID: sessionID, Visible: false, FinishedOk: true}); err != nil {
		t.Fatal(err)
	}

	offloadSessionToS3(sessionID, filepath.Join(ArchiveBasePath, sessionID), &fakeUploader{})

	m, ok := ReadManifest(sessionID)
	if !ok {
		t.Fatal("manifest should still exist after offload")
	}
	if !m.RemoteMedia {
		t.Error("manifest should be marked RemoteMedia after successful offload")
	}
	if _, err := os.Stat(filepath.Join(variantDir, "seg-1.m4s")); !os.IsNotExist(err) {
		t.Error("local media should be deleted after successful offload")
	}
}
