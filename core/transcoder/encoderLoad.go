package transcoder

import (
	"strconv"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
)

// A live transcode has to run at real time. When the encoder can't keep up,
// its output falls further and further behind: segments arrive late, players
// stall or drop to the lowest rendition, and the delay to the broadcaster
// grows. Nothing in the server reported this; it only showed as viewers
// complaining about a stream that got worse the longer it ran.
//
// ffmpeg is asked to report its progress (-progress pipe:2), which it does a
// couple of times a second as blocks of key=value lines. The rate at which its
// position in the output advances, measured over a sliding window, is the
// encoding speed: 1.0 is real time.

const (
	// encoderSpeedWindow is the span the speed is averaged over.
	encoderSpeedWindow = 10 * time.Second
	// encoderSlowThreshold is the speed below which the encoder is losing
	// ground. Normal jitter stays well above it.
	encoderSlowThreshold = 0.90
	// encoderSlowSustain is how long the speed must stay below the threshold
	// before it is reported, so a short hiccup doesn't raise a warning.
	encoderSlowSustain = 20 * time.Second
	// encoderWarmup is ignored at the start of a transcode, while ffmpeg
	// probes the input and waits for the first keyframe.
	encoderWarmup = 15 * time.Second
	// encoderStaleAfter is how old the last progress report may be before the
	// measurement is considered unknown.
	encoderStaleAfter = 10 * time.Second
	// encoderWarnInterval spaces out the log warning while the state lasts.
	encoderWarnInterval = 5 * time.Minute
)

// ProgressFlag makes ffmpeg write its progress reports to stderr, where
// Start reads them. Only live transcodes get it.
const ProgressFlag = "-progress pipe:2"

// EncoderLoad reports whether the live transcoder keeps up with real time.
type EncoderLoad struct {
	// Monitored is false when no live transcode is running, or it has not run
	// long enough to judge.
	Monitored bool `json:"monitored"`
	// Speed is how many seconds of output the encoder produced per second over
	// the last few seconds. 1.0 is real time.
	Speed float64 `json:"speed"`
	// FallingBehind is true once Speed has stayed below real time for long
	// enough that viewers are affected.
	FallingBehind bool `json:"fallingBehind"`
}

type progressSample struct {
	at        time.Time
	outTimeUs int64
	frame     int64
}

// encoderMonitor turns ffmpeg progress reports into an EncoderLoad.
type encoderMonitor struct {
	mu  sync.Mutex
	now func() time.Time

	startedAt time.Time
	samples   []progressSample
	// The progress block being read: a block is a run of key=value lines that
	// ends with a "progress=" line.
	pendingOutTimeUs int64
	pendingFrame     int64
	pendingHasTime   bool

	slowSince  time.Time
	lastWarned time.Time
	load       EncoderLoad
}

func newEncoderMonitor(now func() time.Time) *encoderMonitor {
	return &encoderMonitor{now: now}
}

// liveEncoderMonitor measures the one live transcode the server runs.
var liveEncoderMonitor = newEncoderMonitor(time.Now)

// GetEncoderLoad returns the current measurement for the live transcode.
func GetEncoderLoad() EncoderLoad {
	return liveEncoderMonitor.snapshot()
}

// reset forgets everything; called when a live transcode starts and ends.
func (m *encoderMonitor) reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.startedAt = m.now()
	m.samples = nil
	m.pendingHasTime = false
	m.pendingFrame = 0
	m.slowSince = time.Time{}
	m.lastWarned = time.Time{}
	m.load = EncoderLoad{}
}

// snapshot returns the current measurement, or an unmonitored one when the
// reports stopped coming.
func (m *encoderMonitor) snapshot() EncoderLoad {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.samples) == 0 || m.now().Sub(m.samples[len(m.samples)-1].at) > encoderStaleAfter {
		return EncoderLoad{}
	}
	return m.load
}

// isProgressKey reports whether key is one ffmpeg writes in a progress block.
func isProgressKey(key string) bool {
	switch key {
	case "frame", "fps", "bitrate", "total_size", "out_time_us", "out_time_ms", "out_time",
		"dup_frames", "drop_frames", "speed", "progress":
		return true
	}
	// Per-stream quality, e.g. stream_0_0_q.
	return strings.HasPrefix(key, "stream_") && strings.HasSuffix(key, "_q")
}

// consumeLine handles one line of ffmpeg's stderr. It returns true when the
// line belongs to a progress report, which the caller must then not treat as
// a log message.
func (m *encoderMonitor) consumeLine(line string) bool {
	key, value, found := strings.Cut(line, "=")
	if !found || !isProgressKey(key) {
		return false
	}
	value = strings.TrimSpace(value)

	m.mu.Lock()
	defer m.mu.Unlock()

	switch key {
	case "out_time_us":
		// "N/A" until the first packet is written.
		if us, err := strconv.ParseInt(value, 10, 64); err == nil {
			m.pendingOutTimeUs = us
			m.pendingHasTime = true
		}
	case "frame":
		if frame, err := strconv.ParseInt(value, 10, 64); err == nil {
			m.pendingFrame = frame
		}
	case "progress":
		if m.pendingHasTime {
			m.observe(progressSample{at: m.now(), outTimeUs: m.pendingOutTimeUs, frame: m.pendingFrame})
		}
		m.pendingHasTime = false
	}
	return true
}

// observe records a sample and re-evaluates the load. Callers hold m.mu.
func (m *encoderMonitor) observe(sample progressSample) {
	m.samples = append(m.samples, sample)
	// Keep the window, plus the one sample just before it to measure from.
	cutoff := sample.at.Add(-encoderSpeedWindow)
	first := 0
	for first+1 < len(m.samples) && !m.samples[first+1].at.After(cutoff) {
		first++
	}
	m.samples = m.samples[first:]

	oldest := m.samples[0]
	span := sample.at.Sub(oldest.at)
	if sample.at.Sub(m.startedAt) < encoderWarmup || span < encoderSpeedWindow/2 {
		m.load = EncoderLoad{}
		return
	}

	speed := float64(sample.outTimeUs-oldest.outTimeUs) / float64(span.Microseconds())
	if speed < 0 {
		// The output position jumped back (timestamp discontinuity).
		speed = 0
	}
	// No frames at all means ffmpeg is waiting for input, not struggling to
	// encode it: the broadcaster stalled. That is not the encoder's doing.
	encoding := sample.frame > oldest.frame

	wasBehind := m.load.FallingBehind
	if encoding && speed < encoderSlowThreshold {
		if m.slowSince.IsZero() {
			m.slowSince = sample.at
		}
	} else {
		m.slowSince = time.Time{}
	}
	behind := !m.slowSince.IsZero() && sample.at.Sub(m.slowSince) >= encoderSlowSustain
	m.load = EncoderLoad{Monitored: true, Speed: speed, FallingBehind: behind}

	switch {
	case behind && (!wasBehind || sample.at.Sub(m.lastWarned) >= encoderWarnInterval):
		m.lastWarned = sample.at
		log.Warnf("The video encoder is not keeping up with the stream: it is running at %.0f%% of real time. "+
			"Viewers get a growing delay and buffering. If the server's CPU is busy, lower the output resolution or "+
			"frame rate, or remove an output variant. If it is not, the stream is arriving late from the broadcaster.",
			speed*100)
	case wasBehind && !behind:
		log.Infoln("The video encoder is keeping up with the stream again.")
	}
}
