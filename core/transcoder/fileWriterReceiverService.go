package transcoder

import (
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// targetDurationRe matches the EXT-X-TARGETDURATION tag so a sub-second segment
// duration (e.g. 0.5s), which ffmpeg rounds down to an invalid "0", can be
// clamped to the spec-required minimum of 1.
var targetDurationRe = regexp.MustCompile(`(#EXT-X-TARGETDURATION:)(\d+)`)

// clampTargetDuration rewrites any EXT-X-TARGETDURATION below 1 to 1. RFC 8216
// requires a positive integer; ffmpeg emits 0 for 0.5s LL-HLS segments, which
// some players reject or use to compute a zero reload interval.
func clampTargetDuration(playlist []byte) []byte {
	return targetDurationRe.ReplaceAllFunc(playlist, func(match []byte) []byte {
		sub := targetDurationRe.FindSubmatch(match)
		n, err := strconv.Atoi(string(sub[2]))
		if err == nil && n >= 1 {
			return match
		}
		return append(append([]byte{}, sub[1]...), '1')
	})
}

// FileWriterReceiverServiceCallback are to be fired when transcoder responses are written to disk.
type FileWriterReceiverServiceCallback interface {
	SegmentWritten(localFilePath string)
	VariantPlaylistWritten(localFilePath string)
	MasterPlaylistWritten(localFilePath string)
}

// FileWriterReceiverService accepts transcoder responses via HTTP and fires the callbacks.
// It is intended to be the middleman between the transcoder and the storage provider and allows
// the transcoder process to be completely isolated and even run remotely in the future, as long
// as it can send HTTP requests to this service with the results.
type FileWriterReceiverService struct {
	callbacks FileWriterReceiverServiceCallback
}

// SetupFileWriterReceiverService will start listening for transcoder responses.
func (s *FileWriterReceiverService) SetupFileWriterReceiverService(callbacks FileWriterReceiverServiceCallback) {
	s.callbacks = callbacks

	httpServer := http.NewServeMux()
	httpServer.HandleFunc("/", s.uploadHandler)

	localListenerAddress := "127.0.0.1:0"

	listener, err := net.Listen("tcp", localListenerAddress)
	if err != nil {
		log.Fatalln("Unable to start internal video writing service", err)
	}

	listenerPort := strings.Split(listener.Addr().String(), ":")[1]
	config.InternalHLSListenerPort = listenerPort
	log.Traceln("Transcoder response service listening on: " + listenerPort)
	go func() {
		//nolint: gosec
		if err := http.Serve(listener, httpServer); err != nil {
			log.Fatalln("Unable to start internal video writing service", err)
		}
	}()
}

func (s *FileWriterReceiverService) uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	}

	path := r.URL.Path
	writePath := filepath.Join(config.HLSStoragePath, path)

	// The master playlist is served to players from this exact path, but the
	// bytes ffmpeg sends still contain relative variant URIs that the storage
	// provider rewrites afterwards. Writing it in place briefly exposed the
	// un-rewritten playlist to players (who then 404ed on relative variants),
	// so it is written to a temp name and promoted after the rewrite.
	isMasterPlaylist := utils.GetRelativePathFromAbsolutePath(writePath) == "hls/stream.m3u8"
	if isMasterPlaylist {
		writePath += ".tmp"
	}

	// Playlists (small text files) are buffered so the target duration can be
	// clamped to a spec-valid value before hitting disk; segments stream
	// straight through.
	if strings.HasSuffix(path, ".m3u8") {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			returnError(err, w)
			return
		}
		if err := os.WriteFile(writePath, clampTargetDuration(body), 0o600); err != nil { //nolint: gosec
			returnError(err, w)
			return
		}
	} else {
		f, err := os.Create(writePath) //nolint: gosec
		if err != nil {
			returnError(err, w)
			return
		}
		if _, err := io.Copy(f, r.Body); err != nil {
			f.Close()
			returnError(err, w)
			return
		}
		f.Close()
	}

	s.fileWritten(writePath)
	w.WriteHeader(http.StatusOK)
}

func (s *FileWriterReceiverService) fileWritten(path string) {
	rel := utils.GetRelativePathFromAbsolutePath(path)
	if rel == "hls/stream.m3u8" || rel == "hls/stream.m3u8.tmp" {
		s.callbacks.MasterPlaylistWritten(path)
		// The S3 provider rewrites the temp playlist to the final path and
		// removes the temp file. If the provider left it in place (local
		// storage does no rewriting), promote it atomically now.
		if strings.HasSuffix(path, ".tmp") {
			if _, err := os.Stat(path); err == nil {
				if err := os.Rename(path, strings.TrimSuffix(path, ".tmp")); err != nil {
					log.Errorln("unable to promote master playlist:", err)
				}
			}
		}
	} else if strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".m4s") || strings.HasSuffix(path, ".mp4") {
		// Support both traditional HLS (.ts) and LL-HLS fMP4 (.m4s, .mp4 init segments)
		s.callbacks.SegmentWritten(path)
	} else if strings.HasSuffix(path, ".m3u8") {
		s.callbacks.VariantPlaylistWritten(path)
	}
}

func returnError(err error, w http.ResponseWriter) {
	log.Debugln(err)
	http.Error(w, http.StatusText(http.StatusInternalServerError)+": "+err.Error(), http.StatusInternalServerError)
}
