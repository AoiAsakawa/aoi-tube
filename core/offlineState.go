package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/static"
	"github.com/aoiasakawa/aoitube/utils"
	"github.com/grafov/m3u8"
	log "github.com/sirupsen/logrus"
)

// Duration of the embedded offline clip. If the offline content changes,
// update this to match (both the TS and fMP4 variants are generated from the
// same source clip).
const offlineClipDuration = "10.000000"

const (
	offlineFmp4InitFilename    = "offline-init.mp4"
	offlineFmp4SegmentFilename = "offline.m4s"
)

// appendOfflineToVariantPlaylist adds the offline clip to the end of a live
// media playlist. fMP4 playlists (LL-HLS) get an fMP4 segment with its own
// EXT-X-MAP; TS playlists get the classic TS segment. Mixing containers
// without switching the map would make the clip unplayable.
func appendOfflineToVariantPlaylist(index int, playlistFilePath string) {
	existingPlaylistContents, err := os.ReadFile(playlistFilePath) // nolint: gosec
	if err != nil {
		log.Debugln("unable to read existing playlist file", err)
		return
	}

	tmpFileName := fmt.Sprintf("tmp-stream-%d.m3u8", index)
	atomicWriteTmpPlaylistFile, err := os.CreateTemp(config.TempDir, tmpFileName)
	if err != nil {
		log.Errorln("error creating tmp playlist file to write to", playlistFilePath, err)
		return
	}

	// Write the existing playlist contents
	if _, err := atomicWriteTmpPlaylistFile.Write(existingPlaylistContents); err != nil {
		log.Debugln("error writing existing playlist contents to tmp playlist file", err)
		return
	}

	// Manually append the offline clip to the end of the media playlist.
	_, _ = atomicWriteTmpPlaylistFile.WriteString("#EXT-X-DISCONTINUITY\n")
	if isFmp4Playlist(existingPlaylistContents) {
		_, _ = atomicWriteTmpPlaylistFile.WriteString("#EXT-X-MAP:URI=\"" + offlineFmp4InitFilename + "\"\n")
		_, _ = atomicWriteTmpPlaylistFile.WriteString("#EXTINF:" + offlineClipDuration + ",\n")
		_, _ = atomicWriteTmpPlaylistFile.WriteString(offlineFmp4SegmentFilename + "\n")
	} else {
		_, _ = atomicWriteTmpPlaylistFile.WriteString("#EXTINF:" + offlineClipDuration + ",\n")
		_, _ = atomicWriteTmpPlaylistFile.WriteString("offline.ts\n")
	}
	_, _ = atomicWriteTmpPlaylistFile.WriteString("#EXT-X-ENDLIST\n")

	if err := atomicWriteTmpPlaylistFile.Close(); err != nil {
		log.Errorln(err)
	}

	if err := utils.Move(atomicWriteTmpPlaylistFile.Name(), playlistFilePath); err != nil {
		log.Errorln("error moving temp playlist to overwrite existing one", err)
	}
}

// isFmp4Playlist reports whether a media playlist uses fMP4 segments
// (identified by an EXT-X-MAP init segment, as written in LL-HLS mode).
func isFmp4Playlist(playlist []byte) bool {
	return strings.Contains(string(playlist), "#EXT-X-MAP")
}

func makeVariantIndexOffline(index int, offlineFilePath string, offlineFilename string) {
	playlistFilePath := fmt.Sprintf(filepath.Join(config.HLSStoragePath, "%d/stream.m3u8"), index)

	existingPlaylist, readErr := os.ReadFile(playlistFilePath) // nolint: gosec

	if readErr == nil && isFmp4Playlist(existingPlaylist) {
		// LL-HLS: place the fMP4 offline segment and its init segment next to
		// the live segments so the appended playlist entries resolve.
		variantDir := filepath.Join(config.HLSStoragePath, fmt.Sprintf("%d", index))
		for filename, data := range map[string][]byte{
			offlineFmp4InitFilename:    static.GetOfflineSegmentFmp4Init(),
			offlineFmp4SegmentFilename: static.GetOfflineSegmentFmp4(),
		} {
			targetPath := filepath.Join(variantDir, filename)
			if err := os.WriteFile(targetPath, data, 0o600); err != nil {
				log.Warnln(err)
				continue
			}
			if _, err := _storage.Save(targetPath, 0); err != nil {
				log.Warnln(err)
			}
		}
	} else {
		segmentFilePath := fmt.Sprintf(filepath.Join(config.HLSStoragePath, "%d/%s"), index, offlineFilename)

		if err := utils.Copy(offlineFilePath, segmentFilePath); err != nil {
			log.Warnln(err)
		}

		if _, err := _storage.Save(segmentFilePath, 0); err != nil {
			log.Warnln(err)
		}
	}

	if utils.DoesFileExists(playlistFilePath) {
		appendOfflineToVariantPlaylist(index, playlistFilePath)
	} else {
		createEmptyOfflinePlaylist(playlistFilePath, offlineFilename)
	}
	if _, err := _storage.Save(playlistFilePath, 0); err != nil {
		log.Warnln(err)
	}
}

func createEmptyOfflinePlaylist(playlistFilePath string, offlineFilename string) {
	p, err := m3u8.NewMediaPlaylist(1, 1)
	if err != nil {
		log.Errorln(err)
	}

	// If "offline" content gets changed then change the duration below
	if err := p.Append(offlineFilename, 10.0, ""); err != nil {
		log.Errorln(err)
	}

	p.Close()
	f, err := os.Create(playlistFilePath) //nolint:gosec
	if err != nil {
		log.Errorln(err)
	}
	defer f.Close()
	if _, err := f.Write(p.Encode().Bytes()); err != nil {
		log.Errorln(err)
	}
}

func saveOfflineClipToDisk(offlineFilename string) (string, error) {
	offlineFileData := static.GetOfflineSegment()
	offlineTmpFile, err := os.CreateTemp(config.TempDir, offlineFilename)
	if err != nil {
		log.Errorln("unable to create temp file for offline video segment", err)
	}

	if _, err = offlineTmpFile.Write(offlineFileData); err != nil {
		return "", fmt.Errorf("unable to write offline segment to disk: %s", err)
	}

	offlineFilePath := offlineTmpFile.Name()

	return offlineFilePath, nil
}
