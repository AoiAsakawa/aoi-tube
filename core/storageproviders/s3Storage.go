// Package storageproviders implements the live-HLS and recording/VOD storage
// backends (local disk and S3-compatible object storage).
package storageproviders

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/playlist"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/aoiasakawa/aoitube/config"

	"github.com/grafov/m3u8"
)

// S3Storage is the s3 implementation of a storage provider.
type S3Storage struct {
	host string

	s3Endpoint        string
	s3ServingEndpoint string
	s3Region          string
	s3Bucket          string
	s3AccessKey       string
	s3Secret          string
	s3ACL             string
	s3ForcePathStyle  bool

	// If we try to upload a playlist but it is not yet on disk
	// then keep a reference to it here.
	queuedPlaylistUpdates map[string]string

	// lock protects queuedPlaylistUpdates against concurrent segment and
	// playlist upload callbacks (upstream #3440).
	lock sync.Mutex

	// feature/s3/manager is deprecated in favor of feature/s3/transfermanager,
	// but remains fully supported; we stay on it deliberately for its stable,
	// v1-equivalent Uploader semantics.
	uploader *manager.Uploader //nolint:staticcheck
}

// NewS3Storage returns a new S3Storage instance.
func NewS3Storage() *S3Storage {
	return &S3Storage{
		queuedPlaylistUpdates: make(map[string]string),
		lock:                  sync.Mutex{},
	}
}

// Setup sets up the s3 storage for saving the video to s3.
func (s *S3Storage) Setup() error {
	log.Trace("Setting up S3 for external storage of video...")

	s3Config := data.GetS3Config()
	if s3Config.ServingEndpoint != "" {
		s.host = s3Config.ServingEndpoint
	} else {
		s.host = fmt.Sprintf("%s/%s", s3Config.Endpoint, s3Config.Bucket)
	}

	s.s3Endpoint = s3Config.Endpoint
	s.s3ServingEndpoint = s3Config.ServingEndpoint
	s.s3Region = s3Config.Region
	s.s3Bucket = s3Config.Bucket
	s.s3AccessKey = s3Config.AccessKey
	s.s3Secret = s3Config.Secret
	s.s3ACL = s3Config.ACL
	s.s3ForcePathStyle = s3Config.ForcePathStyle

	s.uploader = manager.NewUploader(s.connectAWS()) //nolint:staticcheck // see uploader field

	return nil
}

// SegmentWritten is called when a single segment of video is written.
func (s *S3Storage) SegmentWritten(localFilePath string) {
	index := utils.GetIndexFromFilePath(localFilePath)
	performanceMonitorKey := "s3upload-" + index
	utils.StartPerformanceMonitor(performanceMonitorKey)

	// Upload the segment
	if _, err := s.Save(localFilePath, 0); err != nil {
		log.Errorln(err)
		return
	}
	averagePerformance := utils.GetAveragePerformance(performanceMonitorKey)

	// Warn the user about long-running save operations
	if averagePerformance != 0 {
		if averagePerformance > float64(data.GetStreamLatencyLevel().SecondsPerSegment)*0.9 {
			log.Warnln("Possible slow uploads: average upload S3 save duration", averagePerformance, "s. troubleshoot this issue by visiting https://owncast.online/docs/troubleshooting/")
		}
	}

	// Upload the variant playlist for this segment
	// so the segments and the HLS playlist referencing
	// them are in sync.
	playlistPath := filepath.Join(filepath.Dir(localFilePath), "stream.m3u8")
	if _, err := s.Save(playlistPath, 0); err != nil {
		s.lock.Lock()
		s.queuedPlaylistUpdates[playlistPath] = playlistPath
		s.lock.Unlock()
		if pErr, ok := err.(*os.PathError); ok {
			log.Debugln(pErr.Path, "does not yet exist locally when trying to upload to S3 storage.")
			return
		}
	}
}

// VariantPlaylistWritten is called when a variant hls playlist is written.
func (s *S3Storage) VariantPlaylistWritten(localFilePath string) {
	// We are uploading the variant playlist after uploading the segment
	// to make sure we're not referring to files in a playlist that don't
	// yet exist.  See SegmentWritten.
	s.lock.Lock()
	defer s.lock.Unlock()
	if _, ok := s.queuedPlaylistUpdates[localFilePath]; ok {
		if _, err := s.Save(localFilePath, 0); err != nil {
			log.Errorln(err)
			s.queuedPlaylistUpdates[localFilePath] = localFilePath
		}
		delete(s.queuedPlaylistUpdates, localFilePath)
	}
}

// MasterPlaylistWritten is called when the master hls playlist is written.
func (s *S3Storage) MasterPlaylistWritten(localFilePath string) {
	// Rewrite the playlist to use absolute remote S3 URLs
	if err := s.rewriteRemotePlaylist(localFilePath); err != nil {
		log.Warnln(err)
	}
}

