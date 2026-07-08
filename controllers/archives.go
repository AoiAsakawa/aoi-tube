package controllers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/recording"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
	"github.com/aoiasakawa/aoitube/router/middleware"
	log "github.com/sirupsen/logrus"
)

// archiveFileServer serves recorded VOD files from the archive directory.
var archiveFileServer = http.StripPrefix("/api/archives/", http.FileServer(http.Dir(recording.ArchiveBasePath)))

// listArchiveManifests reads every recorded session manifest. When
// visibleOnly is true, hidden and unfinished sessions are omitted.
func listArchiveManifests(visibleOnly bool) []recording.Manifest {
	manifests := []recording.Manifest{}

	entries, err := os.ReadDir(recording.ArchiveBasePath)
	if err != nil {
		return manifests
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifestPath := filepath.Join(recording.ArchiveBasePath, entry.Name(), "manifest.json")
		b, err := os.ReadFile(manifestPath) // nolint:gosec
		if err != nil {
			continue
		}
		var m recording.Manifest
		if err := json.Unmarshal(b, &m); err != nil {
			continue
		}
		if visibleOnly && (!m.Visible || !m.FinishedOk) {
			continue
		}
		manifests = append(manifests, m)
	}

	// Newest first.
	sort.Slice(manifests, func(i, j int) bool {
		return manifests[i].StartedAt.After(manifests[j].StartedAt)
	})
	return manifests
}

// publicArchive is the listing entry for a visible recording, carrying the
// manifest plus a per-viewer purchased flag for paid archives.
type publicArchive struct {
	recording.Manifest
	// Purchased is true when the requesting authenticated viewer already owns
	// this paid archive (always false for anonymous requests / free archives).
	Purchased bool `json:"purchased"`
}

// GetArchives returns the list of publicly visible recordings. Paid and
// authenticated-only archives are included (so viewers can discover and buy
// them); only the metadata is exposed here — the media itself is gated per
// request by canViewArchive.
func GetArchives(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	manifests := listArchiveManifests(true)
	user := requestChatUser(r)

	out := make([]publicArchive, 0, len(manifests))
	for _, m := range manifests {
		purchased := false
		if m.AccessMode == recording.AccessModePaid && user != nil && user.IsEnabled() {
			if ok, err := data.HasPurchasedArchive(user.ID, m.ID); err == nil {
				purchased = ok
			}
		}
		out = append(out, publicArchive{Manifest: m, Purchased: purchased})
	}
	WriteResponse(w, out)
}

// backfillingSizes guards concurrent S3 size backfills per session.
var backfillingSizes sync.Map

// GetAdminArchives returns all recordings, including hidden ones.
func GetAdminArchives(w http.ResponseWriter, r *http.Request) {
	manifests := listArchiveManifests(false)

	// Lazily backfill SizeBytes on manifests that predate the field. Local
	// sessions are measured synchronously (one directory walk); offloaded
	// sessions list their S3 prefix in the background (thousands of objects)
	// and the size appears on the next page load.
	for i := range manifests {
		m := &manifests[i]
		if m.SizeBytes > 0 || !m.FinishedOk {
			continue
		}
		if !m.RemoteMedia {
			if size := recording.SessionSizeBytes(m.ID); size > 0 {
				m.SizeBytes = size
				if full, ok := recording.ReadManifest(m.ID); ok {
					full.SizeBytes = size
					_ = recording.WriteManifest(m.ID, full)
				}
			}
			continue
		}
		if _, running := backfillingSizes.LoadOrStore(m.ID, true); running {
			continue
		}
		go func(sessionID string) {
			defer backfillingSizes.Delete(sessionID)
			s3, err := storageproviders.NewArchiveS3()
			if err != nil || s3 == nil {
				return
			}
			_, bytes, err := s3.PrefixUsage(storageproviders.ArchiveObjectKey(sessionID) + "/")
			if err != nil || bytes <= 0 {
				return
			}
			if full, ok := recording.ReadManifest(sessionID); ok && full.SizeBytes == 0 {
				full.SizeBytes = bytes
				if err := recording.WriteManifest(sessionID, full); err != nil {
					log.Debugln("archives: unable to persist backfilled size:", err)
				}
			}
		}(m.ID)
	}

	WriteResponse(w, manifests)
}

