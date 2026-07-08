package storageproviders

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/aoiasakawa/aoitube/core/data"
)

// archiveObjectPrefix is the S3 key prefix under which recording/VOD media is
// stored, keeping it namespaced away from the live hls/ objects in the same
// bucket.
const archiveObjectPrefix = "archives"

// deleteObjectsBatchSize is the maximum number of keys a single S3
// DeleteObjects call accepts.
const deleteObjectsBatchSize = 1000

// ArchiveS3 uploads, downloads and deletes recording media in the configured
// S3 bucket. It reuses the same credentials as live HLS distribution but,
// unlike S3Storage, is independent of the live-distribution Enabled flag so
// recordings can be offloaded even when live segments are served locally.
//
// Serving is always proxied through the owncast server (never a public CDN
// redirect), so the archive visibility gate keeps hidden recordings private
// regardless of bucket ACL.
type ArchiveS3 struct {
	bucket string
	// feature/s3/manager is deprecated in favor of feature/s3/transfermanager,
	// but remains fully supported; we stay on it deliberately for its stable,
	// v1-equivalent Uploader semantics.
	uploader *manager.Uploader //nolint:staticcheck
	client   *s3.Client
	acl      string
}

// newArchiveS3Client builds the S3 client used for archive/backup transfers,
// with the longer HTTP timeout large media objects need.
func newArchiveS3Client(endpoint, region, accessKey, secret string, forcePathStyle bool) (*s3.Client, error) {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConnsPerHost = 100
	httpClient := &http.Client{Timeout: 30 * time.Second, Transport: t}

	return newAWSS3Client(endpoint, region, accessKey, secret, forcePathStyle, httpClient)
}

// NewArchiveS3 builds an ArchiveS3 from the current S3 config, or returns an
// error if the credentials/bucket are incomplete. Callers treat a nil/err
// result as "recordings stay local".
func NewArchiveS3() (*ArchiveS3, error) {
	cfg := data.GetS3Config()
	if cfg.AccessKey == "" || cfg.Secret == "" || cfg.Bucket == "" {
		return nil, fmt.Errorf("S3 storage is not fully configured")
	}

	client, err := newArchiveS3Client(cfg.Endpoint, cfg.Region, cfg.AccessKey, cfg.Secret, cfg.ForcePathStyle)
	if err != nil {
		return nil, err
	}

	return &ArchiveS3{
		bucket:   cfg.Bucket,
		uploader: manager.NewUploader(client), //nolint:staticcheck // see uploader field
		client:   client,
		acl:      cfg.ACL,
	}, nil
}

// ArchiveObjectKey builds the S3 key for an archive-relative path
// (e.g. "20260101-120000/0/seg-5.m4s" -> "archives/20260101-120000/0/seg-5.m4s").
func ArchiveObjectKey(archiveRelPath string) string {
	return archiveObjectPrefix + "/" + strings.TrimPrefix(archiveRelPath, "/")
}

// Upload stores a local file at the given archive-relative key. Content type
// is inferred from the extension so browsers play segments directly.
func (a *ArchiveS3) Upload(localPath, archiveRelPath string) error {
	file, err := os.Open(localPath) // nolint:gosec
	if err != nil {
		return err
	}
	defer file.Close()

	input := &s3.PutObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(ArchiveObjectKey(archiveRelPath)),
		Body:   file,
	}
	if ct := archiveContentType(localPath); ct != "" {
		input.ContentType = aws.String(ct)
	}
	// Archive media is immutable once written; let any CDN edge cache it.
	input.CacheControl = aws.String("public, max-age=31536000, immutable")
	if a.acl != "" {
		input.ACL = types.ObjectCannedACL(a.acl)
	}

	_, err = a.uploader.Upload(context.Background(), input) //nolint:staticcheck // see uploader field
	return err
}

// Download streams an archive object back for server-side proxying. The
// caller is responsible for closing the returned reader.
func (a *ArchiveS3) Download(archiveRelPath string) (io.ReadCloser, string, error) {
	body, contentType, _, _, err := a.DownloadRange(archiveRelPath, "")
	return body, contentType, err
}

// DownloadRange streams an archive object, optionally with an HTTP Range
// (e.g. "bytes=0-1023") so large progressive MP4s can be seeked through the
// proxy. Returns the body, content type, Content-Range (empty when the whole
// object was returned) and total/partial length.
func (a *ArchiveS3) DownloadRange(archiveRelPath, rangeHeader string) (io.ReadCloser, string, string, int64, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(ArchiveObjectKey(archiveRelPath)),
	}
	if rangeHeader != "" {
		input.Range = aws.String(rangeHeader)
	}
	out, err := a.client.GetObject(context.Background(), input)
	if err != nil {
		return nil, "", "", 0, err
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	contentRange := ""
	if out.ContentRange != nil {
		contentRange = *out.ContentRange
	}
	var length int64
	if out.ContentLength != nil {
		length = *out.ContentLength
	}
	return out.Body, contentType, contentRange, length, nil
}

