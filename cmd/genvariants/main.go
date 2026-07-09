package main

import (
	"bytes"
	"encoding/base64"
	"encoding/gob"
	"fmt"

	"github.com/aoiasakawa/aoitube/models"
)

func main() {
	// Transcoded rendition bitrates must stay BELOW the source passthrough so the
	// ABR ladder isn't inverted (the passthrough must be the top rendition by
	// bandwidth, otherwise hls.js parks on the higher-bitrate transcoded rendition
	// and never climbs to 1080p). The OBS source is 5Mbps, so 720p at 2.5M and
	// 360p at 0.7M give a correct 0.7 < 2.5 < 5 ladder with good per-rung quality.
	// CPUUsageLevel 2 == the veryfast x264 preset (good quality/CPU balance).
	// All rungs run at 60fps to match the source. The 4-core budget is freed up
	// for these by making the WebRTC re-encode light (720p30) instead of a full
	// 1080p60 re-encode; see core/webrtc/mediapipeline.go.
	variants := []models.StreamOutputVariant{
		{Name: "Source (passthrough)", IsVideoPassthrough: true, IsAudioPassthrough: true, CPUUsageLevel: 2},
		{Name: "60fps@360p", IsAudioPassthrough: true, VideoBitrate: 700, ScaledWidth: 640, ScaledHeight: 360, Framerate: 60, CPUUsageLevel: 2},
		{Name: "60fps@720p", IsAudioPassthrough: true, VideoBitrate: 2500, ScaledWidth: 1280, ScaledHeight: 720, Framerate: 60, CPUUsageLevel: 2},
	}
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(variants); err != nil {
		panic(err)
	}
	fmt.Println(base64.StdEncoding.EncodeToString(buf.Bytes()))
}
