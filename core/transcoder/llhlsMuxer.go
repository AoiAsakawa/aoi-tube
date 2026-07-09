package transcoder

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/models"
	"github.com/bluenviron/gohlslib/v2"
	"github.com/bluenviron/gohlslib/v2/pkg/codecs"
	"github.com/bluenviron/mediacommon/v2/pkg/formats/mpegts"
	log "github.com/sirupsen/logrus"
)

// llhlsRendition is a single ABR rendition served by its own gohlslib
// Low-Latency muxer, fed an MPEG-TS elementary stream from ffmpeg over a
// loopback TCP connection.
type llhlsRendition struct {
	index    int
	variant  models.StreamOutputVariant
	listener net.Listener
	port     int

	mu    sync.RWMutex
	muxer *gohlslib.Muxer
	// videoPlaylist / audioPlaylist are the file names gohlslib assigns to this
	// rendition's media playlists (e.g. "video1_stream.m3u8"), discovered from
	// the muxer's own master. streamInf is the muxer's STREAM-INF attribute list.
	videoPlaylist string
	audioPlaylist string
	streamInf     string
}

// LLHLSMuxerManager runs one gohlslib Low-Latency muxer per rendition and
// serves a synthesized ABR master playlist plus each muxer's file set. This is
// real LL-HLS: EXT-X-PART partial segments, EXT-X-PRELOAD-HINT and blocking
// playlist reload, with correct A/V interleaving (unlike the old ffmpeg fMP4
// output, which had no parts and drifted A/V under video.js).
type LLHLSMuxerManager struct {
	renditions []*llhlsRendition
	segSeconds int
	partMS     int

	mu      sync.RWMutex
	started bool
	closed  bool
}

// NewLLHLSMuxerManager binds one loopback TCP listener per rendition (ffmpeg
// connects to these to deliver MPEG-TS). Muxers are created lazily when ffmpeg
// connects, since the track set is only known once the MPEG-TS PMT arrives.
func NewLLHLSMuxerManager(variants []models.StreamOutputVariant, segmentSeconds, partMS int) (*LLHLSMuxerManager, error) {
	if segmentSeconds <= 0 {
		segmentSeconds = 1
	}
	if partMS <= 0 {
		partMS = 200
	}
	m := &LLHLSMuxerManager{segSeconds: segmentSeconds, partMS: partMS}
	for i, v := range variants {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			m.Stop()
			return nil, fmt.Errorf("llhls: listen for rendition %d: %w", i, err)
		}
		m.renditions = append(m.renditions, &llhlsRendition{
			index:    i,
			variant:  v,
			listener: ln,
			port:     ln.Addr().(*net.TCPAddr).Port,
		})
	}
	return m, nil
}

// Ports returns the loopback TCP port for each rendition, in order, so the
// ffmpeg command can target them.
func (m *LLHLSMuxerManager) Ports() []int {
	ports := make([]int, len(m.renditions))
	for i, r := range m.renditions {
		ports[i] = r.port
	}
	return ports
}

// Start begins accepting the ffmpeg MPEG-TS connections for every rendition.
func (m *LLHLSMuxerManager) Start() {
	m.mu.Lock()
	m.started = true
	m.mu.Unlock()
	for _, r := range m.renditions {
		go m.acceptLoop(r)
	}
	log.Infof("LL-HLS: gohlslib muxer manager started (%d renditions)", len(m.renditions))
}

func (m *LLHLSMuxerManager) acceptLoop(r *llhlsRendition) {
	for {
		conn, err := r.listener.Accept()
		if err != nil {
			return // listener closed on Stop
		}
		go m.serveConnection(r, conn)
	}
}

