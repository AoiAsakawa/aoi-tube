package transcoder

import (
	"strings"
	"testing"

	"github.com/aoiasakawa/aoitube/config"
)

func TestDiskMirrorOutput(t *testing.T) {
	origPort := config.InternalHLSListenerPort
	t.Cleanup(func() { config.InternalHLSListenerPort = origPort })

	transcoder := &LLHLSTranscoder{Transcoder: new(Transcoder)}
	transcoder.segmentIdentifier = "abc"
	transcoder.startNumber = 1794810000

	config.InternalHLSListenerPort = ""
	if out := transcoder.diskMirrorOutput(); out != "" {
		t.Errorf("without a file-writer listener the mirror should be off, got %q", out)
	}

	config.InternalHLSListenerPort = "8123"
	out := transcoder.diskMirrorOutput()

	for _, want := range []string{
		"-c copy",
		"-f hls",
		"-start_number 1794810000",
		"-hls_segment_filename http://127.0.0.1:8123/0/stream-abc-%d.ts",
		"-method PUT http://127.0.0.1:8123/0/stream.m3u8",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("disk mirror output lacks %q:\n%s", want, out)
		}
	}

	// The file-writer listener answers anything but PUT with 400. append_list
	// makes ffmpeg GET the playlist when it starts, which only ever produced an
	// error in the log.
	if strings.Contains(out, "append_list") {
		t.Errorf("disk mirror output uses append_list, which issues a GET the listener rejects:\n%s", out)
	}
}