// getArchiveManifest loads a session's manifest, rejecting path-unsafe IDs.
func getArchiveManifest(sessionID string) (recording.Manifest, bool) {
	if sessionID == "" || strings.ContainsAny(sessionID, "/\\.") {
		return recording.Manifest{}, false
	}
	return recording.ReadManifest(sessionID)
}

// canViewArchive is the access gate for an archive's media and events. It
// enforces the three-tier access model on top of visibility: public archives
// are open, authenticated archives require any logged-in viewer, and paid
// archives require an authenticated viewer who purchased them (admins and
// moderators are always allowed). Runs on every media/playlist/events request
// so it stays authoritative even for S3-proxied segments.
func canViewArchive(r *http.Request, m recording.Manifest) bool {
	// Admins bypass every gate, including visibility: recordings now finish
	// hidden by default, and the admin must be able to preview them before
	// publishing.
	if isAdminRequest(r) {
		return true
	}
	if !m.Visible || !m.FinishedOk {
		return false
	}

	switch m.AccessMode {
	case "", recording.AccessModePublic:
		return true
	case recording.AccessModeAuthenticated:
		u := requestChatUser(r)
		return u != nil && u.IsEnabled() && (u.Authenticated || u.IsModerator())
	case recording.AccessModePaid:
		u := requestChatUser(r)
		if u == nil || !u.IsEnabled() {
			return false
		}
		if u.IsModerator() {
			return true
		}
		purchased, err := data.HasPurchasedArchive(u.ID, m.ID)
		if err != nil {
			log.Debugln("archive: entitlement lookup failed:", err)
			return false
		}
		return purchased
	default:
		// Unknown mode: fail closed.
		return false
	}
}

// canViewArchiveFile gates a single archive file request. The session
// thumbnail is the storefront preview shown on the public list (as a plain
// <img> that cannot carry an access token), so any visible finished archive
// serves it regardless of access tier — admins see hidden ones too. All other
// files require the full entitlement gate.
func canViewArchiveFile(r *http.Request, m recording.Manifest, isThumbnail bool) bool {
	if isThumbnail {
		if isAdminRequest(r) {
			return true
		}
		return m.Visible && m.FinishedOk
	}
	return canViewArchive(r, m)
}

// ServeArchive serves a recorded VOD file (playlist or segment). Paths are
// cleaned and confined to the archive directory to prevent traversal, and the
// owning session must be publicly visible.
func ServeArchive(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	// Reject any traversal attempts before hitting the file server.
	rel := strings.TrimPrefix(r.URL.Path, "/api/archives/")
	if rel == "" || strings.Contains(rel, "..") {
		http.NotFound(w, r)
		return
	}
	cleaned := path.Clean("/" + rel)
	full := filepath.Join(recording.ArchiveBasePath, filepath.FromSlash(cleaned))
	if !strings.HasPrefix(full, filepath.Clean(recording.ArchiveBasePath)+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}

	// First path segment is the session ID; hidden and unpaid sessions must
	// not be served by direct (guessable) ID.
	relPath := strings.TrimPrefix(cleaned, "/")
	sessionID := strings.SplitN(relPath, "/", 2)[0]
	manifest, ok := getArchiveManifest(sessionID)
	isThumbnail := relPath == sessionID+"/thumbnail.jpg"
	if !ok || !canViewArchiveFile(r, manifest, isThumbnail) {
		http.NotFound(w, r)
		return
	}

	// When the session's media was offloaded to S3, proxy segment requests
	// from the bucket (the local copies were deleted). Playlists, thumbnail
	// etc. stay local. Serving is always proxied — never a public CDN
	// redirect — so the visibility gate above keeps hidden archives private.
	if manifest.RemoteMedia && isRemoteArchiveMedia(rel) {
		serveArchiveFromS3(w, r, strings.TrimPrefix(cleaned, "/"))
		return
	}

	if strings.HasSuffix(rel, ".m3u8") {
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	}
	archiveFileServer.ServeHTTP(w, r)
}