// serveConnection reads one MPEG-TS stream from ffmpeg, builds the gohlslib
// tracks from its PMT, starts a muxer and pumps access units into it.
func (m *LLHLSMuxerManager) serveConnection(r *llhlsRendition, conn net.Conn) {
	defer conn.Close()

	reader, err := mpegts.NewReader(bufio.NewReaderSize(conn, 64*1024))
	if err != nil {
		log.Errorf("LL-HLS rendition %d: mpegts reader: %v", r.index, err)
		return
	}

	var videoTrack, audioTrack *gohlslib.Track
	var vSrc, aSrc *mpegts.Track
	for _, tr := range reader.Tracks() {
		switch c := tr.Codec.(type) {
		case *mpegts.CodecH264:
			videoTrack = &gohlslib.Track{Codec: &codecs.H264{}, ClockRate: 90000}
			vSrc = tr
		case *mpegts.CodecMPEG4Audio:
			audioTrack = &gohlslib.Track{Codec: &codecs.MPEG4Audio{Config: c.Config}, ClockRate: c.Config.SampleRate}
			aSrc = tr
		default:
			log.Debugf("LL-HLS rendition %d: ignoring track codec %T", r.index, c)
		}
	}
	if videoTrack == nil {
		log.Errorf("LL-HLS rendition %d: no H264 video track in MPEG-TS", r.index)
		return
	}

	tracks := []*gohlslib.Track{videoTrack}
	if audioTrack != nil {
		tracks = append(tracks, audioTrack)
	}

	muxer := &gohlslib.Muxer{
		Variant:            gohlslib.MuxerVariantLowLatency,
		Tracks:             tracks,
		SegmentMinDuration: time.Duration(m.segSeconds) * time.Second,
		PartMinDuration:    time.Duration(m.partMS) * time.Millisecond,
	}
	if err := muxer.Start(); err != nil {
		log.Errorf("LL-HLS rendition %d: muxer start: %v", r.index, err)
		return
	}

	// MPEG-TS PTS is always in the 90kHz clock, which matches the video track's
	// ClockRate directly. The audio track's ClockRate is its sample rate, so the
	// 90kHz PTS must be rescaled to the sample-rate clock — otherwise gohlslib
	// treats it as a 48kHz timestamp and stretches the audio timeline (~1.875x),
	// which desyncs A/V and makes the player buffer heavily (low fps / high
	// latency / slow start).
	reader.OnDataH264(vSrc, func(pts, _ int64, au [][]byte) error {
		return muxer.WriteH264(videoTrack, time.Now(), pts, au)
	})
	if aSrc != nil {
		audioClock := int64(audioTrack.ClockRate)
		reader.OnDataMPEG4Audio(aSrc, func(pts int64, aus [][]byte) error {
			apts := pts * audioClock / 90000
			return muxer.WriteMPEG4Audio(audioTrack, time.Now(), apts, aus)
		})
	}

	r.mu.Lock()
	// A new connection (stream restart) replaces the previous muxer.
	if r.muxer != nil {
		r.muxer.Close()
	}
	r.muxer = muxer
	r.videoPlaylist, r.audioPlaylist, r.streamInf = "", "", ""
	r.mu.Unlock()

	log.Infof("LL-HLS rendition %d: muxer online (audio=%v)", r.index, audioTrack != nil)

	for {
		if err := reader.Read(); err != nil {
			log.Debugf("LL-HLS rendition %d: read loop ended: %v", r.index, err)
			break
		}
	}

	r.mu.Lock()
	if r.muxer == muxer {
		muxer.Close()
		r.muxer = nil
	}
	r.mu.Unlock()
}

// Stop closes all listeners and muxers.
func (m *LLHLSMuxerManager) Stop() {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	m.closed = true
	m.mu.Unlock()

	for _, r := range m.renditions {
		if r.listener != nil {
			r.listener.Close()
		}
		r.mu.Lock()
		if r.muxer != nil {
			r.muxer.Close()
			r.muxer = nil
		}
		r.mu.Unlock()
	}
	log.Infoln("LL-HLS: gohlslib muxer manager stopped")
}

// Serve dispatches an /hls/ request (relativePath is the path with the "/hls/"
// prefix already stripped, e.g. "stream.m3u8" or "0/video1_stream.m3u8").
// Returns false when the request isn't for the LL-HLS muxers (caller falls back
// to disk serving, e.g. the offline clip).
func (m *LLHLSMuxerManager) Serve(w http.ResponseWriter, req *http.Request, relativePath string) bool {
	if relativePath == "stream.m3u8" {
		body, ok := m.masterPlaylist()
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return true
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		_, _ = w.Write(body)
		return true
	}

	// Rendition file: "<index>/<file>".
	slash := strings.IndexByte(relativePath, '/')
	if slash < 0 {
		return false
	}
	idxStr, file := relativePath[:slash], relativePath[slash+1:]
	r := m.renditionByIndexString(idxStr)
	if r == nil {
		return false
	}
	r.mu.RLock()
	muxer := r.muxer
	r.mu.RUnlock()
	if muxer == nil {
		w.WriteHeader(http.StatusNotFound)
		return true
	}
	// gohlslib's Handle dispatches on the request path's last element. Clone the
	// REAL request (keeping its context and query) rather than fabricating one
	// with httptest: the real context is cancelled when the client disconnects or
	// aborts a pending blocking reload (which happens on every quality switch), so
	// gohlslib stops holding that long-poll instead of leaking a blocked goroutine.
	inner := req.Clone(req.Context())
	inner.URL.Path = "/" + file // RawQuery (_HLS_msn/_HLS_part) is preserved by Clone
	muxer.Handle(w, inner)
	return true
}

