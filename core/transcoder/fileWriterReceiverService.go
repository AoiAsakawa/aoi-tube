package transcoder

import (
	"bytes"
	"fmt"
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

// variantIndexRe extracts the variant index from a master-playlist variant URI
// ("0/stream.m3u8"), tolerating a leading path/host from remote-storage rewrites.
var variantIndexRe = regexp.MustCompile(`(?:^|/)(\d+)/stream\.m3u8$`)

// codecStringFromInit derives a CODECS value ("avc1.<profile><compat><level>"
// plus ",mp4a.40.2" when audio is present) from a fMP4 init segment by reading
// the avcC box. ffmpeg omits CODECS for passthrough (copy) renditions, and VHS
// then repeatedly excludes/re-includes them, oscillating the ABR. Byte-scans for
// the distinctive "avcC" fourcc rather than walking the full box tree.
func codecStringFromInit(initPath string) (string, bool) {
	data, err := os.ReadFile(initPath) //nolint: gosec
	if err != nil {
		return "", false
	}
	idx := bytes.Index(data, []byte("avcC"))
	// Need the 4-byte type + at least 4 payload bytes (version, profile, compat,
	// level) after it.
	if idx < 0 || idx+8 > len(data) {
		return "", false
	}
	// avcC payload starts at idx+4: [0]=configurationVersion, [1]=profile,
	// [2]=profile_compatibility, [3]=level.
	codec := fmt.Sprintf("avc1.%02x%02x%02x", data[idx+5], data[idx+6], data[idx+7])
	if bytes.Contains(data, []byte("mp4a")) {
		codec += ",mp4a.40.2" // AAC-LC, the RTMP audio codec
	}
	return codec, true
}

// injectPassthroughCodecs adds a CODECS attribute to any master-playlist
// STREAM-INF that lacks one (the source passthrough), reading the codec
// parameters from that variant's init segment. It leaves the playlist unchanged
// when the init isn't readable yet; the master is rewritten every segment, so it
// self-heals once the init exists.
func injectPassthroughCodecs(master []byte) []byte {
	lines := strings.Split(string(master), "\n")
	changed := false
	for i, line := range lines {
		if !strings.HasPrefix(line, "#EXT-X-STREAM-INF:") || strings.Contains(line, "CODECS=") {
			continue
		}
		for j := i + 1; j < len(lines); j++ {
			uri := strings.TrimSpace(lines[j])
			if uri == "" || strings.HasPrefix(uri, "#") {
				continue
			}
			m := variantIndexRe.FindStringSubmatch(uri)
			if m != nil {
				initPath := filepath.Join(config.HLSStoragePath, m[1], "init-"+m[1]+".mp4")
				if codec, ok := codecStringFromInit(initPath); ok {
					lines[i] = strings.TrimRight(line, "\r") + `,CODECS="` + codec + `"`
					changed = true
				}
			}
			break
		}
	}
	if !changed {
		return master
	}
	return []byte(strings.Join(lines, "\n"))
}

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
		body = clampTargetDuration(body)

		if isMasterPlaylist {
			// Fill in the CODECS attribute the passthrough rendition is missing so
			// VHS stops excluding it and thrashing the ABR.
			body = injectPassthroughCodecs(body)
			// writePath already ends in ".tmp"; the callback promotes it after
			// the storage provider rewrites the variant URIs.
			if err := os.WriteFile(writePath, body, 0o600); err != nil { //nolint: gosec
				returnError(err, w)
				return
			}
		} else {
			// Variant playlists are served in place, so write atomically
			// (temp + rename). A plain truncate-then-write leaves a window
			// where a player refreshing the playlist reads an empty/partial
			// file, and VHS crashes on it ("Cannot read properties of
			// undefined (reading 'segments')"). The 0.5s segments doubled the
			// playlist write rate and made this race surface as dropouts.
			tmp := writePath + ".part"
			if err := os.WriteFile(tmp, body, 0o600); err != nil { //nolint: gosec
				returnError(err, w)
				return
			}
			if err := os.Rename(tmp, writePath); err != nil {
				returnError(err, w)
				return
			}
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
