package transcoder

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/aoiasakawa/aoitube/models"
)

// fakeEncoder feeds a monitor the progress blocks ffmpeg would write, on a
// clock the test controls.
type fakeEncoder struct {
	t       *testing.T
	monitor *encoderMonitor
	now     time.Time
	outUs   int64
	frame   int64
}

func newFakeEncoder(t *testing.T) *fakeEncoder {
	t.Helper()
	f := &fakeEncoder{t: t, now: time.Date(2026, 7, 9, 21, 0, 0, 0, time.UTC)}
	f.monitor = newEncoderMonitor(func() time.Time { return f.now })
	f.monitor.reset()
	return f
}

// run advances the clock by d in half-second steps. speed is how fast the
// output position moves relative to the clock; frames says whether the frame
// counter moves (it doesn't while ffmpeg waits for input).
func (f *fakeEncoder) run(d time.Duration, speed float64, frames bool) {
	f.t.Helper()
	const step = 500 * time.Millisecond
	for elapsed := time.Duration(0); elapsed < d; elapsed += step {
		f.now = f.now.Add(step)
		f.outUs += int64(float64(step.Microseconds()) * speed)
		if frames {
			f.frame += 15
		}
		for _, line := range []string{
			fmt.Sprintf("frame=%d", f.frame),
			"fps=30.00",
			"stream_0_0_q=28.0",
			"bitrate= 600.1kbits/s",
			"total_size=N/A",
			fmt.Sprintf("out_time_us=%d", f.outUs),
			fmt.Sprintf("out_time_ms=%d", f.outUs),
			"out_time=00:00:01.866667",
			"dup_frames=0",
			"drop_frames=0",
			"speed=   1x",
			"progress=continue",
		} {
			if !f.monitor.consumeLine(line) {
				f.t.Fatalf("progress line %q was not consumed", line)
			}
		}
	}
}

func (f *fakeEncoder) load() EncoderLoad {
	return f.monitor.snapshot()
}

func approx(got, want float64) bool {
	return got > want-0.03 && got < want+0.03
}

func TestEncoderMonitorRealTimeIsHealthy(t *testing.T) {
	f := newFakeEncoder(t)

	f.run(5*time.Second, 1, true)
	if load := f.load(); load.Monitored {
		t.Errorf("load during warm-up = %+v, want unmonitored", load)
	}

	f.run(2*time.Minute, 1, true)
	load := f.load()
	if !load.Monitored || load.FallingBehind || !approx(load.Speed, 1) {
		t.Errorf("load at real time = %+v, want monitored, speed 1, not behind", load)
	}
}

func TestEncoderMonitorReportsSustainedSlowEncode(t *testing.T) {
	f := newFakeEncoder(t)
	f.run(30*time.Second, 1, true)

	// The window average needs a few seconds to drop below the threshold, and
	// the state must then last encoderSlowSustain.
	f.run(15*time.Second, 0.8, true)
	if load := f.load(); load.FallingBehind {
		t.Errorf("reported behind after only 15s of slow encoding: %+v", load)
	}

	f.run(20*time.Second, 0.8, true)
	load := f.load()
	if !load.FallingBehind || !approx(load.Speed, 0.8) {
		t.Errorf("load after 35s at 0.8x = %+v, want behind at speed 0.8", load)
	}

	// Back at real time the warning clears once the window has caught up.
	f.run(15*time.Second, 1, true)
	if load := f.load(); load.FallingBehind || !approx(load.Speed, 1) {
		t.Errorf("load after recovering = %+v, want not behind at speed 1", load)
	}
}

func TestEncoderMonitorIgnoresShortHiccup(t *testing.T) {
	f := newFakeEncoder(t)
	f.run(30*time.Second, 1, true)

	f.run(6*time.Second, 0.4, true)
	f.run(40*time.Second, 1, true)

	if load := f.load(); load.FallingBehind {
		t.Errorf("a 6 second hiccup was reported: %+v", load)
	}
}

