package webrtc

import (
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestListenRTPAssignsDistinctPorts(t *testing.T) {
	p, err := newMediaPipeline()
	if err != nil {
		t.Fatalf("newMediaPipeline: %v", err)
	}
	defer p.stop()

	if p.videoPort() <= 0 || p.audioPort() <= 0 {
		t.Fatalf("expected positive ports, got video=%d audio=%d", p.videoPort(), p.audioPort())
	}
	if p.videoPort() == p.audioPort() {
		t.Fatalf("expected distinct video/audio ports, both = %d", p.videoPort())
	}
}

func TestFfmpegArgsContainCodecsAndPorts(t *testing.T) {
	p, err := newMediaPipeline()
	if err != nil {
		t.Fatalf("newMediaPipeline: %v", err)
	}
	defer p.stop()

	args := strings.Join(p.ffmpegArgs("/usr/bin/ffmpeg"), " ")

	for _, want := range []string{"-f flv", "libx264", "-profile:v high", "libopus", "-f rtp"} {
		if !strings.Contains(args, want) {
			t.Errorf("ffmpeg args missing %q\nargs: %s", want, args)
		}
	}
	if !strings.Contains(args, "127.0.0.1") {
		t.Errorf("ffmpeg args missing loopback rtp target\nargs: %s", args)
	}
}

// TestMediaPipelineEndToEnd runs the full server-side WebRTC path with a real
// FFmpeg process: a synthetic FLV source is re-encoded to H.264/Opus RTP, fed
// into the SFU, and consumed by a Pion peer connection acting as a browser
// viewer. It asserts that decodable RTP actually reaches a viewer. The only
// thing it cannot cover (needing a real browser) is the client-side decode.
func TestMediaPipelineEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping ffmpeg end-to-end test in short mode")
	}
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed; skipping end-to-end test")
	}

	// Synthetic FLV: color test pattern + 440 Hz tone, 6 seconds.
	src := exec.Command(ffmpegPath,
		"-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc2=size=320x240:rate=15",
		"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
		"-t", "6",
		"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-pix_fmt", "yuv420p", "-g", "15",
		"-c:a", "aac", "-b:a", "128k",
		"-f", "flv", "pipe:1",
	)
	flv, err := src.StdoutPipe()
	if err != nil {
		t.Fatalf("source stdout pipe: %v", err)
	}
	if err := src.Start(); err != nil {
		t.Fatalf("start source ffmpeg: %v", err)
	}
	defer func() {
		_ = src.Process.Kill()
		_, _ = src.Process.Wait()
	}()

	// A minimal, hermetic SFU: host ICE candidates only (works on loopback),
	// no datastore dependency. Uses the real API (UDP mux + default
	// interceptors) so the production path is what gets exercised.
	sfu := &SFU{
		viewers: make(map[string]*ViewerConnection),
		enabled: true,
		api:     buildWebRTCAPI(),
	}
	if err := sfu.StartMedia(ffmpegPath, flv); err != nil {
		t.Fatalf("StartMedia: %v", err)
	}
	defer sfu.Stop()

	// Viewer peer connection that only receives.
	viewer, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("viewer NewPeerConnection: %v", err)
	}
	defer viewer.Close()

	if _, err := viewer.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatalf("add video transceiver: %v", err)
	}
	if _, err := viewer.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatalf("add audio transceiver: %v", err)
	}

	var videoPackets, audioPackets int32
	viewer.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		counter := &videoPackets
		if track.Kind() == webrtc.RTPCodecTypeAudio {
			counter = &audioPackets
		}
		for {
			if _, _, err := track.ReadRTP(); err != nil {
				return
			}
			atomic.AddInt32(counter, 1)
		}
	})

	// Non-trickle offer: gather all host candidates before handing it to the SFU.
	offer, err := viewer.CreateOffer(nil)
	if err != nil {
		t.Fatalf("create offer: %v", err)
	}
	gather := webrtc.GatheringCompletePromise(viewer)
	if err := viewer.SetLocalDescription(offer); err != nil {
		t.Fatalf("set local description: %v", err)
	}
	<-gather

	answer, err := sfu.CreateViewerConnection("test-viewer", SessionDescription{
		Type: "offer",
		SDP:  viewer.LocalDescription().SDP,
	}, "127.0.0.1", "go-test")
	if err != nil {
		t.Fatalf("CreateViewerConnection: %v", err)
	}

	if err := viewer.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answer.SDP,
	}); err != nil {
		t.Fatalf("set remote description: %v", err)
	}

	// Wait for RTP to flow. Keyframes are forced every second, so a few
	// seconds is ample on loopback.
	deadline := time.After(15 * time.Second)
	for {
		if atomic.LoadInt32(&videoPackets) >= 3 && atomic.LoadInt32(&audioPackets) >= 1 {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for RTP: video=%d audio=%d",
				atomic.LoadInt32(&videoPackets), atomic.LoadInt32(&audioPackets))
		case <-time.After(200 * time.Millisecond):
		}
	}

	t.Logf("received RTP: video=%d audio=%d",
		atomic.LoadInt32(&videoPackets), atomic.LoadInt32(&audioPackets))
}