func (m *LLHLSMuxerManager) renditionByIndexString(s string) *llhlsRendition {
	for _, r := range m.renditions {
		if fmt.Sprintf("%d", r.index) == s {
			return r
		}
	}
	return nil
}

// masterPlaylist synthesizes an ABR master playlist that references every
// rendition's gohlslib video media playlist plus a SINGLE shared audio group.
// All renditions carry the same source audio, so pointing every video variant
// at one audio rendition means switching video quality doesn't force the player
// to reload the audio track (per-rendition audio groups froze playback on a
// quality change). Returns ok=false until at least one rendition is online.
func (m *LLHLSMuxerManager) masterPlaylist() ([]byte, bool) {
	type info struct {
		index     int
		video     string
		audio     string
		streamInf string
	}
	var ready []info
	for _, r := range m.renditions {
		video, audio, streamInf, ok := m.renditionMasterInfo(r)
		if !ok {
			continue
		}
		ready = append(ready, info{r.index, video, audio, streamInf})
	}
	if len(ready) == 0 {
		return nil, false
	}

	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:10\n#EXT-X-INDEPENDENT-SEGMENTS\n\n")

	// One shared audio group from the first rendition that has audio.
	sharedAudio, sharedAudioIdx := "", -1
	for _, i := range ready {
		if i.audio != "" {
			sharedAudio, sharedAudioIdx = i.audio, i.index
			break
		}
	}
	if sharedAudio != "" {
		b.WriteString(fmt.Sprintf(
			"#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"audio\",DEFAULT=YES,AUTOSELECT=YES,URI=\"%d/%s\"\n\n",
			sharedAudioIdx, sharedAudio))
	}

	for _, i := range ready {
		inf := i.streamInf
		if sharedAudio != "" {
			inf = fmt.Sprintf("%s,AUDIO=\"audio\"", inf)
		}
		b.WriteString("#EXT-X-STREAM-INF:" + inf + "\n")
		b.WriteString(fmt.Sprintf("%d/%s\n", i.index, i.video))
	}
	return []byte(b.String()), true
}

// renditionMasterInfo returns the video playlist file, audio playlist file and
// STREAM-INF attributes for a rendition, caching them after the first probe of
// the muxer's own master playlist.
func (m *LLHLSMuxerManager) renditionMasterInfo(r *llhlsRendition) (video, audio, streamInf string, ok bool) {
	r.mu.RLock()
	muxer := r.muxer
	video, audio, streamInf = r.videoPlaylist, r.audioPlaylist, r.streamInf
	r.mu.RUnlock()
	if muxer == nil {
		return "", "", "", false
	}
	if video != "" {
		return video, audio, streamInf, true
	}

	rec := httptest.NewRecorder()
	muxer.Handle(rec, httptest.NewRequest(http.MethodGet, "/index.m3u8", nil))
	if rec.Code != http.StatusOK {
		return "", "", "", false
	}
	for _, line := range strings.Split(rec.Body.String(), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#EXT-X-MEDIA:") && strings.Contains(line, "TYPE=AUDIO") {
			audio = extractURI(line)
		} else if strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
			streamInf = strings.TrimPrefix(line, "#EXT-X-STREAM-INF:")
			// Drop any AUDIO="..." gohlslib added; we assign our own group.
			streamInf = stripAudioAttr(streamInf)
		} else if line != "" && !strings.HasPrefix(line, "#") && strings.HasSuffix(line, ".m3u8") {
			video = line
		}
	}
	if video == "" {
		return "", "", "", false
	}
	r.mu.Lock()
	r.videoPlaylist, r.audioPlaylist, r.streamInf = video, audio, streamInf
	r.mu.Unlock()
	return video, audio, streamInf, true
}

// extractURI pulls the URI="..." value out of an m3u8 tag line.
func extractURI(line string) string {
	i := strings.Index(line, `URI="`)
	if i < 0 {
		return ""
	}
	rest := line[i+5:]
	j := strings.IndexByte(rest, '"')
	if j < 0 {
		return ""
	}
	return rest[:j]
}

// stripAudioAttr removes an AUDIO="..." attribute from a STREAM-INF value.
func stripAudioAttr(inf string) string {
	i := strings.Index(inf, "AUDIO=")
	if i < 0 {
		return inf
	}
	// Remove up to the closing quote (and a leading comma if present).
	rest := inf[i+len("AUDIO="):]
	end := 0
	if strings.HasPrefix(rest, `"`) {
		if k := strings.IndexByte(rest[1:], '"'); k >= 0 {
			end = i + len("AUDIO=") + 1 + k + 1
		}
	}
	trimmed := inf[:i] + inf[end:]
	trimmed = strings.TrimSuffix(strings.TrimSpace(trimmed), ",")
	return strings.TrimSuffix(trimmed, ",")
}
