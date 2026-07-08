package static

import (
	"embed"
	"html/template"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/pkg/errors"
)

// The Vite build (build/web/bundleWeb.sh) emits index.html, admin/index.html
// and a flat assets/ directory. `all:web` embeds the whole tree, including any
// files whose names start with `.` or `_`.
//
//go:embed all:web
var webFiles embed.FS

// GetWeb will return an embedded filesystem reference to the admin web app.
func GetWeb() fs.FS {
	wf, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatal(err)
	}
	return wf
}

//go:embed img/emoji
var emojiFiles embed.FS

// GetEmoji will return the emoji files.
func GetEmoji() fs.FS {
	ef, err := fs.Sub(emojiFiles, "img/emoji")
	if err != nil {
		log.Fatal(err)
	}
	return ef
}

// GetWebIndexTemplate will return the bot/scraper metadata template.
func GetWebIndexTemplate() (*template.Template, error) {
	webFiles := GetWeb()
	name := "index.html"
	t, err := template.ParseFS(webFiles, name)
	if err != nil {
		return nil, errors.Wrap(err, "unable to open index.html template")
	}

	tmpl := template.Must(t, err)
	return tmpl, err
}

//go:embed offline.tsclip
var offlineVideoSegment []byte

// GetOfflineSegment will return the offline video segment data.
func GetOfflineSegment() []byte {
	// Note: static/offline.tsclip must exist at build time for go:embed.
	// Custom overrides are stored in the data directory so builds never delete/overwrite the embedded source asset.
	return getFileSystemDataFileOrDefault("offline.tsclip", offlineVideoSegment)
}

//go:embed offline-init.mp4clip
var offlineVideoSegmentFmp4Init []byte

// GetOfflineSegmentFmp4Init returns the fMP4 initialization segment for the
// offline clip, used when the playlist being appended to is fMP4 (LL-HLS).
func GetOfflineSegmentFmp4Init() []byte {
	return getFileSystemDataFileOrDefault("offline-init.mp4clip", offlineVideoSegmentFmp4Init)
}

//go:embed offline.m4sclip
var offlineVideoSegmentFmp4 []byte

// GetOfflineSegmentFmp4 returns the offline clip as a single fMP4 media
// segment, paired with GetOfflineSegmentFmp4Init.
func GetOfflineSegmentFmp4() []byte {
	return getFileSystemDataFileOrDefault("offline.m4sclip", offlineVideoSegmentFmp4)
}

func getFileSystemDataFileOrDefault(filename string, defaultData []byte) []byte {
	fullPath := filepath.Join(config.DataDirectory, filename)
	data, err := os.ReadFile(fullPath) //nolint: gosec
	if err != nil {
		return defaultData
	}

	return data
}

//go:embed img/logo.png
var logo []byte

// GetLogo will return the logo data.
func GetLogo() []byte {
	return getFileSystemStaticFileOrDefault("img/logo.png", logo)
}

//go:embed img/live-placeholder.jpg
var livePlaceholder []byte

// GetLivePlaceholder returns the poster image shown while a stream is live
// but its first thumbnail has not been generated yet.
func GetLivePlaceholder() []byte {
	return getFileSystemStaticFileOrDefault("img/live-placeholder.jpg", livePlaceholder)
}

func getFileSystemStaticFileOrDefault(path string, defaultData []byte) []byte {
	fullPath := filepath.Join("static", path)
	data, err := os.ReadFile(fullPath) //nolint: gosec
	if err != nil {
		return defaultData
	}

	return data
}