// isRemoteArchiveMedia reports whether a request path is for media that may
// live on S3 (segments / fMP4 init) rather than local metadata/playlists.
func isRemoteArchiveMedia(rel string) bool {
	switch path.Ext(rel) {
	case ".m4s", ".ts", ".mp4":
		return true
	default:
		return false
	}
}

// serveArchiveFromS3 streams an offloaded archive object through the server so
// the visibility gate stays authoritative and the bucket can be private.
// Range requests are passed through to S3 so the single-file replay.mp4 can
// be seeked without downloading the whole recording.
func serveArchiveFromS3(w http.ResponseWriter, r *http.Request, archiveRelPath string) {
	uploader := recording.NewUploader()
	downloader, ok := uploader.(interface {
		DownloadRange(archiveRelPath, rangeHeader string) (io.ReadCloser, string, string, int64, error)
	})
	if uploader == nil || !ok {
		// Offload was disabled/misconfigured since this archive was written.
		http.Error(w, "archive storage unavailable", http.StatusServiceUnavailable)
		return
	}

	rangeHeader := r.Header.Get("Range")
	body, contentType, contentRange, length, err := downloader.DownloadRange(archiveRelPath, rangeHeader)
	if err != nil {
		log.Debugln("archive: unable to fetch S3 object", archiveRelPath, err)
		http.NotFound(w, r)
		return
	}
	defer body.Close()

	if contentType == "" {
		switch path.Ext(archiveRelPath) {
		case ".m4s", ".mp4":
			contentType = "video/mp4"
		case ".ts":
			contentType = "video/mp2t"
		}
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	// Offloaded media is immutable (unique per-stream names).
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Accept-Ranges", "bytes")
	if length > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
	}
	if contentRange != "" {
		w.Header().Set("Content-Range", contentRange)
		w.WriteHeader(http.StatusPartialContent)
	}
	if _, err := io.Copy(w, body); err != nil {
		log.Debugln("archive: error streaming S3 object", archiveRelPath, err)
	}
}

// GetArchiveEvents returns the recorded replay event log (chat, Super Chats,
// screen effects) for an archive, so the viewer can replay them in sync with
// VOD playback. Returns an empty array when the archive has no events.
func GetArchiveEvents(w http.ResponseWriter, r *http.Request) {
	middleware.EnableCors(w)

	id := strings.TrimPrefix(r.URL.Path, "/api/archives/events/")
	if id == "" || strings.ContainsAny(id, "/\\.") {
		http.NotFound(w, r)
		return
	}

	// Don't leak chat/Super Chat replay for hidden or unpaid sessions via
	// guessable ID.
	manifest, ok := getArchiveManifest(id)
	if !ok || !canViewArchive(r, manifest) {
		http.NotFound(w, r)
		return
	}

	eventsPath := filepath.Join(recording.ArchiveBasePath, id, "events.jsonl")
	f, err := os.Open(eventsPath) // nolint:gosec
	if err != nil {
		// No events recorded for this session.
		WriteResponse(w, []any{})
		return
	}
	defer f.Close()

	events := []json.RawMessage{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(strings.TrimSpace(string(line))) == 0 {
			continue
		}
		cp := make([]byte, len(line))
		copy(cp, line)
		events = append(events, cp)
	}

	w.Header().Set("Content-Type", "application/json")
	middleware.DisableCache(w)
	_ = json.NewEncoder(w).Encode(events)
}

// DeleteArchive permanently removes a recorded session directory.
func DeleteArchive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	// Accepts a single id (legacy) and/or a list of ids for bulk deletion.
	var req struct {
		ID  string   `json:"id"`
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	ids := req.IDs
	if req.ID != "" {
		ids = append(ids, req.ID)
	}
	if len(ids) == 0 {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}

	uploader := recording.NewUploader()
	deleted := 0
	for _, id := range ids {
		// Session IDs are date-based (no slashes); reject anything else.
		if id == "" || strings.ContainsAny(id, "/\\.") {
			WriteSimpleResponse(w, false, "invalid archive id")
			return
		}

		// Purge any offloaded S3 objects before removing the local metadata
		// (which is what marks the session as remote).
		recording.DeleteRemoteMedia(id, uploader)

		dir := filepath.Join(recording.ArchiveBasePath, id)
		if err := os.RemoveAll(dir); err != nil {
			log.Errorln("unable to delete archive:", err)
			WriteSimpleResponse(w, false, "failed to delete archive")
			return
		}
		deleted++
	}
	WriteSimpleResponse(w, true, fmt.Sprintf("deleted %d", deleted))
}

