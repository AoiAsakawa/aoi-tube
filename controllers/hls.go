package controllers

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/transcoder"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/aoiasakawa/aoitube/router/middleware"
	"github.com/aoiasakawa/aoitube/utils"
)

// HandleHLSRequest will manage all requests to HLS content.
func HandleHLSRequest(w http.ResponseWriter, r *http.Request) {
	// Sanity check to limit requests to HLS file types.
	// Support both traditional HLS (.ts) and LL-HLS fMP4 (.mp4, .m4s) segments
	ext := filepath.Ext(r.URL.Path)
	if ext != ".m3u8" && ext != ".ts" && ext != ".mp4" && ext != ".m4s" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	requestedPath := r.URL.Path
	relativePath := strings.Replace(requestedPath, "/hls/", "", 1)
	fullPath := filepath.Join(config.HLSStoragePath, relativePath)

	// Defense-in-depth traversal guard: ServeMux already path-cleans, but keep
	// the containment explicit (matches the archive handler) so the resolved
	// path can never escape the HLS directory.
	if strings.Contains(relativePath, "..") ||
		!strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(config.HLSStoragePath)+string(os.PathSeparator)) {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	// Playback restrictions: silent (test) mode limits to admins/moderators,
	// and required social auth limits to authenticated users.
	if !canViewStream(r) {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	// Live DVR ("catch-up from the start"): /hls/dvr/... is served from the
	// active recording session directory as a growing EVENT playlist so viewers
	// can seek back to the stream's beginning. It reuses the same access gate
	// (canViewStream, above) and access-token URL decoration as live HLS.
	if relativePath == "dvr" || strings.HasPrefix(relativePath, "dvr/") {
		serveDVR(w, r, strings.TrimPrefix(strings.TrimPrefix(relativePath, "dvr"), "/"), ext)
		return
	}

	// LL-HLS (gohlslib) serves playlists, init segments, segments and parts from
	// memory while a broadcast is live. Delegate to the running muxer manager;
	// fall through to disk serving only when it can't handle the request (e.g.
	// the offline clip between broadcasts).
	if core.GetStatus().Online {
		if mgr := transcoder.GetActiveLLHLSManager(); mgr != nil {
			if mgr.Serve(w, r, relativePath) {
				return
			}
		}
	}

	// If using external storage then only allow requests for the
	// master playlist at stream.m3u8, no variants or segments.
	// Silent mode serves everything locally, so it is exempt — and so is the
	// offline state: the offline clip lives only on local disk, and stale
	// master playlists from the last broadcast may still reference local
	// variant paths, which 404ed for viewers between streams.
	if data.GetS3Config().Enabled && !data.GetSilentStreamMode() && core.GetStatus().Online && relativePath != "stream.m3u8" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	// Handle playlists
	if path.Ext(r.URL.Path) == ".m3u8" {
		// Playlists should never be cached.
		middleware.DisableCache(w)

		// Force the correct content type
		w.Header().Set("Content-Type", "application/x-mpegURL")

		// Use this as an opportunity to mark this viewer as active.
		viewer := models.GenerateViewerFromRequest(r)
		core.SetViewerActive(&viewer)

		// During stream startup ffmpeg writes the variant playlists a few
		// seconds apart, so a freshly-written master can advertise variants
		// whose playlists don't exist yet — players then 404 on them and log
		// errors while switching renditions. Serve the master with the
		// not-yet-ready variants filtered out instead.
		if relativePath == "stream.m3u8" && core.GetStatus().Online {
			if body, ok := filterMasterPlaylistToReadyVariants(fullPath); ok {
				middleware.EnableCors(w)
				_, _ = w.Write(body)
				return
			}
		}
	} else if ext == ".mp4" || ext == ".m4s" {
		// fMP4 segments for LL-HLS
		w.Header().Set("Content-Type", "video/mp4")
		cacheTime := utils.GetCacheDurationSecondsForPath(relativePath)
		w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(cacheTime))
	} else {
		cacheTime := utils.GetCacheDurationSecondsForPath(relativePath)
		w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(cacheTime))
	}

	middleware.EnableCors(w)
	http.ServeFile(w, r, fullPath)
}

