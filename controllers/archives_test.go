package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/aoiasakawa/aoitube/core/recording"
)

func writeManifest(t *testing.T, sessionID string, visible, finishedOk bool) {
	t.Helper()
	writeManifestFull(t, recording.Manifest{ID: sessionID, Visible: visible, FinishedOk: finishedOk})
}

// writeManifestMode writes a visible, finished archive with the given access
// mode for gate tests.
func writeManifestMode(t *testing.T, sessionID, accessMode string) {
	t.Helper()
	writeManifestFull(t, recording.Manifest{
		ID:         sessionID,
		Visible:    true,
		FinishedOk: true,
		AccessMode: accessMode,
	})
}

func writeManifestFull(t *testing.T, m recording.Manifest) {
	t.Helper()
	dir := filepath.Join(recording.ArchiveBasePath, m.ID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), b, 0o600); err != nil {
		t.Fatal(err)
	}
}

// canViewAnonymous mirrors an anonymous (no accessToken) viewer hitting the
// gate for the given session.
func canViewAnonymous(t *testing.T, sessionID string) bool {
	t.Helper()
	m, ok := getArchiveManifest(sessionID)
	if !ok {
		return false
	}
	req := httptest.NewRequest(http.MethodGet, "/api/archives/"+sessionID+"/stream.m3u8", nil)
	return canViewArchive(req, m)
}

func TestCanViewArchiveVisibility(t *testing.T) {
	previous := recording.ArchiveBasePath
	recording.ArchiveBasePath = t.TempDir()
	t.Cleanup(func() { recording.ArchiveBasePath = previous })

	writeManifest(t, "20260101-120000", true, true)   // public visible
	writeManifest(t, "20260101-130000", false, true)  // hidden
	writeManifest(t, "20260101-140000", true, false)  // unfinished
	writeManifest(t, "20260101-150000", false, false) // hidden + unfinished

	cases := []struct {
		id   string
		want bool
	}{
		{"20260101-120000", true}, // public + visible + finished → anyone
		{"20260101-130000", false},
		{"20260101-140000", false},
		{"20260101-150000", false},
		{"does-not-exist", false},
		{"", false},
		{"../escape", false},
		{"foo/bar", false},
	}
	for _, c := range cases {
		if got := canViewAnonymous(t, c.id); got != c.want {
			t.Errorf("canViewAnonymous(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}

func TestCanViewArchivePaidAndAuthenticated(t *testing.T) {
	previous := recording.ArchiveBasePath
	recording.ArchiveBasePath = t.TempDir()
	t.Cleanup(func() { recording.ArchiveBasePath = previous })

	writeManifestMode(t, "20260101-160000", recording.AccessModeAuthenticated)
	writeManifestMode(t, "20260101-170000", recording.AccessModePaid)

	// Anonymous viewers can't see authenticated-only or paid archives.
	if canViewAnonymous(t, "20260101-160000") {
		t.Error("anonymous viewer should not access an authenticated-only archive")
	}
	if canViewAnonymous(t, "20260101-170000") {
		t.Error("anonymous viewer should not access a paid archive")
	}
}

func TestCanViewArchiveFileThumbnailExemption(t *testing.T) {
	previous := recording.ArchiveBasePath
	recording.ArchiveBasePath = t.TempDir()
	t.Cleanup(func() { recording.ArchiveBasePath = previous })

	writeManifestMode(t, "20260101-180000", recording.AccessModePaid)
	writeManifest(t, "20260101-190000", false, true) // hidden

	req := httptest.NewRequest(http.MethodGet, "/api/archives/x", nil)

	paid, ok := getArchiveManifest("20260101-180000")
	if !ok {
		t.Fatal("expected paid manifest to load")
	}
	// The storefront thumbnail of a visible paid archive is served to anyone…
	if !canViewArchiveFile(req, paid, true) {
		t.Error("anonymous viewer should get the thumbnail of a visible paid archive")
	}
	// …but its playlist/media stay behind the entitlement gate.
	if canViewArchiveFile(req, paid, false) {
		t.Error("anonymous viewer should not get media of a paid archive")
	}

	hidden, ok := getArchiveManifest("20260101-190000")
	if !ok {
		t.Fatal("expected hidden manifest to load")
	}
	// Hidden archives don't leak their thumbnail either.
	if canViewArchiveFile(req, hidden, true) {
		t.Error("anonymous viewer should not get the thumbnail of a hidden archive")
	}
}
