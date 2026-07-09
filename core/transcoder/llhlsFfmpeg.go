package transcoder

import (
	"fmt"
	"strings"
	"sync"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/logging"
	"github.com/teris-io/shortid"
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
	if rec := t.recordingOutput(); rec != "" {
		args = append(args, rec)
	}
	return strings.Join(args, " ")
}

// recordingOutput returns an extra ffmpeg output that records the broadcast to
// the on-disk VOD archive, or "" when recording is disabled. gohlslib serves the
// live low-latency stream entirely from RAM and never writes segments to disk,
// so the recorder — which archives by mirroring on-disk HLS segments — was never
// fed under LL-HLS and produced NO archive. This adds a single copy-codec HLS
// output (no re-encode, negligible CPU: the recorded rendition is the source
// passthrough) that PUTs its segments and playlist to the internal file-writer
// service exactly like the classic transcoder. That service writes them under
// data/hls/<keep>/ and fires the recorder's SegmentWritten / VariantPlaylistWritten
// hooks, which mirror the media into an archive session and — on FinishSession —
// remux replay.mp4 and offload to S3 when configured, so both local and S3
// archives are produced and play back exactly as under classic HLS.
func (t *LLHLSTranscoder) recordingOutput() string {
	if !data.GetRecordingEnabled() {
		return ""
	}
	port := config.InternalHLSListenerPort
	if port == "" {
		return ""
	}
	keep := 0
	if data.GetRecordingHighestOnly() {
		keep = data.FindHighestVideoQualityIndex(t.currentStreamOutputSettings)
	}
	if keep < 0 {
		keep = 0
	}
	if t.segmentIdentifier == "" {
		t.segmentIdentifier = shortid.MustGenerate()
	}
	addr := "http://127.0.0.1:" + port
	return strings.Join([]string{
		"-map 0:v:0 -map 0:a:0?",
		"-c copy",
		"-f hls",
		"-hls_time 4",
		"-hls_list_size 10" + t.getStartNumberString(),
		"-hls_flags append_list+program_date_time",
		"-hls_segment_type mpegts",
		fmt.Sprintf("-hls_segment_filename %s/%d/stream-%s-%%d.ts", addr, keep, t.segmentIdentifier),
		"-method PUT",
		fmt.Sprintf("%s/%d/stream.m3u8", addr, keep),
	}, " ")
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
		// segments at different boundaries — which makes hls.js rebuffer on every
		// quality switch. -sc_threshold 0 keeps ffmpeg from inserting extra
		// scene-cut keys. No -r, so the transcoded renditions keep the source frame
		// rate (full 60fps, and no 60-vs-59.94 mismatch).
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