// serveDVR serves the active recording session as a live DVR ("catch-up from
// the start") stream. rest is the path under the session directory:
// "stream.m3u8" (master), "<N>/stream.m3u8" (variant) or "<N>/stream-...ts"
// (segment). The master isn't written to disk until the session finalizes, so
// it is synthesized on the fly; variant playlists are rewritten from VOD to
// EVENT so the player keeps reloading and appending new segments while still
// allowing a seek back to the beginning. Segments live under
// data/archives/<sessionID>/ which the online cleanup timer never prunes, so
// the entire session stays seekable.
func serveDVR(w http.ResponseWriter, r *http.Request, rest, ext string) {
	sessionDir, available := recording.Get().DVRSessionDir()
	if !available || sessionDir == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	// Traversal guard: the resolved path must stay inside the session dir.
	if strings.Contains(rest, "..") {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	fullPath := filepath.Join(sessionDir, rest)
	if fullPath != sessionDir &&
		!strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(sessionDir)+string(os.PathSeparator)) {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	middleware.EnableCors(w)

	// Master playlist request: synthesize one pointing at the recorded
	// variant(s), since writeMasterPlaylist only runs when the session ends.
	if rest == "" || rest == "stream.m3u8" {
		body, ok := buildDVRMaster(sessionDir)
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		middleware.DisableCache(w)
		w.Header().Set("Content-Type", "application/x-mpegURL")
		_, _ = w.Write(body)
		return
	}

	if ext == ".m3u8" {
		body, err := os.ReadFile(fullPath)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		middleware.DisableCache(w)
		w.Header().Set("Content-Type", "application/x-mpegURL")
		_, _ = w.Write(rewriteDVRPlaylist(body))
		return
	}

	cacheTime := utils.GetCacheDurationSecondsForPath(rest)
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(cacheTime))
	if ext == ".mp4" || ext == ".m4s" {
		w.Header().Set("Content-Type", "video/mp4")
	}
	http.ServeFile(w, r, fullPath)
}

// rewriteDVRPlaylist turns a recorder VOD variant playlist into an EVENT
// playlist so the player treats it as a growing, seekable live DVR: the
// PLAYLIST-TYPE flips VOD->EVENT and any ENDLIST is stripped (the live session
// hasn't ended yet).
func rewriteDVRPlaylist(body []byte) []byte {
	s := string(body)
	s = strings.Replace(s, "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-PLAYLIST-TYPE:EVENT", 1)
	s = strings.ReplaceAll(s, "#EXT-X-ENDLIST\n", "")
	s = strings.ReplaceAll(s, "#EXT-X-ENDLIST", "")
	return []byte(s)
}

// buildDVRMaster synthesizes a minimal master playlist for the DVR stream by
// scanning the session directory for numeric variant subdirectories that hold a
// stream.m3u8. Bandwidth values are nominal (DVR needs no ABR — recording is
// typically highest-quality-only) and rise with the variant index, which in
// this codebase orders renditions low-to-high.
func buildDVRMaster(sessionDir string) ([]byte, bool) {
	entries, err := os.ReadDir(sessionDir)
	if err != nil {
		return nil, false
	}
	var indexes []int
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		n, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		if _, err := os.Stat(filepath.Join(sessionDir, e.Name(), "stream.m3u8")); err != nil {
			continue
		}
		indexes = append(indexes, n)
	}
	if len(indexes) == 0 {
		return nil, false
	}
	sort.Ints(indexes)

	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	for _, n := range indexes {
		fmt.Fprintf(&b, "#EXT-X-STREAM-INF:BANDWIDTH=%d\n", (n+1)*2_000_000)
		fmt.Fprintf(&b, "%d/stream.m3u8\n", n)
	}
	return []byte(b.String()), true
}

// masterVariantURIPattern extracts the variant index from a master playlist
// URI, matching both local ("0/stream.m3u8") and rewritten remote-storage
// ("https://cdn.example.com/hls/0/stream.m3u8") forms.
var masterVariantURIPattern = regexp.MustCompile(`(?:^|/)(\d+)/stream\.m3u8$`)

// filterMasterPlaylistToReadyVariants returns the master playlist with
// variant entries removed when their local playlist file doesn't exist yet.
// Variant playlists are written locally before any remote-storage upload, so
// local existence is the readiness signal in both storage modes. Returns
// ok=false (caller falls back to serving the file as-is) when the master
// can't be read, has no variants, or no variant is ready yet.
func filterMasterPlaylistToReadyVariants(masterPath string) ([]byte, bool) {
	content, err := os.ReadFile(masterPath) // nolint: gosec
	if err != nil {
		return nil, false
	}

	lines := strings.Split(string(content), "\n")
	filtered := make([]string, 0, len(lines))
	totalVariants := 0
	readyVariants := 0

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if strings.HasPrefix(line, "#EXT-X-STREAM-INF") && i+1 < len(lines) {
			uri := strings.TrimSpace(lines[i+1])
			totalVariants++

			match := masterVariantURIPattern.FindStringSubmatch(uri)
			if match == nil {
				// Unrecognized URI shape: keep it rather than guess.
				filtered = append(filtered, line, lines[i+1])
				readyVariants++
			} else if utils.DoesFileExists(filepath.Join(config.HLSStoragePath, match[1], "stream.m3u8")) {
				filtered = append(filtered, line, lines[i+1])
				readyVariants++
			}
			i++
			continue
		}
		filtered = append(filtered, line)
	}

	if totalVariants == 0 || readyVariants == 0 || readyVariants == totalVariants {
		return nil, false
	}

	return []byte(strings.Join(filtered, "\n")), true
}
