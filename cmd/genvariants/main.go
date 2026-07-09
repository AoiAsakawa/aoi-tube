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
	// Transcoded rungs run at 30fps, not 60: two 60fps veryfast transcodes plus
	// the WebRTC re-encode saturated the 4-core box (loadavg > cores), so the
	// transcodes fell behind real time and playback stalled. 30fps halves the
	// encode work and stays smooth; the source passthrough keeps full 60fps.
	variants := []models.StreamOutputVariant{
		{Name: "Source (passthrough)", IsVideoPassthrough: true, IsAudioPassthrough: true, CPUUsageLevel: 2},
		{Name: "30fps@360p", IsAudioPassthrough: true, VideoBitrate: 700, ScaledWidth: 640, ScaledHeight: 360, Framerate: 30, CPUUsageLevel: 2},
		{Name: "30fps@720p", IsAudioPassthrough: true, VideoBitrate: 2500, ScaledWidth: 1280, ScaledHeight: 720, Framerate: 30, CPUUsageLevel: 2},
	}
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(variants); err != nil {
		panic(err)
	}
	fmt.Println(base64.StdEncoding.EncodeToString(buf.Bytes()))
}