// DeletePrefix removes every object under an archive session prefix
// (e.g. "20260101-120000"), used when a recording is deleted or pruned.
func (a *ArchiveS3) DeletePrefix(sessionID string) error {
	return a.deleteAllUnderPrefix(ArchiveObjectKey(sessionID) + "/")
}

// DeleteRawPrefix removes every object under a raw key prefix. Unlike
// DeletePrefix it does not scope to the archives/ namespace — used for
// cleaning the live hls/ distribution segments.
func (a *ArchiveS3) DeleteRawPrefix(prefix string) error {
	return a.deleteAllUnderPrefix(prefix)
}

// deleteAllUnderPrefix lists every object under a raw key prefix and removes
// them with batched DeleteObjects calls, replacing the v1 SDK's BatchDelete
// helper (which aws-sdk-go-v2 does not provide).
func (a *ArchiveS3) deleteAllUnderPrefix(prefix string) error {
	ctx := context.Background()
	paginator := s3.NewListObjectsV2Paginator(a.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(a.bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return err
		}
		identifiers := make([]types.ObjectIdentifier, 0, len(page.Contents))
		for _, obj := range page.Contents {
			if obj.Key == nil {
				continue
			}
			identifiers = append(identifiers, types.ObjectIdentifier{Key: obj.Key})
		}
		for start := 0; start < len(identifiers); start += deleteObjectsBatchSize {
			end := start + deleteObjectsBatchSize
			if end > len(identifiers) {
				end = len(identifiers)
			}
			out, err := a.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
				Bucket: aws.String(a.bucket),
				Delete: &types.Delete{Objects: identifiers[start:end]},
			})
			if err != nil {
				return err
			}
			if len(out.Errors) > 0 {
				first := out.Errors[0]
				return fmt.Errorf("failed to delete %d object(s) under %s (first: %s: %s)",
					len(out.Errors), prefix, aws.ToString(first.Key), aws.ToString(first.Message))
			}
		}
	}
	return nil
}

// PrefixUsage sums object count and bytes under a raw key prefix ("" = whole
// bucket). Used by the admin storage-usage endpoint.
func (a *ArchiveS3) PrefixUsage(prefix string) (int64, int64, error) {
	var objects, bytes int64
	input := &s3.ListObjectsV2Input{Bucket: aws.String(a.bucket)}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}
	paginator := s3.NewListObjectsV2Paginator(a.client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return objects, bytes, err
		}
		for _, obj := range page.Contents {
			objects++
			if obj.Size != nil {
				bytes += *obj.Size
			}
		}
	}
	return objects, bytes, nil
}

// ListArchiveSessionPrefixes returns the session IDs that have objects under
// archives/ (top-level "directories"), for orphan detection.
func (a *ArchiveS3) ListArchiveSessionPrefixes() ([]string, error) {
	prefix := archiveObjectPrefix + "/"
	ids := []string{}
	paginator := s3.NewListObjectsV2Paginator(a.client, &s3.ListObjectsV2Input{
		Bucket:    aws.String(a.bucket),
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return ids, err
		}
		for _, cp := range page.CommonPrefixes {
			if cp.Prefix == nil {
				continue
			}
			id := strings.TrimSuffix(strings.TrimPrefix(*cp.Prefix, prefix), "/")
			if id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids, nil
}

// CountIncompleteMultipartUploads returns how many multipart uploads were
// started but never completed/aborted. Their parts are billed and count
// toward bucket size but are invisible to ListObjects — interrupted offloads
// and mid-stream restarts leave them behind.
func (a *ArchiveS3) CountIncompleteMultipartUploads() (int64, error) {
	var count int64
	input := &s3.ListMultipartUploadsInput{Bucket: aws.String(a.bucket)}
	// aws-sdk-go-v2 has no paginator for ListMultipartUploads; page manually.
	for {
		page, err := a.client.ListMultipartUploads(context.Background(), input)
		if err != nil {
			return count, err
		}
		count += int64(len(page.Uploads))
		if !aws.ToBool(page.IsTruncated) {
			return count, nil
		}
		input.KeyMarker = page.NextKeyMarker
		input.UploadIdMarker = page.NextUploadIdMarker
	}
}

// AbortAllMultipartUploads aborts every incomplete multipart upload in the
// bucket, freeing their billed parts.
func (a *ArchiveS3) AbortAllMultipartUploads() (int64, error) {
	var aborted int64
	ctx := context.Background()
	input := &s3.ListMultipartUploadsInput{Bucket: aws.String(a.bucket)}
	for {
		page, err := a.client.ListMultipartUploads(ctx, input)
		if err != nil {
			return aborted, err
		}
		for _, u := range page.Uploads {
			if u.Key == nil || u.UploadId == nil {
				continue
			}
			if _, err := a.client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
				Bucket:   aws.String(a.bucket),
				Key:      u.Key,
				UploadId: u.UploadId,
			}); err == nil {
				aborted++
			}
		}
		if !aws.ToBool(page.IsTruncated) {
			return aborted, nil
		}
		input.KeyMarker = page.NextKeyMarker
		input.UploadIdMarker = page.NextUploadIdMarker
	}
}

