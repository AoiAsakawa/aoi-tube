package rtmp

import (
	"time"

	"github.com/aoiasakawa/aoitube/models"
	"github.com/nareix/joy5/format/flv/flvio"
	log "github.com/sirupsen/logrus"
)

func setCurrentBroadcasterInfo(t flvio.Tag, remoteAddr string) {
	data, err := getInboundDetailsFromMetadata(t.DebugFields())
	if err != nil {
		log.Traceln("Unable to parse inbound broadcaster details:", err)
	}

	videoCodec := getVideoCodec(data.VideoCodec)

	// Warn if HEVC is detected, as Enhanced RTMP is not fully supported
	if videoCodec == "H.265" {
		log.Warnln("H.265/HEVC video codec detected via Enhanced RTMP. This is NOT currently supported by AoiTube due to library limitations. The stream will likely fail to transcode. Please use H.264/AVC encoding in your streaming software.")
	}

	broadcaster := models.Broadcaster{
		RemoteAddr: remoteAddr,
		Time:       time.Now(),
		StreamDetails: models.InboundStreamDetails{
			Width:          data.Width,
			Height:         data.Height,
			VideoBitrate:   int(data.VideoBitrate),
			VideoCodec:     videoCodec,
			VideoFramerate: data.VideoFramerate,
			AudioBitrate:   int(data.AudioBitrate),
			AudioCodec:     getAudioCodec(data.AudioCodec),
			Encoder:        data.Encoder,
			VideoOnly:      data.AudioCodec == nil,
		},
	}

	_setBroadcaster(broadcaster)
}
