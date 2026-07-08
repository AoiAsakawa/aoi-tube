package transcoder

import (
	"os"
	"os/exec"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/utils"
)

var _timer *time.Ticker

// StopThumbnailGenerator will stop the periodic generating of a thumbnail from video.
func StopThumbnailGenerator() {
	if _timer != nil {
		_timer.Stop()
	}
}

// StartThumbnailGenerator starts generating thumbnails.
func StartThumbnailGenerator(chunkPath string, variantIndex int) {
	// Every 20 seconds create a thumbnail from the most
	// recent video segment.
	_timer = time.NewTicker(20 * time.Second)
	quit := make(chan struct{})

	go func() {
		for {
			select {
			case <-_timer.C:
				if err := fireThumbnailGenerator(chunkPath, variantIndex); err != nil {
					log.Errorln("Unable to generate thumbnail:", err)
				}
			case <-quit:
				log.Debug("thumbnail generator has stopped")
				_timer.Stop()
				return
			}
		}
	}()
}

func fireThumbnailGenerator(segmentPath string, variantIndex int) error {
	// JPG takes less time to encode than PNG
	outputFile := path.Join(config.TempDir, "thumbnail.jpg")
	previewGifFile := path.Join(config.TempDir, "preview.gif")

	framePath := path.Join(segmentPath, strconv.Itoa(variantIndex))
	files, err := os.ReadDir(framePath)
	if err != nil {
		return err
	}

	type segmentFile struct {
		name string
		mod  time.Time
	}
	var segments []segmentFile
	for _, f := range files {
		// Accept both MPEG-TS and LL-HLS fMP4 media segments. Init segments
		// carry no frames and the appended offline clip is not live content.
		ext := path.Ext(f.Name())
		if ext != ".ts" && ext != ".m4s" {
			continue
		}
		if strings.HasPrefix(f.Name(), "init-") || strings.Contains(f.Name(), "offline") {
			continue
		}

		fi, err := f.Info()
		if err != nil || !fi.Mode().IsRegular() {
			continue
		}
		segments = append(segments, segmentFile{name: f.Name(), mod: fi.ModTime()})
	}

	if len(segments) == 0 {
		return nil
	}

	// LL-HLS splits by time, so with passthrough video most segments do not
	// start on a keyframe and cannot be decoded alone. Concatenate the last
	// few segments (chronological order) so the decoder always crosses an IDR
	// frame; -vframes 1 stops at the first decodable picture, so in practice
	// only a segment or two get read. 8 one-second segments cover even OBS's
	// "auto" keyframe interval (250 frames ≈ 4.2s at 60fps) with margin.
	sort.Slice(segments, func(i, j int) bool { return segments[i].mod.Before(segments[j].mod) })
	const maxConcatSegments = 8
	if len(segments) > maxConcatSegments {
		segments = segments[len(segments)-maxConcatSegments:]
	}

	parts := make([]string, 0, len(segments)+1)
	if path.Ext(segments[0].name) == ".m4s" {
		// A standalone fMP4 media segment cannot be decoded without its init
		// segment.
		initSegment := path.Join(framePath, "init-"+strconv.Itoa(variantIndex)+".mp4")
		if _, err := os.Stat(initSegment); err == nil {
			parts = append(parts, initSegment)
		}
	}
	for _, s := range segments {
		parts = append(parts, path.Join(framePath, s.name))
	}
	inputArg := parts[0]
	if len(parts) > 1 {
		inputArg = "concat:" + strings.Join(parts, "|")
	}

	ffmpegPath := utils.ValidatedFfmpegPath(data.GetFfMpegPath())
	outputFileTemp := path.Join(config.TempDir, "tempthumbnail.jpg")

	thumbnailCmdFlags := []string{
		ffmpegPath,
		"-y",         // Overwrite file
		"-threads 1", // Low priority processing
		// Quoted: fMP4 inputs use the concat:a|b protocol and "|" must not
		// reach the shell as a pipe.
		"-i", `"` + inputArg + `"`,
		"-f image2",  // format
		"-vframes 1", // Single frame: stops at the first decodable picture
		outputFileTemp,
	}

	ffmpegCmd := strings.Join(thumbnailCmdFlags, " ")
	if _, err := exec.Command("sh", "-c", ffmpegCmd).Output(); err != nil {
		return err
	}

	// rename temp file
	if err := utils.Move(outputFileTemp, outputFile); err != nil {
		log.Errorln(err)
	}

	makeAnimatedGifPreview(inputArg, previewGifFile)

	return nil
}

func makeAnimatedGifPreview(sourceFile string, outputFile string) {
	ffmpegPath := utils.ValidatedFfmpegPath(data.GetFfMpegPath())
	outputFileTemp := path.Join(config.TempDir, "temppreview.gif")

	// Filter is pulled from https://engineering.giphy.com/how-to-make-gifs-with-ffmpeg/
	animatedGifFlags := []string{
		ffmpegPath,
		"-y",         // Overwrite file
		"-threads 1", // Low priority processing
		// Quoted: fMP4 inputs use the concat:a|b protocol and "|" must not
		// reach the shell as a pipe.
		"-i", `"` + sourceFile + `"`,
		"-t 1", // Output is one second in length
		"-filter_complex", "\"[0:v] fps=8,scale=w=480:h=-1:flags=lanczos,split [a][b];[a] palettegen=stats_mode=full [p];[b][p] paletteuse=new=1\"",
		outputFileTemp,
	}

	ffmpegCmd := strings.Join(animatedGifFlags, " ")
	if _, err := exec.Command("sh", "-c", ffmpegCmd).Output(); err != nil {
		log.Errorln(err)
		// rename temp file
	} else if err := utils.Move(outputFileTemp, outputFile); err != nil {
		log.Errorln(err)
	}
}