func TestEncoderMonitorDoesNotBlameEncoderForStalledInput(t *testing.T) {
	f := newFakeEncoder(t)
	f.run(30*time.Second, 1, true)

	// The broadcaster's upload stalls: ffmpeg has nothing to encode, so
	// neither the output position nor the frame counter moves.
	f.run(time.Minute, 0, false)

	load := f.load()
	if load.FallingBehind {
		t.Errorf("a stalled input was reported as a slow encoder: %+v", load)
	}
	if !load.Monitored || load.Speed != 0 {
		t.Errorf("load while stalled = %+v, want monitored at speed 0", load)
	}
}

func TestEncoderMonitorGoesUnmonitoredWhenReportsStop(t *testing.T) {
	f := newFakeEncoder(t)
	f.run(30*time.Second, 1, true)
	f.run(40*time.Second, 0.7, true)
	if !f.load().FallingBehind {
		t.Fatal("setup: expected the encoder to be reported behind")
	}

	// ffmpeg exits without the monitor being reset.
	f.now = f.now.Add(encoderStaleAfter + time.Second)
	if load := f.load(); load.Monitored || load.FallingBehind {
		t.Errorf("load after the reports stopped = %+v, want unmonitored", load)
	}

	f.monitor.reset()
	if load := f.load(); load != (EncoderLoad{}) {
		t.Errorf("load after reset = %+v, want zero", load)
	}
}

func TestEncoderMonitorSkipsBlocksWithoutAPosition(t *testing.T) {
	f := newFakeEncoder(t)

	// Before the first packet is written ffmpeg reports no position.
	for _, line := range []string{"frame=0", "out_time_us=N/A", "out_time_ms=N/A", "progress=continue"} {
		if !f.monitor.consumeLine(line) {
			t.Fatalf("progress line %q was not consumed", line)
		}
	}
	if got := len(f.monitor.samples); got != 0 {
		t.Errorf("a block without a position produced %d sample(s)", got)
	}
}

func TestConsumeLineLeavesLogMessagesAlone(t *testing.T) {
	m := newEncoderMonitor(time.Now)
	m.reset()

	for _, line := range []string{
		"[libx264 @ 0x55d0c8a3f2c0] frame= 100 QP=24.00 NAL=2 Slice:P",
		"[flv @ 0x55d0c8a1e0c0] Packet mismatch 1024 11 11",
		"Error while decoding stream #0:0: Invalid data found when processing input",
		"Unrecognized option 'x264-params'.",
		"Last message repeated 3 times",
		"more samples than frame size",
		"",
	} {
		if m.consumeLine(line) {
			t.Errorf("log line %q was treated as a progress report", line)
		}
	}

	for _, line := range []string{"stream_1_0_q=-1.0", "speed=0.929x", "out_time=00:00:01.866667", "progress=end"} {
		if !m.consumeLine(line) {
			t.Errorf("progress line %q was not consumed", line)
		}
	}
}

// Only the live transcode is measured, so only its command asks ffmpeg for
// progress reports. A file input (the offline clip) keeps its old command.
func TestOnlyLiveTranscodeAsksForProgress(t *testing.T) {
	build := func(input string) string {
		transcoder := new(Transcoder)
		transcoder.ffmpegPath = "ffmpeg"
		transcoder.SetInput(input)
		transcoder.SetOutputPath("fakeOutput")
		transcoder.SetIdentifier("abc")
		transcoder.SetInternalHTTPPort("8123")
		codec := Libx264Codec{}
		transcoder.SetCodec(codec.Name())
		transcoder.currentLatencyLevel = models.GetLatencyLevel(2)
		variant := HLSVariant{}
		variant.isAudioPassthrough = true
		variant.isVideoPassthrough = true
		transcoder.AddVariant(variant)
		return transcoder.getString()
	}

	if live := build("pipe:0"); !strings.Contains(live, " -loglevel warning "+ProgressFlag+" ") {
		t.Errorf("the live command does not ask for progress reports:\n%s", live)
	}
	if file := build("offline.ts"); strings.Contains(file, "-progress") {
		t.Errorf("a file input asks for progress reports:\n%s", file)
	}
}
