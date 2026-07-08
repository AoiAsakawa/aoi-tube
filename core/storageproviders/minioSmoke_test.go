//go:build miniosmoke

package storageproviders

// Real-traffic smoke test against a local MinIO instance. It is excluded from
// normal `go test ./...` runs by the build tag. To run it:
//
//	docker run -d --name minio-test -p 9000:9000 \
//	  -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
//	  minio/minio server /data
//	go test -tags miniosmoke -run TestMinioSmoke -v ./core/storageproviders/
//	docker rm -f minio-test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/aoiasakawa/aoitube/config"
)

func smokeEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func TestMinioSmoke(t *testing.T) {
	endpoint := smokeEnv("MINIO_SMOKE_ENDPOINT", "http://localhost:9000")
	accessKey := smokeEnv("MINIO_SMOKE_ACCESS_KEY", "testkey")
	secret := smokeEnv("MINIO_SMOKE_SECRET", "testsecret123")
	region := "us-east-1"
	bucket := fmt.Sprintf("owncast-smoke-%d", time.Now().Unix())

	ctx := context.Background()

	// Raw client for bucket lifecycle and header inspection.
	raw, err := newAWSS3Client(endpoint, region, accessKey, secret, true, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		t.Fatalf("raw client: %v", err)
	}
	if _, err := raw.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Fatalf("create bucket (is MinIO running on %s?): %v", endpoint, err)
	}
	defer func() {
		if _, err := raw.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(bucket)}); err != nil {
			t.Logf("cleanup: delete bucket: %v", err)
		}
	}()

	// Build the real ArchiveS3 through the exported env constructor.
	t.Setenv("OWNCAST_S3_ENDPOINT", endpoint)
	t.Setenv("OWNCAST_S3_REGION", region)
	t.Setenv("OWNCAST_S3_BUCKET", bucket)
	t.Setenv("OWNCAST_S3_ACCESS_KEY", accessKey)
	t.Setenv("OWNCAST_S3_SECRET", secret)
	t.Setenv("OWNCAST_S3_FORCE_PATH_STYLE", "true")
	a, err := NewArchiveS3FromEnv()
	if err != nil {
		t.Fatalf("NewArchiveS3FromEnv: %v", err)
	}

	// Fresh bucket: no incomplete multipart uploads.
	if n, err := a.CountIncompleteMultipartUploads(); err != nil || n != 0 {
		t.Fatalf("CountIncompleteMultipartUploads = %d, %v; want 0, nil", n, err)
	}

	// 8 MiB media file: exercises the manager's multipart path (5 MiB parts).
	const mediaSize = 8 * 1024 * 1024
	pattern := []byte("owncast-smoke-segment-payload-0123456789ABCDEF-")
	media := bytes.Repeat(pattern, mediaSize/len(pattern)+1)[:mediaSize]
	tmpDir := t.TempDir()
	mediaPath := filepath.Join(tmpDir, "seg-0.m4s")
	if err := os.WriteFile(mediaPath, media, 0o600); err != nil {
		t.Fatal(err)
	}

	const sessionID = "20260708-000000"
	if err := a.Upload(mediaPath, sessionID+"/0/seg-0.m4s"); err != nil {
		t.Fatalf("Upload: %v", err)
	}

	// Verify key, content type and cache-control survived the upload.
	head, err := raw.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("archives/" + sessionID + "/0/seg-0.m4s"),
	})
	if err != nil {
		t.Fatalf("HeadObject on archive key: %v", err)
	}
	if got := aws.ToString(head.ContentType); got != "video/mp4" {
		t.Errorf("archive ContentType = %q, want video/mp4", got)
	}
	if got := aws.ToString(head.CacheControl); got != "public, max-age=31536000, immutable" {
		t.Errorf("archive CacheControl = %q", got)
	}

	// PrefixUsage counts it.
	if n, b, err := a.PrefixUsage("archives/"); err != nil || n != 1 || b != mediaSize {
		t.Fatalf("PrefixUsage(archives/) = %d obj %d bytes, %v; want 1, %d, nil", n, b, err, mediaSize)
	}

	// Full download roundtrip.
	body, contentType, err := a.Download(sessionID + "/0/seg-0.m4s")
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	got, err := io.ReadAll(body)
	body.Close()
	if err != nil || !bytes.Equal(got, media) {
		t.Fatalf("Download content mismatch (len %d vs %d), err %v", len(got), len(media), err)
	}
	if contentType != "video/mp4" {
		t.Errorf("Download contentType = %q", contentType)
	}

	// Ranged download: correct partial bytes, Content-Range and length.
	rBody, _, contentRange, length, err := a.DownloadRange(sessionID+"/0/seg-0.m4s", "bytes=1048576-1048585")
	if err != nil {
		t.Fatalf("DownloadRange: %v", err)
	}
	part, err := io.ReadAll(rBody)
	rBody.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(part, media[1048576:1048586]) {
		t.Errorf("DownloadRange bytes mismatch: %q", part)
	}
	if want := fmt.Sprintf("bytes 1048576-1048585/%d", mediaSize); contentRange != want {
		t.Errorf("ContentRange = %q, want %q", contentRange, want)
	}
	if length != 10 {
		t.Errorf("length = %d, want 10", length)
	}

	// Session prefix listing sees the session.
	if ids, err := a.ListArchiveSessionPrefixes(); err != nil || len(ids) != 1 || ids[0] != sessionID {
		t.Fatalf("ListArchiveSessionPrefixes = %v, %v; want [%s]", ids, err, sessionID)
	}

	// Backup roundtrip.
	backupContent := []byte("-- owncast backup smoke --\n")
	backupPath := filepath.Join(tmpDir, "owncast-backup-20260708-000000.bak")
	if err := os.WriteFile(backupPath, backupContent, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := a.UploadBackup(backupPath, filepath.Base(backupPath)); err != nil {
		t.Fatalf("UploadBackup: %v", err)
	}
	keys, err := a.ListBackups()
	if err != nil || len(keys) != 1 || keys[0] != "backups/"+filepath.Base(backupPath) {
		t.Fatalf("ListBackups = %v, %v", keys, err)
	}
	restorePath := filepath.Join(tmpDir, "restored.bak")
	if err := a.DownloadBackupObject(keys[0], restorePath); err != nil {
		t.Fatalf("DownloadBackupObject: %v", err)
	}
	if restored, err := os.ReadFile(restorePath); err != nil || !bytes.Equal(restored, backupContent) {
		t.Fatalf("backup roundtrip mismatch: %q, %v", restored, err)
	}

	// Live-HLS S3Storage.Save path: media segment, init segment and playlist,
	// with the production key building (config.HLSStoragePath prefix strip).
	origHLSPath := config.HLSStoragePath
	config.HLSStoragePath = tmpDir
	defer func() { config.HLSStoragePath = origHLSPath }()

	st := NewS3Storage()
	st.s3Endpoint = endpoint
	st.s3Region = region
	st.s3Bucket = bucket
	st.s3AccessKey = accessKey
	st.s3Secret = secret
	st.s3ForcePathStyle = true
	st.uploader = manager.NewUploader(st.connectAWS())

	if err := os.MkdirAll(filepath.Join(tmpDir, "0"), 0o700); err != nil {
		t.Fatal(err)
	}
	liveSeg := filepath.Join(tmpDir, "0", "stream-123.m4s")
	if err := os.WriteFile(liveSeg, media[:4096], 0o600); err != nil {
		t.Fatal(err)
	}
	location, err := st.Save(liveSeg, 0)
	if err != nil {
		t.Fatalf("S3Storage.Save(segment): %v", err)
	}
	if location == "" {
		t.Error("Save returned empty location")
	}
	segHead, err := raw.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("hls/0/stream-123.m4s"),
	})
	if err != nil {
		t.Fatalf("HeadObject on hls segment key: %v", err)
	}
	if aws.ToString(segHead.ContentType) != "video/mp4" ||
		aws.ToString(segHead.CacheControl) != "public, max-age=31536000, immutable" {
		t.Errorf("live segment headers = %q / %q",
			aws.ToString(segHead.ContentType), aws.ToString(segHead.CacheControl))
	}
	if aws.ToInt64(segHead.ContentLength) != 4096 {
		t.Errorf("live segment length = %d", aws.ToInt64(segHead.ContentLength))
	}

	initSeg := filepath.Join(tmpDir, "0", "init-0.mp4")
	if err := os.WriteFile(initSeg, media[:512], 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Save(initSeg, 0); err != nil {
		t.Fatalf("S3Storage.Save(init): %v", err)
	}
	initHead, err := raw.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("hls/0/init-0.mp4"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if aws.ToString(initHead.CacheControl) != "no-cache, no-store, must-revalidate" {
		t.Errorf("init segment CacheControl = %q", aws.ToString(initHead.CacheControl))
	}

	playlistFile := filepath.Join(tmpDir, "0", "stream.m3u8")
	if err := os.WriteFile(playlistFile, []byte("#EXTM3U\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Save(playlistFile, 0); err != nil {
		t.Fatalf("S3Storage.Save(playlist): %v", err)
	}
	plHead, err := raw.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("hls/0/stream.m3u8"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if aws.ToString(plHead.ContentType) != "application/x-mpegURL" ||
		aws.ToString(plHead.CacheControl) != "no-cache, no-store, must-revalidate" {
		t.Errorf("playlist headers = %q / %q",
			aws.ToString(plHead.ContentType), aws.ToString(plHead.CacheControl))
	}

	// Whole-bucket usage: 1 archive + 1 backup + 3 hls objects.
	if n, _, err := a.PrefixUsage(""); err != nil || n != 5 {
		t.Fatalf("PrefixUsage(\"\") = %d, %v; want 5", n, err)
	}

	// Incomplete multipart uploads: create one, count it, abort it.
	if _, err := raw.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("archives/incomplete/part.mp4"),
	}); err != nil {
		t.Fatalf("CreateMultipartUpload: %v", err)
	}
	if n, err := a.CountIncompleteMultipartUploads(); err != nil || n != 1 {
		t.Fatalf("CountIncompleteMultipartUploads = %d, %v; want 1", n, err)
	}
	if n, err := a.AbortAllMultipartUploads(); err != nil || n != 1 {
		t.Fatalf("AbortAllMultipartUploads = %d, %v; want 1", n, err)
	}
	if n, err := a.CountIncompleteMultipartUploads(); err != nil || n != 0 {
		t.Fatalf("CountIncompleteMultipartUploads after abort = %d, %v; want 0", n, err)
	}

	// Deletion: session prefix, then the raw hls/ and backups/ prefixes.
	if err := a.DeletePrefix(sessionID); err != nil {
		t.Fatalf("DeletePrefix: %v", err)
	}
	if n, _, err := a.PrefixUsage("archives/"); err != nil || n != 0 {
		t.Fatalf("archives/ usage after DeletePrefix = %d, %v; want 0", n, err)
	}
	if err := a.DeleteRawPrefix("hls/"); err != nil {
		t.Fatalf("DeleteRawPrefix(hls/): %v", err)
	}
	if err := a.DeleteRawPrefix("backups/"); err != nil {
		t.Fatalf("DeleteRawPrefix(backups/): %v", err)
	}
	if n, b, err := a.PrefixUsage(""); err != nil || n != 0 || b != 0 {
		t.Fatalf("final PrefixUsage = %d obj %d bytes, %v; want empty bucket", n, b, err)
	}
}
