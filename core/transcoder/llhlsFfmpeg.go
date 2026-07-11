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
	if mirror := t.diskMirrorOutput(); mirror != "" {
		args = append(args, mirror)
	}
	return strings.Join(args, " ")
}

// diskMirrorOutput returns an extra ffmpeg output that mirrors the top rendition
// to disk under data/hls/<highest>/, which gohlslib never does (it serves the
// live low-latency stream entirely from RAM). Two on-disk consumers need it and
// were both broken under LL-HLS: the recorder (archives by copying on-disk HLS
// segments — no disk meant NO archive at all) and the thumbnail generator (grabs
// a frame from the newest on-disk segment — "open data/hls/0: no such file"
// every ~20s). It runs regardless of the recording toggle so thumbnails work
// even with recording off; the online-cleanup timer keeps the directory bounded,
// and it's -c copy (negligible CPU). The recorder mirrors it into an archive
// session and — on FinishSession — remuxes replay.mp4 and offloads to S3 when
// configured, so both local and S3 archives are produced and play back exactly
// as under classic HLS. (See HLSHandler.SegmentWritten: under LL-HLS these
// segments are NOT pushed to the live storage provider, only to the recorder.)
func (t *LLHLSTranscoder) diskMirrorOutput() string {
	port := config.InternalHLSListenerPort
	if port == "" {
		return ""
	}
	// Write to the highest-quality index so the thumbnail generator (which reads
	// that same index) finds segments, and so the archive is the best rendition.
	keep := data.FindHighestVideoQualityIndex(t.currentStreamOutputSettings)
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
		// Encoders like OBS NVENC carry SPS/PPS only in the FLV extradata and
		// never repeat them in-band; ffmpeg 5.1's auto-inserted mp4toannexb
		// only prepends them to the FIRST IDR, so every later segment is
		// undecodable on its own (thumbnails, replay.mp4 remux and DVR all
		// read these segments standalone). dump_extra (after mp4toannexb has
		// converted the extradata to Annex B) re-injects the parameter sets
		// at every keyframe; duplicates are legal and harmless.
		"-bsf:v h264_mp4toannexb,dump_extra",
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
		// Same parameter-set re-injection as the disk mirror (see
		// diskMirrorOutput): gohlslib builds each rendition's init segment from
		// the in-band SPS/PPS, which header-in-extradata-only encoders (OBS
		// NVENC) otherwise provide exactly once per stream.
		return strings.Join([]string{
			"-map 0:v:0 -map 0:a:0?",
			"-c:v copy",
			"-bsf:v h264_mp4toannexb,dump_extra",
			"-c:a copy",
			dest,
		}, " ")
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
