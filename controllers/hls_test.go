package controllers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aoiasakawa/aoitube/config"
)

const testMasterLocal = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
0/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360
1/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
2/stream.m3u8
`

const testMasterRemote = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
https://cdn.example.com/hls/0/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360
https://cdn.example.com/hls/1/stream.m3u8
`

// setupHLSDirs points config.HLSStoragePath at a temp dir, writes the master
// playlist, and creates variant playlists for the given indices.
func setupHLSDirs(t *testing.T, master string, readyVariants ...string) string {
	t.Helper()
	dir := t.TempDir()

	previous := config.HLSStoragePath
	config.HLSStoragePath = dir
	t.Cleanup(func() { config.HLSStoragePath = previous })

	masterPath := filepath.Join(dir, "stream.m3u8")
	if err := os.WriteFile(masterPath, []byte(master), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, index := range readyVariants {
		variantDir := filepath.Join(dir, index)
		if err := os.MkdirAll(variantDir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(variantDir, "stream.m3u8"), []byte("#EXTM3U\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return masterPath
}

func TestFilterMasterAllVariantsReady(t *testing.T) {
	masterPath := setupHLSDirs(t, testMasterLocal, "0", "1", "2")

	if _, ok := filterMasterPlaylistToReadyVariants(masterPath); ok {
		t.Error("expected ok=false when all variants are ready (serve file as-is)")
	}
}

func TestFilterMasterSomeVariantsMissing(t *testing.T) {
	masterPath := setupHLSDirs(t, testMasterLocal, "0", "2")

	body, ok := filterMasterPlaylistToReadyVariants(masterPath)
	if !ok {
		t.Fatal("expected filtered master when some variants are missing")
	}

	filtered := string(body)
	if strings.Contains(filtered, "1/stream.m3u8") {
		t.Error("missing variant 1 should have been filtered out:\n" + filtered)
	}
	for _, want := range []string{"0/stream.m3u8", "2/stream.m3u8", "#EXTM3U"} {
		if !strings.Contains(filtered, want) {
			t.Errorf("expected %q to remain in filtered master:\n%s", want, filtered)
		}
	}
	// The STREAM-INF line for the removed variant must be gone too.
	if strings.Contains(filtered, "RESOLUTION=640x360") {
		t.Error("STREAM-INF line of the missing variant should have been removed")
	}
}

func TestFilterMasterNoVariantsReady(t *testing.T) {
	masterPath := setupHLSDirs(t, testMasterLocal)

	if _, ok := filterMasterPlaylistToReadyVariants(masterPath); ok {
		t.Error("expected ok=false when no variant is ready")
	}
}

func TestFilterMasterRemoteURIs(t *testing.T) {
	masterPath := setupHLSDirs(t, testMasterRemote, "0")

	body, ok := filterMasterPlaylistToReadyVariants(masterPath)
	if !ok {
		t.Fatal("expected filtered master for remote-storage URIs")
	}

	filtered := string(body)
	if !strings.Contains(filtered, "https://cdn.example.com/hls/0/stream.m3u8") {
		t.Error("ready remote variant should remain")
	}
	if strings.Contains(filtered, "https://cdn.example.com/hls/1/stream.m3u8") {
		t.Error("missing remote variant should have been filtered out")
	}
}

func TestFilterMasterUnreadableFile(t *testing.T) {
	if _, ok := filterMasterPlaylistToReadyVariants(filepath.Join(t.TempDir(), "nope.m3u8")); ok {
		t.Error("expected ok=false for unreadable master")
	}
}
