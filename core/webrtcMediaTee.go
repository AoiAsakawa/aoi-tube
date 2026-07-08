package core

import (
	"io"
	"sync"

	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/webrtc"
	"github.com/aoiasakawa/aoitube/utils"
)

// dropWriterQueueDepth bounds how many pending RTMP chunks the WebRTC tee will
// buffer before it starts dropping. Under normal load FFmpeg keeps the queue
// near-empty; the bound only matters if the encoder stalls, in which case
// dropping (rather than blocking) is what keeps the HLS transcoder unaffected.
const dropWriterQueueDepth = 256

// dropWriter is a non-blocking io.Writer: Write copies the bytes and enqueues
// them, dropping when the queue is full instead of blocking the caller. A
// background goroutine drains the queue to the wrapped writer. This is what lets
// the RTMP tee feed the WebRTC pipeline without ever back-pressuring the HLS
// transcoder that shares the same source stream.
type dropWriter struct {
	ch        chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

func newDropWriter(w io.Writer) *dropWriter {
	d := &dropWriter{
		ch:   make(chan []byte, dropWriterQueueDepth),
		done: make(chan struct{}),
	}
	go d.drain(w)
	return d
}

func (d *dropWriter) Write(p []byte) (int, error) {
	// io.Copy reuses its buffer after Write returns, so the bytes must be
	// copied before they are handed to the drain goroutine.
	b := make([]byte, len(p))
	copy(b, p)

	select {
	case d.ch <- b:
	default:
		// Queue full: drop to protect the HLS transcoder from encoder stalls.
	}
	return len(p), nil
}

func (d *dropWriter) drain(w io.Writer) {
	for {
		select {
		case b := <-d.ch:
			if _, err := w.Write(b); err != nil {
				return
			}
		case <-d.done:
			return
		}
	}
}

func (d *dropWriter) close() {
	d.closeOnce.Do(func() { close(d.done) })
}

// startWebRTCMediaTee fans the incoming RTMP/FLV stream out to both the HLS
// transcoder (via the returned reader) and the WebRTC media pipeline. The
// WebRTC side receives data through a non-blocking, drop-on-backpressure writer
// so a slow or stalled WebRTC encoder can never delay the transcoder that
// serves every HLS/LL-HLS viewer.
//
// If the WebRTC pipeline fails to start, the original reader is returned
// unchanged so HLS proceeds exactly as it would without WebRTC.
func startWebRTCMediaTee(rtmpOut *io.PipeReader) *io.PipeReader {
	ffmpegPath := utils.ValidatedFfmpegPath(data.GetFfMpegPath())

	webrtcReader, webrtcWriter := io.Pipe()
	if err := webrtc.GetSFU().StartMedia(ffmpegPath, webrtcReader); err != nil {
		log.Warnln("WebRTC media pipeline not started, HLS unaffected:", err)
		_ = webrtcReader.Close()
		_ = webrtcWriter.Close()
		return rtmpOut
	}

	transcoderReader, transcoderWriter := io.Pipe()
	drop := newDropWriter(webrtcWriter)

	go func() {
		// The transcoder writer comes first so its back-pressure semantics are
		// identical to feeding it directly; the drop writer never blocks.
		mw := io.MultiWriter(transcoderWriter, drop)
		if _, err := io.Copy(mw, rtmpOut); err != nil {
			log.Debugln("RTMP tee copy ended:", err)
		}
		_ = transcoderWriter.Close()
		drop.close()
		_ = webrtcWriter.Close()
		webrtc.GetSFU().StopMedia()
	}()

	return transcoderReader
}
