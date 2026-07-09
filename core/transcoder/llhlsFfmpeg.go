package transcoder

import (
	"fmt"
	"strings"
	"sync"

	"github.com/aoiasakawa/aoitube/logging"
)

// activeLLHLSManager is the muxer manager for the current LL-HLS broadcast, so
// the HLS HTTP handler can serve from it. Nil when LL-HLS isn't running.
var (
	activeLLHLSManager   *LLHLSMuxerManager
	activeLLHLSManagerMu sync.RWMutex
)

// GetActiveLLHLSManager returns the running LL-HLS muxer manager, or nil.
func GetActiveLLHLSManager() *LLHLSMuxerManager {
	activeLLHLSManagerMu.RLock()
	defer activeLLHLSManagerMu.RUnlock()
	return activeLLHLSManager
}

func setActiveLLHLSManager(m *LLHLSMuxerManager) {
	activeLLHLSManagerMu.Lock()
	activeLLHLSManager = m
	activeLLHLSManagerMu.Unlock()
}

// getLLHLSMpegtsString builds the ffmpeg command that transcodes the incoming
// stream into one MPEG-TS elementary output per rendition, each delivered to a
// loopback TCP port where the gohlslib muxer manager ingests it. Audio is
// copied on every rendition (the RTMP source is already AAC, which gohlslib
// consumes directly) so only video is re-encoded.
func (t *LLHLSTranscoder) getLLHLSMpegtsString(ports []int) string {
	args := []string{
		fmt.Sprintf(`FFREPORT=file="%s":level=32`, logging.GetTranscoderLogFilePath()),
		t.ffmpegPath,
		"-hide_banner",
		"-loglevel warning",
		t.codec.GlobalFlags(),
		"-fflags +genpts+discardcorrupt",
		"-flags +cgop",
		"-f flv",
		"-i pipe:0",
	}
	for i, v := range t.variants {
		if i >= len(ports) {
			break
		}
		args = append(args, t.renditionMpegtsOutput(v, ports[i]))
	}
	return strings.Join(args, " ")
}

// renditionMpegtsOutput returns the ffmpeg output block for one rendition:
// a mapped video+audio stream muxed to MPEG-TS over a loopback TCP connection.
func (t *LLHLSTranscoder) renditionMpegtsOutput(v HLSVariant, port int) string {
	// nobuffer keeps ffmpeg from holding frames back before shipping them to the
	// muxer, which is what actually delivers the low latency.
	dest := fmt.Sprintf("-flush_packets 1 -f mpegts tcp://127.0.0.1:%d", port)

	if v.isVideoPassthrough {
		return strings.Join([]string{"-map 0:v:0 -map 0:a:0?", "-c:v copy", "-c:a copy", dest}, " ")
	}

	preset := t.codec.GetPresetForLevel(v.cpuUsageLevel)

	parts := []string{
		"-map 0:v:0 -map 0:a:0?",
		"-c:v " + t.codec.Name(),
	}
	if preset != "" {
		parts = append(parts, "-preset "+preset)
	}
	parts = append(parts,
		"-tune zerolatency",
		"-profile:v high",
		"-pix_fmt yuv420p",
		// Put keyframes at the SAME positions as the source stream (which the
		// copied passthrough rendition keeps) rather than on a fixed 1s grid. A
		// fixed -g lands on an exact-1.0s grid while the 59.94fps source keys land
		// at ~0.985s, so the two cadences drift and gohlslib cuts each rendition's
		// segments at different boundaries — which is what made hls.js rebuffer on
		// every quality switch. -sc_threshold 0 keeps ffmpeg from inserting extra
		// scene-cut keys that would break the alignment. No -r, so the transcoded
		// renditions keep the source frame rate (no 60 vs 59.94 mismatch either).
		"-sc_threshold 0",
		"-force_key_frames source",
		fmt.Sprintf("-b:v %dk -maxrate %dk -bufsize %dk", v.getAllocatedVideoBitrate(), v.getMaxVideoBitrate(), v.getBufferSize()),
		fmt.Sprintf("-vf scale=%d:%d", v.videoSize.Width, v.videoSize.Height),
		// Audio is copied (source AAC), not re-encoded.
		"-c:a copy",
		dest,
	)
	return strings.Join(parts, " ")
}