// archiveContentType returns the MIME type for an archive media file.
func archiveContentType(filePath string) string {
	switch path.Ext(filePath) {
	case ".m4s", ".mp4":
		return "video/mp4"
	case ".ts":
		return "video/mp2t"
	default:
		return ""
	}
}

// backupObjectPrefix is the S3 key prefix for database backups.
const backupObjectPrefix = "backups"

// UploadBackup stores a database backup file under the backups/ prefix.
func (a *ArchiveS3) UploadBackup(localPath, name string) error {
	file, err := os.Open(localPath) // nolint:gosec
	if err != nil {
		return err
	}
	defer file.Close()

	input := &s3.PutObjectInput{
		Bucket:       aws.String(a.bucket),
		Key:          aws.String(backupObjectPrefix + "/" + name),
		Body:         file,
		CacheControl: aws.String("no-cache, no-store, must-revalidate"),
	}
	if a.acl != "" {
		input.ACL = types.ObjectCannedACL(a.acl)
	}
	_, err = a.uploader.Upload(context.Background(), input) //nolint:staticcheck // see uploader field
	return err
}

// ListBackups returns the backup object keys in the bucket, newest last
// (keys embed a sortable timestamp).
func (a *ArchiveS3) ListBackups() ([]string, error) {
	prefix := backupObjectPrefix + "/"
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(a.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(a.bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return nil, err
		}
		for _, obj := range page.Contents {
			if obj.Key != nil {
				keys = append(keys, *obj.Key)
			}
		}
	}
	sort.Strings(keys)
	return keys, nil
}

// DownloadBackupObject writes the S3 object at key to destPath.
func (a *ArchiveS3) DownloadBackupObject(key, destPath string) error {
	out, err := a.client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	defer out.Body.Close()

	f, err := os.Create(destPath) // nolint:gosec
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, out.Body)
	return err
}

// NewArchiveS3FromEnv builds an ArchiveS3 from environment variables instead
// of the datastore. Used for node migration (`-restoreFromS3`): a fresh node
// has no database yet, so the S3 credentials to fetch the backup must come
// from the environment:
//
//	OWNCAST_S3_ENDPOINT, OWNCAST_S3_REGION, OWNCAST_S3_BUCKET,
//	OWNCAST_S3_ACCESS_KEY, OWNCAST_S3_SECRET, OWNCAST_S3_FORCE_PATH_STYLE
func NewArchiveS3FromEnv() (*ArchiveS3, error) {
	accessKey := os.Getenv("OWNCAST_S3_ACCESS_KEY")
	secret := os.Getenv("OWNCAST_S3_SECRET")
	bucket := os.Getenv("OWNCAST_S3_BUCKET")
	if accessKey == "" || secret == "" || bucket == "" {
		return nil, fmt.Errorf("set OWNCAST_S3_ACCESS_KEY, OWNCAST_S3_SECRET and OWNCAST_S3_BUCKET")
	}

	client, err := newArchiveS3Client(
		os.Getenv("OWNCAST_S3_ENDPOINT"),
		os.Getenv("OWNCAST_S3_REGION"),
		accessKey,
		secret,
		os.Getenv("OWNCAST_S3_FORCE_PATH_STYLE") == "true",
	)
	if err != nil {
		return nil, err
	}

	return &ArchiveS3{
		bucket:   bucket,
		uploader: manager.NewUploader(client), //nolint:staticcheck // see uploader field
		client:   client,
		acl:      os.Getenv("OWNCAST_S3_ACL"),
	}, nil
}
