package webrtc

import (
	"context"
	"fmt"
	"io"
	"net"
	"os/exec"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
	log "github.com/sirupsen/logrus"
)

// mediaPipeline decodes the live FLV stream and re-encodes it into
// browser-playable WebRTC media: H.264 constrained-baseline video and Opus
// audio, each emitted as an RTP stream over localhost UDP. The RTP packets are
// read back and forwarded, unchanged, into the SFU's local tracks which fan
// them out to every connected viewer.
//
// A dedicated FFmpeg process is required (rather than reusing the HLS
// transcoder output) because browsers cannot play AAC-in-HLS over WebRTC: the
// audio must be Opus and the video must advertise a profile the peer
// negotiated. Re-encoding to constrained baseline guarantees the RTP payload
// matches the SDP the SFU offers.
type mediaPipeline struct {
	cmd        *exec.Cmd
	videoConn  *net.UDPConn
	audioConn  *net.UDPConn
	videoTrack *webrtc.TrackLocalStaticRTP
	audioTrack *webrtc.TrackLocalStaticRTP

	stopOnce sync.Once
	closed   chan struct{}
}

// rtpReadBufferBytes is large enough for a full MTU-sized RTP packet. FFmpeg is
// told to keep packets under pkt_size (1200), so 1500 always fits one datagram.
const rtpReadBufferBytes = 1500

// udpSocketReadBufferBytes enlarges the kernel receive buffer so transient
// bursts from FFmpeg are not dropped before the read loop drains them.
const udpSocketReadBufferBytes = 1 << 20 // 1 MiB

// newMediaPipeline creates the WebRTC local tracks and binds the two localhost
// UDP sockets that will receive RTP from FFmpeg. It does not start FFmpeg; call
// start for that. On any error every partially-created resource is released.
func newMediaPipeline() (*mediaPipeline, error) {
	// Constrained-baseline H.264 (profile-level-id=42e01f, packetization-mode=1).
	// High profile would be higher quality but a 1080p60 high-profile encode can't
	// hold real time on this 4-core box (it drifts A/V); see buildWebRTCAPI.
	videoTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{
			MimeType:    webrtc.MimeTypeH264,
			ClockRate:   90000,
			SDPFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
		},
		"video",
		"aoitube-webrtc",
	)
	if err != nil {
		return nil, fmt.Errorf("creating webrtc video track: %w", err)
	}

	audioTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{
			MimeType:  webrtc.MimeTypeOpus,
			ClockRate: 48000,
			Channels:  2,
		},
		"audio",
		"aoitube-webrtc",
	)
	if err != nil {
		return nil, fmt.Errorf("creating webrtc audio track: %w", err)
	}

	videoConn, err := listenRTP()
	if err != nil {
		return nil, fmt.Errorf("binding webrtc video rtp socket: %w", err)
	}

	audioConn, err := listenRTP()
	if err != nil {
		videoConn.Close()
		return nil, fmt.Errorf("binding webrtc audio rtp socket: %w", err)
	}

	return &mediaPipeline{
		videoConn:  videoConn,
		audioConn:  audioConn,
		videoTrack: videoTrack,
		audioTrack: audioTrack,
		closed:     make(chan struct{}),
	}, nil
}

// listenRTP binds a UDP socket on an OS-assigned localhost port to receive RTP.
// FFmpeg is the sender to this port; the socket only ever receives.
func listenRTP() (*net.UDPConn, error) {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		return nil, err
	}
	// Best-effort: a larger receive buffer tolerates encoder bursts.
	_ = conn.SetReadBuffer(udpSocketReadBufferBytes)
	return conn, nil
}

// videoPort and audioPort report the localhost UDP ports FFmpeg must target.
func (p *mediaPipeline) videoPort() int {
	return p.videoConn.LocalAddr().(*net.UDPAddr).Port
}

func (p *mediaPipeline) audioPort() int {
	return p.audioConn.LocalAddr().(*net.UDPAddr).Port
}