// SetArchiveVisibility shows or hides a recorded session from the public list.
// SetArchivePricing sets an archive's access mode (public / authenticated /
// paid) and, for paid archives, its price and currency. Admin only.
func SetArchivePricing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req struct {
		ID         string `json:"id"`
		AccessMode string `json:"accessMode"`
		Price      int64  `json:"price"`
		Currency   string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if strings.ContainsAny(req.ID, "/\\.") {
		WriteSimpleResponse(w, false, "invalid archive id")
		return
	}

	switch req.AccessMode {
	case recording.AccessModePublic, recording.AccessModeAuthenticated:
		req.Price = 0
		req.Currency = ""
	case recording.AccessModePaid:
		if req.Price <= 0 {
			WriteSimpleResponse(w, false, "paid archives require a price greater than 0")
			return
		}
		if req.Currency == "" {
			req.Currency = "JPY"
		}
	default:
		WriteSimpleResponse(w, false, "invalid access mode")
		return
	}

	manifestPath := filepath.Join(recording.ArchiveBasePath, req.ID, "manifest.json")
	b, err := os.ReadFile(manifestPath) // nolint:gosec
	if err != nil {
		WriteSimpleResponse(w, false, "archive not found")
		return
	}
	var m recording.Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		WriteSimpleResponse(w, false, "invalid archive manifest")
		return
	}
	m.AccessMode = req.AccessMode
	m.Price = req.Price
	m.Currency = req.Currency
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		WriteSimpleResponse(w, false, "failed to update archive")
		return
	}
	if err := os.WriteFile(manifestPath, out, 0o600); err != nil {
		WriteSimpleResponse(w, false, "failed to write archive manifest")
		return
	}
	WriteSimpleResponse(w, true, "updated")
}

func SetArchiveVisibility(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req struct {
		ID      string `json:"id"`
		Visible bool   `json:"visible"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if strings.ContainsAny(req.ID, "/\\.") {
		WriteSimpleResponse(w, false, "invalid archive id")
		return
	}

	manifestPath := filepath.Join(recording.ArchiveBasePath, req.ID, "manifest.json")
	b, err := os.ReadFile(manifestPath) // nolint:gosec
	if err != nil {
		WriteSimpleResponse(w, false, "archive not found")
		return
	}
	var m recording.Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		WriteSimpleResponse(w, false, "invalid archive manifest")
		return
	}
	m.Visible = req.Visible
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		WriteSimpleResponse(w, false, "failed to update archive")
		return
	}
	if err := os.WriteFile(manifestPath, out, 0o640); err != nil {
		WriteSimpleResponse(w, false, "failed to write archive manifest")
		return
	}
	WriteSimpleResponse(w, true, "updated")
}

// SetArchiveTitle renames a recorded session (admin only).
func SetArchiveTitle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteSimpleResponse(w, false, r.Method+" not supported")
		return
	}

	var req struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		WriteSimpleResponse(w, false, "invalid request body")
		return
	}
	if strings.ContainsAny(req.ID, "/\\.") {
		WriteSimpleResponse(w, false, "invalid archive id")
		return
	}

	title := strings.TrimSpace(req.Title)
	if len(title) > 200 {
		WriteSimpleResponse(w, false, "title is too long")
		return
	}

	m, ok := recording.ReadManifest(req.ID)
	if !ok {
		WriteSimpleResponse(w, false, "archive not found")
		return
	}
	m.Title = title
	if err := recording.WriteManifest(req.ID, m); err != nil {
		WriteSimpleResponse(w, false, "failed to write archive manifest")
		return
	}
	WriteSimpleResponse(w, true, "updated")
}
