package transcoder

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/logging"
	"github.com/aoiasakawa/aoitube/models"
	log "github.com/sirupsen/logrus"
	"github.com/teris-io/shortid"
)

// LLHLSTranscoder extends Transcoder for Low-Latency HLS support. It transcodes
// to one MPEG-TS elementary stream per rendition and feeds a gohlslib
// Low-Latency muxer per rendition (real EXT-X-PART + blocking reload), instead
// of the old ffmpeg fMP4 output (no parts, A/V drift).
type LLHLSTranscoder struct {
	*Transcoder
	llhlsLatencyLevel models.LLHLSLatencyLevel
	manager           *LLHLSMuxerManager
}

// NewLLHLSTranscoder creates a new LL-HLS transcoder instance.
func NewLLHLSTranscoder() *LLHLSTranscoder {
	baseTranscoder := NewTranscoder()

	llhls := &LLHLSTranscoder{
		Transcoder:        baseTranscoder,
		llhlsLatencyLevel: data.GetLLHLSLatencyLevel(),
	}

	return llhls
}

// Start will execute the LL-HLS transcoding process.
func (t *LLHLSTranscoder) Start() {
	_lastTranscoderLogMessage = ""

	// One gohlslib Low-Latency muxer per rendition, fed MPEG-TS from ffmpeg over
	// loopback TCP. gohlslib emits real EXT-X-PART parts + blocking reload and
	// keeps A/V in sync; segment/part durations come from the LL-HLS latency level.
	segS := t.llhlsLatencyLevel.SegmentDurationS
	partMS := t.llhlsLatencyLevel.PartDurationMS
	manager, err := NewLLHLSMuxerManager(t.currentStreamOutputSettings, segS, partMS)
	if err != nil {
		log.Errorln("LL-HLS: unable to start muxer manager:", err)
		if t.TranscoderCompleted != nil {
			t.TranscoderCompleted(err)
		}
		return
	}
	t.manager = manager
	manager.Start()
	setActiveLLHLSManager(manager)
	defer func() {
		setActiveLLHLSManager(nil)
		manager.Stop()
	}()

	command := t.getLLHLSMpegtsString(manager.Ports())
	log.Infof("LL-HLS (gohlslib) started using %s with %d rendition(s), segment=%ds part=%dms.", t.codec.DisplayName(), len(t.variants), segS, partMS)

	if config.EnableDebugFeatures {
		log.Println(command)
	}

	_commandExec = exec.Command("sh", "-c", command)

	if t.stdin != nil {
		_commandExec.Stdin = t.stdin
	}

	stdout, err := _commandExec.StderrPipe()
	if err != nil {
		log.Fatalln(err)
	}

	if err := _commandExec.Start(); err != nil {
		log.Errorln("LL-HLS Transcoder error. See", logging.GetTranscoderLogFilePath(), "for full output to debug.")
		log.Panicln(err, command)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			handleTranscoderMessage(line)
		}
	}()

	err = _commandExec.Wait()
	if t.TranscoderCompleted != nil {
		t.TranscoderCompleted(err)
	}

	if err != nil {
		log.Errorln("LL-HLS transcoding error. look at", logging.GetTranscoderLogFilePath(), "to help debug. your copy of ffmpeg may not support your selected codec of", t.codec.Name(), "https://owncast.online/docs/codecs/")
	}
}

