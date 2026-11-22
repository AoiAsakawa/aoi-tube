package core

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
	"github.com/aoiasakawa/aoitube/utils"
)

func TestPruneLocalBackups(t *testing.T) {
	previous := config.BackupDirectory
	config.BackupDirectory = t.TempDir()
	t.Cleanup(func() { config.BackupDirectory = previous })

	// Timestamped backups (sortable), oldest first.
	names := []string{
		backupFilePrefix + "20260101-100000" + backupFileExt,
		backupFilePrefix + "20260102-100000" + backupFileExt,
		backupFilePrefix + "20260103-100000" + backupFileExt,
		backupFilePrefix + "20260104-100000" + backupFileExt,
		backupFilePrefix + "20260105-100000" + backupFileExt,
	}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(config.BackupDirectory, n), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// An unrelated file must never be pruned.
	other := filepath.Join(config.BackupDirectory, "owncastdb.bak")
	if err := os.WriteFile(other, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	pruneLocalBackups(2)

	remaining := map[string]bool{}
	entries, _ := os.ReadDir(config.BackupDirectory)
	for _, e := range entries {
		remaining[e.Name()] = true
	}

	// Only the newest 2 timestamped backups + the unrelated file remain.
	if len(remaining) != 3 {
		t.Fatalf("expected 3 files after prune, got %d: %v", len(remaining), remaining)
	}
	for _, keep := range []string{names[3], names[4], "owncastdb.bak"} {
		if !remaining[keep] {
			t.Errorf("expected %s to be kept", keep)
		}
	}
	for _, gone := range []string{names[0], names[1], names[2]} {
		if remaining[gone] {
			t.Errorf("expected %s to be pruned", gone)
		}
	}
}

func TestPruneLocalBackupsKeepAll(t *testing.T) {
	previous := config.BackupDirectory
	config.BackupDirectory = t.TempDir()
	t.Cleanup(func() { config.BackupDirectory = previous })

	name := backupFilePrefix + "20260101-100000" + backupFileExt
	if err := os.WriteFile(filepath.Join(config.BackupDirectory, name), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	// 0 means keep everything.
	pruneLocalBackups(0)
	if _, err := os.Stat(filepath.Join(config.BackupDirectory, name)); err != nil {
		t.Errorf("backup should be kept when retention is 0: %v", err)
	}
}

func TestBackupObjectsToPrune(t *testing.T) {
	keys := []string{
		// Uploaded before encryption.
		"backups/owncast-backup-20260101-100000.bak",
		"backups/owncast-backup-20260102-100000.bak",
		// Encrypted.
		"backups/owncast-backup-20260103-100000.bak.enc",
		"backups/owncast-backup-20260104-100000.bak.enc",
		// Not this server's backups: never pruned, never counted.
		"backups/notes.txt",
		"backups/owncast-backup-latest.bak",
		"backups/nested/owncast-backup-20250101-100000.bak",
		"backups/owncast-backup-20250101-100000.bak.gz",
	}

	got := backupObjectsToPrune(keys, 2)
	want := []string{
		"backups/owncast-backup-20260101-100000.bak",
		"backups/owncast-backup-20260102-100000.bak",
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("prune = %v, want %v", got, want)
	}

	if got := backupObjectsToPrune(keys, 0); got != nil {
		t.Errorf("retention 0 keeps everything, got %v", got)
	}
	if got := backupObjectsToPrune(keys, 4); got != nil {
		t.Errorf("4 backups with retention 4: nothing to prune, got %v", got)
	}
}

func TestBackupObjectsToPruneOrdersByTimestamp(t *testing.T) {
	// Listing order is by key; the timestamp decides which ones are old.
	keys := []string{
		"backups/owncast-backup-20261123-000500.bak.enc",
		"backups/owncast-backup-20260707-060023.bak",
		"backups/owncast-backup-20261122-152027.bak",
	}
	got := backupObjectsToPrune(keys, 1)
	want := []string{
		"backups/owncast-backup-20260707-060023.bak",
		"backups/owncast-backup-20261122-152027.bak",
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("prune = %v, want %v", got, want)
	}
}

func TestLatestBackupObject(t *testing.T) {
	keys := []string{
		"backups/owncast-backup-20261122-152027.bak",
		"backups/owncast-backup-20261123-000500.bak.enc",
		"backups/zzz-not-a-backup",
	}
	if got, ok := latestBackupObject(keys); !ok || got != "backups/owncast-backup-20261123-000500.bak.enc" {
		t.Errorf("latest = %q, %v", got, ok)
	}
	if _, ok := latestBackupObject([]string{"backups/readme.txt"}); ok {
		t.Error("no backups among the keys, but one was returned")
	}
}

type fakeBackupBucket struct {
	keys    []string
	deleted []string
	listErr error
}

func (f *fakeBackupBucket) ListBackups() ([]string, error) { return f.keys, f.listErr }

func (f *fakeBackupBucket) DeleteBackups(keys []string) error {
	f.deleted = append(f.deleted, keys...)
	return nil
}

func TestPruneS3Backups(t *testing.T) {
	bucket := &fakeBackupBucket{keys: []string{
		"backups/owncast-backup-20260101-100000.bak",
		"backups/owncast-backup-20260102-100000.bak.enc",
		"backups/owncast-backup-20260103-100000.bak.enc",
		"backups/keep-me.txt",
	}}
	pruneS3Backups(bucket, 2)
	if strings.Join(bucket.deleted, ",") != "backups/owncast-backup-20260101-100000.bak" {
		t.Errorf("deleted = %v", bucket.deleted)
	}

	bucket.deleted = nil
	pruneS3Backups(bucket, 0)
	if len(bucket.deleted) != 0 {
		t.Errorf("retention 0 must not delete anything, deleted %v", bucket.deleted)
	}

	bucket.listErr = errors.New("listing failed")
	pruneS3Backups(bucket, 1)
	if len(bucket.deleted) != 0 {
		t.Errorf("a failed listing must not delete anything, deleted %v", bucket.deleted)
	}
}

// writeTestBackup writes a real backup file (gzip SQL dump) of a small
// database holding one marker row, and returns its path.
func writeTestBackup(t *testing.T, marker string) string {
	t.Helper()
	dir := t.TempDir()
	db, err := sql.Open("sqlite3", filepath.Join(dir, "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TABLE marker (value TEXT)"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO marker VALUES (?)", marker); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, backupFilePrefix+"20261123-000500"+backupFileExt)
	utils.Backup(db, path)
	if !utils.DoesFileExists(path) {
		t.Fatal("test backup was not written")
	}
	return path
}

// readMarker returns the marker row of a restored database.
func readMarker(t *testing.T, databaseFile string) string {
	t.Helper()
	db, err := sql.Open("sqlite3", databaseFile)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var value string
	if err := db.QueryRow("SELECT value FROM marker").Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

// encryptTestBackup writes an encrypted copy of a backup file, as stored in
// the bucket, and returns its path.
func encryptTestBackup(t *testing.T, plainPath, secret string) string {
	t.Helper()
	plain, err := os.ReadFile(plainPath)
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := storageproviders.EncryptBackup(plain, secret)
	if err != nil {
		t.Fatal(err)
	}
	path := plainPath + storageproviders.EncryptedBackupSuffix
	if err := os.WriteFile(path, encrypted, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRestoreDatabaseFileDecryptsDownloadedBackup(t *testing.T) {
	const secret = "current-s3-secret-access-key"
	encrypted := encryptTestBackup(t, writeTestBackup(t, "encrypted"), secret)

	t.Setenv("OWNCAST_S3_SECRET", secret)
	t.Setenv(previousBackupSecretEnv, "")
	restored := filepath.Join(t.TempDir(), "restored.db")
	if err := RestoreDatabaseFile(encrypted, restored); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, restored); got != "encrypted" {
		t.Errorf("marker = %q", got)
	}
}

func TestRestoreDatabaseFileWithPreviousSecret(t *testing.T) {
	encrypted := encryptTestBackup(t, writeTestBackup(t, "before rotation"), "old-s3-secret")

	t.Setenv("OWNCAST_S3_SECRET", "new-s3-secret")
	t.Setenv(previousBackupSecretEnv, "")
	restored := filepath.Join(t.TempDir(), "restored.db")
	err := RestoreDatabaseFile(encrypted, restored)
	if !errors.Is(err, storageproviders.ErrBackupKeyMismatch) || !strings.Contains(err.Error(), previousBackupSecretEnv) {
		t.Fatalf("err = %v, want a key mismatch that names %s", err, previousBackupSecretEnv)
	}

	t.Setenv(previousBackupSecretEnv, "old-s3-secret")
	if err := RestoreDatabaseFile(encrypted, restored); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, restored); got != "before rotation" {
		t.Errorf("marker = %q", got)
	}
}

func TestRestoreDatabaseFileNeedsASecretForEncryptedBackups(t *testing.T) {
	encrypted := encryptTestBackup(t, writeTestBackup(t, "x"), "some-secret")

	t.Setenv("OWNCAST_S3_SECRET", "")
	t.Setenv(previousBackupSecretEnv, "")
	err := RestoreDatabaseFile(encrypted, filepath.Join(t.TempDir(), "restored.db"))
	if err == nil || !strings.Contains(err.Error(), "OWNCAST_S3_SECRET") {
		t.Fatalf("err = %v, want one that names OWNCAST_S3_SECRET", err)
	}
}

func TestRestoreDatabaseFileRestoresPlainBackups(t *testing.T) {
	plain := writeTestBackup(t, "plain")

	t.Setenv("OWNCAST_S3_SECRET", "")
	t.Setenv(previousBackupSecretEnv, "")
	restored := filepath.Join(t.TempDir(), "restored.db")
	if err := RestoreDatabaseFile(plain, restored); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, restored); got != "plain" {
		t.Errorf("marker = %q", got)
	}
}