// Save saves the file to the s3 bucket.
func (s *S3Storage) Save(filePath string, retryCount int) (string, error) {
	file, err := os.Open(filePath) // nolint
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Convert the local path to the variant/file path by stripping the local storage location.
	normalizedPath := strings.TrimPrefix(filePath, config.HLSStoragePath)
	// Build the remote path by adding the "hls" path prefix.
	remotePath := strings.Join([]string{"hls", normalizedPath}, "")

	maxAgeSeconds := utils.GetCacheDurationSecondsForPath(filePath)
	cacheControlHeader := fmt.Sprintf("max-age=%d", maxAgeSeconds)

	uploadInput := &s3.PutObjectInput{
		Bucket:       aws.String(s.s3Bucket), // Bucket to be used
		Key:          aws.String(remotePath), // Name of the file to be saved
		Body:         file,                   // File
		CacheControl: &cacheControlHeader,
	}

	ext := path.Ext(filePath)
	baseName := path.Base(filePath)
	switch ext {
	case ".m3u8":
		noCacheHeader := "no-cache, no-store, must-revalidate"
		contentType := "application/x-mpegURL"

		uploadInput.CacheControl = &noCacheHeader
		uploadInput.ContentType = &contentType
	case ".mp4", ".m4s":
		contentType := "video/mp4"
		uploadInput.ContentType = &contentType

		if strings.HasPrefix(baseName, "init-") {
			// Init segments are rewritten in place with the same name on every
			// stream start, so they must never be cached.
			noCacheHeader := "no-cache, no-store, must-revalidate"
			uploadInput.CacheControl = &noCacheHeader
		} else {
			// Media segments are immutable (unique per-stream names), so let
			// the CDN edge cache them: without this every viewer request went
			// all the way to the bucket.
			immutableHeader := "public, max-age=31536000, immutable"
			uploadInput.CacheControl = &immutableHeader
		}
	}

	if s.s3ACL != "" {
		uploadInput.ACL = types.ObjectCannedACL(s.s3ACL)
	} else {
		// Default ACL
		uploadInput.ACL = types.ObjectCannedACLPublicRead
	}

	response, err := s.uploader.Upload(context.Background(), uploadInput) //nolint:staticcheck // see uploader field
	if err != nil {
		log.Traceln("error uploading segment", err.Error())
		if retryCount < 4 {
			log.Traceln("Retrying...")
			return s.Save(filePath, retryCount+1)
		}

		return "", fmt.Errorf("giving up uploading %s to object storage %s", filePath, s.s3Endpoint)
	}

	return response.Location, nil
}

func (s *S3Storage) connectAWS() *s3.Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConnsPerHost = 100

	httpClient := &http.Client{
		Timeout:   10 * time.Second,
		Transport: t,
	}

	// Eagerly validate the static credentials, matching the v1 SDK's
	// creds.Get() check that ran here before.
	creds := credentials.NewStaticCredentialsProvider(s.s3AccessKey, s.s3Secret, "")
	if _, err := creds.Retrieve(context.Background()); err != nil {
		log.Panicln(err)
	}

	client, err := newAWSS3Client(s.s3Endpoint, s.s3Region, s.s3AccessKey, s.s3Secret, s.s3ForcePathStyle, httpClient)
	if err != nil {
		log.Panicln(err)
	}
	return client
}

// newAWSS3Client builds an aws-sdk-go-v2 S3 client for an S3-compatible
// endpoint, mirroring the aws-sdk-go v1 session behavior this code was built
// around: static credentials, the explicitly configured region, an optional
// custom endpoint (scheme defaulting to https, as v1's endpoints.AddScheme
// did) and optional path-style addressing.
//
// Request checksum calculation and response checksum validation are set to
// "when required" so uploads do not send the newer default CRC32 integrity
// checksums. The v1 SDK never sent them, and S3-compatible stores (notably
// Cloudflare R2) have rejected them on some operations.
func newAWSS3Client(endpoint, region, accessKey, secret string, forcePathStyle bool, httpClient *http.Client) (*s3.Client, error) {
	creds := credentials.NewStaticCredentialsProvider(accessKey, secret, "")

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(creds),
		awsconfig.WithHTTPClient(httpClient),
	)
	if err != nil {
		return nil, err
	}
	// The configured region is authoritative even when empty: the v1 SDK never
	// fell back to the environment or shared config for an explicit Config.
	awsCfg.Region = region

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(ensureEndpointScheme(endpoint))
		}
		o.UsePathStyle = forcePathStyle
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return client, nil
}

// ensureEndpointScheme defaults a scheme-less endpoint to https, matching the
// v1 SDK behavior for custom endpoints.
func ensureEndpointScheme(endpoint string) string {
	if !strings.Contains(endpoint, "://") {
		return "https://" + endpoint
	}
	return endpoint
}

// rewriteRemotePlaylist will take a local playlist and rewrite it to have absolute URLs to remote locations.
func (s *S3Storage) rewriteRemotePlaylist(filePath string) error {
	f, err := os.Open(filePath) // nolint
	if err != nil {
		return err
	}

	p := m3u8.NewMasterPlaylist()
	if err := p.DecodeFrom(bufio.NewReader(f), false); err != nil {
		log.Warnln(err)
	}
	_ = f.Close()

	for _, item := range p.Variants {
		item.URI = s.host + filepath.Join("/hls", item.URI)
	}

	// The receiver hands us the master playlist under a temp name; the
	// rewritten version is published atomically under the final name so
	// players can never observe a half-written or un-rewritten playlist.
	finalName := strings.TrimSuffix(filepath.Base(filePath), ".tmp")
	publicPath := filepath.Join(config.HLSStoragePath, finalName)
	stagingPath := publicPath + ".new"

	newPlaylist := p.String()

	if err := playlist.WritePlaylist(newPlaylist, stagingPath); err != nil {
		return err
	}
	if err := os.Rename(stagingPath, publicPath); err != nil {
		return err
	}
	if filePath != publicPath {
		_ = os.Remove(filePath)
	}
	return nil
}