// getLLHLSString returns the ffmpeg command string for LL-HLS output.
func (t *LLHLSTranscoder) getLLHLSString() string {
	port := t.internalListenerPort
	localListenerAddress := "http://127.0.0.1:" + port

	// LL-HLS specific flags for low-latency streaming
	// Note: 'split_by_time' and 'independent_segments' cannot be used together
	hlsOptionFlags := []string{
		"program_date_time",
		"delete_segments", // Enable segment deletion for LL-HLS
		"split_by_time",   // Split at exact time boundaries (prioritize this for low latency)
	}

	if t.appendToStream {
		hlsOptionFlags = append(hlsOptionFlags, "append_list")
	}

	if t.segmentIdentifier == "" {
		t.segmentIdentifier = shortid.MustGenerate()
	}

	hlsEventString := ""
	if t.isEvent {
		hlsEventString = "-hls_playlist_type event"
	} else {
		hlsOptionFlags = append(hlsOptionFlags, "omit_endlist")
	}

	hlsOptionsString := ""
	if len(hlsOptionFlags) > 0 {
		hlsOptionsString = "-hls_flags " + strings.Join(hlsOptionFlags, "+")
	}

	// Force a very short segment duration for low latency. Sub-second segments
	// roughly halve the HLS latency floor (the player syncs N segments behind
	// the live edge, so shorter segments mean less lag) at the cost of more
	// keyframes and more segment files.
	segmentDurationSeconds := 0.5
	log.Infof("LL-HLS forcing segment duration to %.3fs for low latency", segmentDurationSeconds)

	// Align the per-variant keyframe interval with the (sub-second) segments.
	// getVideoQualityString derives each transcoded variant's GOP from this
	// override; without it the GOP would come from currentLatencyLevel
	// .SecondsPerSegment (the classic-HLS value, e.g. 3s), placing i-frames far
	// apart while segments are cut every 0.5s — the transcoded renditions'
	// segments would then not start on a keyframe and would lag seconds behind
	// the source passthrough (which copies the encoder's own keyframes).
	t.keyframeIntervalSeconds = segmentDurationSeconds

	// GOP size: one keyframe per segment. Floor at a few frames so a slow input
	// framerate can't produce a degenerate GOP of 0.
	gopSize := int(segmentDurationSeconds*30 + 0.5)
	if gopSize < 5 {
		gopSize = 5
	}

	// Low-latency tuning is only valid for libx264. Hardware encoders (nvenc,
	// vaapi, qsv, videotoolbox) reject a global "-tune zerolatency"/"-preset
	// ultrafast" and fail to initialize; they already receive appropriate
	// low-latency tuning from the per-variant flags, so we must not add a
	// conflicting global tune for them.
	lowLatencyTuning := ""
	if t.codec.Name() == "libx264" {
		lowLatencyTuning = "-tune zerolatency -preset ultrafast"
	}

	ffmpegFlags := []string{
		fmt.Sprintf(`FFREPORT=file="%s":level=32`, logging.GetTranscoderLogFilePath()),
		t.ffmpegPath,
		"-hide_banner",
		"-loglevel warning",
		t.codec.GlobalFlags(),
		"-fflags +genpts+nobuffer+discardcorrupt", // Generate PTS, disable buffering, discard corrupt frames
		"-flags +cgop+low_delay",                  // Force closed GOPs and low delay mode
		"-f flv",                                  // Input format (required for pipe input from RTMP)
		"-analyzeduration 3000000",                // Analyze 3 seconds of input for codec detection
		"-probesize 3000000",                      // Read up to 3MB to probe codec
		"-i", t.input,
		t.getVariantsString(),

		// LL-HLS Output with very short segments
		"-f", "hls",
		"-hls_time", strconv.FormatFloat(segmentDurationSeconds, 'f', -1, 64),
		// Keep ~10s of segments (20 at 0.5s each) so a briefly-stalled player
		// doesn't fall off the sliding window + monotonic media sequence (see
		// NewTranscoder).
		"-hls_list_size 20" + t.getStartNumberString(),

		// LL-HLS specific options
		"-hls_segment_type", "fmp4", // Use fragmented MP4 for LL-HLS
		"-hls_fmp4_init_filename", "init-%v.mp4", // Init segment filename
		"-hls_fmp4_init_resend", "1", // Resend init on reconnect
		"-hls_allow_cache", "0", // Disable caching

		hlsOptionsString,
		hlsEventString,

		// Low-latency encoding tuning (libx264 only; see above).
		lowLatencyTuning,

		// Video settings
		t.codec.ExtraArguments(),
		"-pix_fmt", t.codec.PixelFormat(),
		"-sc_threshold", "0",
		"-g", strconv.Itoa(gopSize), // Short GOP size for low latency

		// Filenames
		"-master_pl_name", "stream.m3u8",
		"-hls_segment_filename", localListenerAddress + "/%v/stream-" + t.segmentIdentifier + "-%d.m4s",
		"-max_muxing_queue_size", "400",
		"-method PUT",
		localListenerAddress + "/%v/stream.m3u8",
	}

	return strings.Join(ffmpegFlags, " ")
}

