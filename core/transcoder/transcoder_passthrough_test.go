package transcoder

import (
	"strings"
	"testing"

	"github.com/aoiasakawa/aoitube/models"
)

// Video passthrough combined with audio re-encoding must still emit a valued
// "-b:a:N" flag. A valueless one makes ffmpeg swallow the next flag as the
// bitrate and treat that flag's argument as an output URL, aborting the whole
// transcode (hit in production with video passthrough + fixed 320kbps AAC).
func TestVideoPassthroughWithAudioEncode(t *testing.T) {
	quality := models.StreamOutputVariant{
		IsVideoPassthrough: true,
		IsAudioPassthrough: false,
		AudioBitrate:       320,
	}

	variant := getVariantFromConfigQuality(quality, 0)
	audio := variant.getAudioQualityString()

	if !strings.Contains(audio, "-b:a:0 320k") {
		t.Errorf("expected audio flags to contain %q, got %q", "-b:a:0 320k", audio)
	}
}

// Even a variant whose audio bitrate was never set must not produce a
// valueless "-b:a:N"; it falls back to a sane default instead.
func TestAudioEncodeNeverEmitsEmptyBitrate(t *testing.T) {
	v := HLSVariant{isAudioPassthrough: false}
	audio := v.getAudioQualityString()

	if strings.Contains(audio, "-b:a:0 ") && !strings.Contains(audio, "-b:a:0 192k") {
		t.Errorf("expected fallback bitrate in audio flags, got %q", audio)
	}
	if strings.HasSuffix(strings.TrimSpace(audio), "-b:a:0") {
		t.Errorf("audio flags end in a valueless -b:a:0: %q", audio)
	}
}