// ffmpegArgs builds the FFmpeg argument vector that reads headerless FLV from
// stdin and produces two RTP outputs (video, audio) to the bound localhost
// ports. Video is re-encoded to constrained-baseline H.264 tuned for
// zero-latency with a one-second keyframe interval (so freshly-joined viewers
// receive a decodable frame quickly, since this SFU does not service RTCP
// keyframe requests). Audio is re-encoded to low-delay stereo Opus at 48 kHz.
func (p *mediaPipeline) ffmpegArgs(ffmpegPath string) []string {
	return p.ffmpegArgsWithInput(ffmpegPath, []string{
		"-fflags", "+genpts+discardcorrupt",
		"-f", "flv",
		"-i", "pipe:0",
	})
}

// ffmpegArgsWithInput builds the argument vector with a caller-supplied input
// specification, so the same encode/RTP-output chain can be fed either the
// live FLV stream (stdin) or a local file (the end-of-stream clip).
func (p *mediaPipeline) ffmpegArgsWithInput(ffmpegPath string, inputArgs []string) []string {
	args := []string{
		ffmpegPath,
		"-hide_banner",
		"-loglevel", "warning",
	}
	args = append(args, inputArgs...)
	args = append(args, []string{

		// Video: constrained-baseline H.264, RTP payload type 96, at the full
		// source resolution/frame rate — WebRTC is the sub-second path and must
		// keep full quality.
		"-map", "0:v:0",
		"-an",
		"-c:v", "libx264",
		"-profile:v", "baseline",
		"-level:v", "3.1",
		"-pix_fmt", "yuv420p",
		"-preset", "veryfast",
		"-tune", "zerolatency",
		"-force_key_frames", "expr:gte(t,n_forced*1)",
		// 6Mbps to match the source: 2500k was far too low for 1080p60 and looked
		// soft/blocky. Bitrate barely affects encode CPU, and there is idle headroom
		// on this box, so this is a free quality win. bufsize = bitrate (1s VBV)
		// keeps the low-latency profile without starving quality.
		"-b:v", "6000k",
		"-maxrate", "6000k",
		"-bufsize", "6000k",
		"-f", "rtp",
		"-payload_type", "96",
		fmt.Sprintf("rtp://127.0.0.1:%d?pkt_size=1200", p.videoPort()),

		// Audio: stereo Opus with in-band FEC, RTP payload type 111. The
		// "audio" application beats "lowdelay" on quality for a ~15ms cost
		// (negligible next to the 1s keyframe cadence), and FEC lets the
		// browser conceal residual UDP loss (the offered fmtp already
		// advertises useinbandfec=1).
		"-map", "0:a:0?",
		"-vn",
		// Regenerate smooth audio timestamps: RTMP/FLV timestamps only have
		// millisecond precision and the jitter otherwise causes audible
		// ms-scale glitches after the Opus re-encode. No first_pts here:
		// forcing the audio to start at 0 while the video keeps its source
		// timestamps shifted the tracks against each other (lip-sync drift).
		"-af", "aresample=async=1",
		"-c:a", "libopus",
		"-application", "audio",
		// :a scoping keeps these on the encoder; a bare "-fec" collides with
		// the RTP muxer's identically-named option and aborts the mux.
		"-fec:a", "1",
		"-packet_loss:a", "5",
		// Constrained VBR at 192k: hard CBR (-vbr off) forces libopus to pad/clip
		// its bit allocation, which produced the audible "warbly/stretchy" artifact
		// on complex passages. Constrained VBR holds the same ~192k target but lets
		// Opus allocate bits where the signal needs them, clearing the artifact
		// while keeping the rate stable.
		"-vbr:a", "constrained",
		"-b:a", "192k",
		"-ar", "48000",
		"-ac", "2",
		"-f", "rtp",
		"-payload_type", "111",
		fmt.Sprintf("rtp://127.0.0.1:%d?pkt_size=1200", p.audioPort()),
	}...)
	return args
}