// calculateLLHLSListSize calculates the playlist size for LL-HLS.
func calculateLLHLSListSize(level models.LLHLSLatencyLevel) int {
	// Keep enough segments to cover approximately 30 seconds
	targetDuration := 30
	segmentsNeeded := targetDuration / level.SegmentDurationS
	if segmentsNeeded < 5 {
		segmentsNeeded = 5
	}
	return segmentsNeeded
}

// GenerateLLHLSMasterPlaylist generates an LL-HLS compliant master playlist.
func GenerateLLHLSMasterPlaylist(variants []models.StreamOutputVariant, serverURL string) string {
	var builder strings.Builder

	builder.WriteString("#EXTM3U\n")
	builder.WriteString("#EXT-X-VERSION:6\n")
	builder.WriteString("#EXT-X-INDEPENDENT-SEGMENTS\n")
	builder.WriteString("\n")

	for i, variant := range variants {
		bandwidth := variant.VideoBitrate * 1000
		if variant.AudioBitrate > 0 {
			bandwidth += variant.AudioBitrate * 1000
		}

		resolution := ""
		if variant.ScaledWidth > 0 && variant.ScaledHeight > 0 {
			resolution = fmt.Sprintf(",RESOLUTION=%dx%d", variant.ScaledWidth, variant.ScaledHeight)
		}

		framerate := ""
		if variant.Framerate > 0 {
			framerate = fmt.Sprintf(",FRAME-RATE=%.3f", float64(variant.Framerate))
		}

		codecs := "avc1.64001f,mp4a.40.2" // H.264 High Profile + AAC-LC
		if variant.IsVideoPassthrough {
			codecs = "avc1.4d401f,mp4a.40.2" // H.264 Main Profile + AAC-LC
		}

		builder.WriteString(fmt.Sprintf("#EXT-X-STREAM-INF:BANDWIDTH=%d,CODECS=\"%s\"%s%s\n",
			bandwidth, codecs, resolution, framerate))
		builder.WriteString(fmt.Sprintf("%d/stream.m3u8\n", i))
	}

	return builder.String()
}

// GenerateLLHLSVariantPlaylist generates an LL-HLS variant playlist with partial segments.
func GenerateLLHLSVariantPlaylist(segments []SegmentInfo, level models.LLHLSLatencyLevel, serverURL string) string {
	var builder strings.Builder

	partDurationSec := float64(level.PartDurationMS) / 1000.0
	partHoldBack := float64(level.PartHoldBack) * partDurationSec

	builder.WriteString("#EXTM3U\n")
	builder.WriteString("#EXT-X-VERSION:9\n") // Version 9 for LL-HLS
	builder.WriteString("#EXT-X-TARGETDURATION:" + strconv.Itoa(level.SegmentDurationS) + "\n")
	builder.WriteString(fmt.Sprintf("#EXT-X-PART-INF:PART-TARGET=%.3f\n", partDurationSec))
	builder.WriteString(fmt.Sprintf("#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=%.3f,CAN-SKIP-UNTIL=%.1f\n",
		partHoldBack, float64(level.SegmentDurationS*6)))
	builder.WriteString("#EXT-X-MAP:URI=\"init.mp4\"\n")
	builder.WriteString("\n")

	for _, seg := range segments {
		// Write partial segments
		for _, part := range seg.Parts {
			independent := ""
			if part.Independent {
				independent = ",INDEPENDENT=YES"
			}
			builder.WriteString(fmt.Sprintf("#EXT-X-PART:DURATION=%.3f,URI=\"%s\"%s\n",
				part.Duration, part.URI, independent))
		}

		// Write full segment
		builder.WriteString(fmt.Sprintf("#EXTINF:%.3f,\n", seg.Duration))
		builder.WriteString(seg.URI + "\n")
	}

	// Preload hint for next part
	builder.WriteString("#EXT-X-PRELOAD-HINT:TYPE=PART,URI=\"next.m4s\"\n")

	return builder.String()
}

// SegmentInfo contains information about an HLS segment.
type SegmentInfo struct {
	URI      string
	Duration float64
	Parts    []PartInfo
}

// PartInfo contains information about an LL-HLS partial segment.
type PartInfo struct {
	URI         string
	Duration    float64
	Independent bool
}

// IsLLHLSEnabled checks if LL-HLS is enabled in config.
func IsLLHLSEnabled() bool {
	return data.GetLLHLSEnabled()
}

func init() {
	log.Debugln("LL-HLS transcoder module initialized")
}