// playClipBlocking encodes a local clip file into the pipeline's existing RTP
// ports — and therefore into the same tracks every connected viewer is
// subscribed to — pacing it in real time, and returns when the clip finishes.
// Used to show the end-of-stream clip to WebRTC viewers, matching the one HLS
// viewers get appended to their playlists.
func (p *mediaPipeline) playClipBlocking(ffmpegPath, clipPath string, maxWait time.Duration) error {
	args := p.ffmpegArgsWithInput(ffmpegPath, []string{"-re", "-i", clipPath})
	// #nosec G204 -- ffmpegPath is the operator-configured validated binary;
	// clipPath is a server-generated file path.
	cmd := exec.Command(args[0], args[1:]...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting webrtc end-clip ffmpeg: %w", err)
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(maxWait):
		_ = cmd.Process.Kill()
		return fmt.Errorf("webrtc end-clip playback exceeded %s", maxWait)
	case <-p.closed:
		_ = cmd.Process.Kill()
		return nil
	}
}

// start launches FFmpeg reading FLV from the supplied stream and spawns the
// read loops that forward RTP into the SFU tracks. The pipeline owns the
// FFmpeg process lifecycle; failures here are isolated from the HLS transcoder.
func (p *mediaPipeline) start(ffmpegPath string, stdin io.Reader) error {
	args := p.ffmpegArgs(ffmpegPath)
	// #nosec G204 -- ffmpegPath is the operator-configured, validated binary
	// path; all dynamic arguments are integer ports formatted by us.
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdin = stdin

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("creating webrtc ffmpeg stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting webrtc ffmpeg: %w", err)
	}
	p.cmd = cmd

	log.Infof("WebRTC media pipeline started (video rtp :%d, audio rtp :%d)", p.videoPort(), p.audioPort())

	go p.logStderr(stderr)
	go p.readLoop(p.videoConn, p.videoTrack, "video")
	go p.readLoop(p.audioConn, p.audioTrack, "audio")
	go p.wait()

	return nil
}

// readLoop forwards each received RTP datagram straight into the SFU track,
// which fans it out to every viewer (rewriting SSRC and payload type per peer).
// The single reusable buffer is safe because track.Write is synchronous: it
// finishes forwarding before the next ReadFrom overwrites the buffer.
func (p *mediaPipeline) readLoop(conn *net.UDPConn, track *webrtc.TrackLocalStaticRTP, kind string) {
	buf := make([]byte, rtpReadBufferBytes)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			// Closed on stop, or a transient read error.
			select {
			case <-p.closed:
			default:
				log.Debugf("WebRTC %s rtp read ended: %v", kind, err)
			}
			return
		}
		if n == 0 {
			continue
		}
		if _, err := track.Write(buf[:n]); err != nil {
			// Per-viewer write failures are expected during connection setup
			// and teardown; they never stop the pipeline.
			log.Tracef("WebRTC %s track write: %v", kind, err)
		}
	}
}

// logStderr surfaces FFmpeg diagnostics at debug level.
func (p *mediaPipeline) logStderr(stderr io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := stderr.Read(buf)
		if n > 0 {
			log.Debugf("WebRTC ffmpeg: %s", buf[:n])
		}
		if err != nil {
			return
		}
	}
}

// wait reaps the FFmpeg process and tears the pipeline down if it exits on its
// own (encoder crash, corrupt input, end of stream).
func (p *mediaPipeline) wait() {
	err := p.cmd.Wait()
	select {
	case <-p.closed:
		return // expected: we killed it in stop
	default:
	}
	if err != nil {
		log.Warnf("WebRTC media pipeline FFmpeg exited: %v", err)
	} else {
		log.Infoln("WebRTC media pipeline FFmpeg exited")
	}
	p.stop()
}

// stop terminates FFmpeg and closes the UDP sockets, which unblocks the read
// loops. It is safe to call multiple times and from multiple goroutines.
func (p *mediaPipeline) stop() {
	p.stopOnce.Do(func() {
		close(p.closed)

		if p.cmd != nil && p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
			// Reap asynchronously so callers never block on a wedged process.
			go func(cmd *exec.Cmd) {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				done := make(chan struct{})
				go func() { _ = cmd.Wait(); close(done) }()
				select {
				case <-done:
				case <-ctx.Done():
				}
			}(p.cmd)
		}

		if p.videoConn != nil {
			p.videoConn.Close()
		}
		if p.audioConn != nil {
			p.audioConn.Close()
		}

		log.Infoln("WebRTC media pipeline stopped")
	})
}
