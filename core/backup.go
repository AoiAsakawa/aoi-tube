package core

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
	"github.com/aoiasakawa/aoitube/utils"
	log "github.com/sirupsen/logrus"
)

// backupFilePrefix / backupFileExt name the rotating backup files.
const (
	backupFilePrefix = "owncast-backup-"
	backupFileExt    = ".bak"
)

// previousBackupSecretEnv names the environment variable that holds the S3
// secret key a backup was made with, for restoring a backup that is older than
// the current S3 key.
const previousBackupSecretEnv = "OWNCAST_BACKUP_SECRET"

// backupObjectPattern matches the backups this server stores in S3, capturing
// their timestamp: encrypted ones (.bak.enc) and those uploaded before
// encryption (.bak). Pruning and restoring look at nothing else under the
// backups/ prefix.
var backupObjectPattern = regexp.MustCompile("^" +
	regexp.QuoteMeta(storageproviders.BackupObjectPrefix+backupFilePrefix) +
	`(\d{8}-\d{6})` +
	regexp.QuoteMeta(backupFileExt) +
	"(?:" + regexp.QuoteMeta(storageproviders.EncryptedBackupSuffix) + ")?$")

// backupBucket is the part of the S3 connection that pruning uses.
type backupBucket interface {
	ListBackups() ([]string, error)
	DeleteBackups(keys []string) error
}

// startBackupScheduler runs periodic database backups on a timer while
// enabled. The database holds all config, users and — now — purchase
// entitlements, so it is the one piece of state whose loss actually costs the
// operator money. Backups are timestamped (rotating), pruned to a retention
// count, and optionally uploaded to S3 for disk-loss survival and node
// migration.
func startBackupScheduler() {
	// Run one backup shortly after boot so a fresh deploy has a recent copy,
	// then on the configured interval.
	go func() {
		time.Sleep(2 * time.Minute)
		runScheduledBackup()

		for {
			interval := time.Duration(data.GetBackupIntervalHours()) * time.Hour
			time.Sleep(interval)
			runScheduledBackup()
		}
	}()
}

// runScheduledBackup performs one backup cycle if backups are enabled.
func runScheduledBackup() {
	if !data.GetBackupEnabled() {
		return
	}

	name := backupFilePrefix + time.Now().UTC().Format("20060102-150405") + backupFileExt
	localPath := filepath.Join(config.BackupDirectory, name)

	utils.Backup(data.GetDatabase(), localPath)
	if !utils.DoesFileExists(localPath) {
		log.Errorln("backup: database backup was not written to", localPath)
		return
	}
	log.Infoln("backup: database backed up to", localPath)

	retention := data.GetBackupRetentionCount()
	if data.GetBackupStoreOnS3() {
		if err := uploadBackupToS3(localPath, name, retention); err != nil {
			log.Warnln("backup: unable to upload backup to S3:", err)
		}
	}

	pruneLocalBackups(retention)
}

// uploadBackupToS3 encrypts a backup file into the configured bucket, then
// prunes the bucket's backups to keepCount.
func uploadBackupToS3(localPath, name string, keepCount int) error {
	s3, err := storageproviders.NewArchiveS3()
	if err != nil {
		return err
	}
	objectName := name + storageproviders.EncryptedBackupSuffix
	if err := s3.UploadBackup(localPath, objectName); err != nil {
		return err
	}
	log.Infoln("backup: uploaded encrypted backup to S3:", objectName)

	// Only after a successful upload, so a failing bucket never loses the
	// copies it still has.
	pruneS3Backups(s3, keepCount)
	return nil
}

// pruneS3Backups keeps only the newest keepCount backups in the bucket.
// keepCount <= 0 keeps everything. Objects that are not this server's backups
// are never touched.
func pruneS3Backups(bucket backupBucket, keepCount int) {
	if keepCount <= 0 {
		return
	}
	keys, err := bucket.ListBackups()
	if err != nil {
		log.Warnln("backup: unable to list S3 backups for pruning:", err)
		return
	}
	old := backupObjectsToPrune(keys, keepCount)
	if len(old) == 0 {
		return
	}
	if err := bucket.DeleteBackups(old); err != nil {
		log.Warnln("backup: unable to prune old S3 backups:", err)
		return
	}
	log.Infof("backup: removed %d old backup(s) from S3", len(old))
}

// backupObjectsToPrune returns the backup objects to delete so that the newest
// keepCount remain, oldest first. keepCount <= 0 keeps everything.
func backupObjectsToPrune(keys []string, keepCount int) []string {
	if keepCount <= 0 {
		return nil
	}
	backups := sortedBackupObjects(keys)
	if len(backups) <= keepCount {
		return nil
	}
	return backups[:len(backups)-keepCount]
}

// latestBackupObject returns the newest backup object among keys.
func latestBackupObject(keys []string) (string, bool) {
	backups := sortedBackupObjects(keys)
	if len(backups) == 0 {
		return "", false
	}
	return backups[len(backups)-1], true
}

// sortedBackupObjects returns the keys that name this server's backups,
// oldest first.
func sortedBackupObjects(keys []string) []string {
	type backup struct{ key, timestamp string }
	backups := make([]backup, 0, len(keys))
	for _, key := range keys {
		if m := backupObjectPattern.FindStringSubmatch(key); m != nil {
			backups = append(backups, backup{key: key, timestamp: m[1]})
		}
	}
	sort.Slice(backups, func(i, j int) bool {
		if backups[i].timestamp != backups[j].timestamp {
			return backups[i].timestamp < backups[j].timestamp
		}
		return backups[i].key < backups[j].key
	})
	sorted := make([]string, len(backups))
	for i, b := range backups {
		sorted[i] = b.key
	}
	return sorted
}

// pruneLocalBackups keeps only the newest keepCount backup files on disk.
// keepCount <= 0 keeps everything.
func pruneLocalBackups(keepCount int) {
	if keepCount <= 0 {
		return
	}

	entries, err := os.ReadDir(config.BackupDirectory)
	if err != nil {
		return
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), backupFilePrefix) && strings.HasSuffix(e.Name(), backupFileExt) {
			names = append(names, e.Name())
		}
	}
	if len(names) <= keepCount {
		return
	}
	// Names embed a sortable UTC timestamp, so lexical order is chronological.
	sort.Strings(names)
	for _, name := range names[:len(names)-keepCount] {
		if err := os.Remove(filepath.Join(config.BackupDirectory, name)); err != nil {
			log.Debugln("backup: unable to prune old backup:", err)
		}
	}
}

// RestoreFromS3 downloads the newest backup from S3 (using credentials from the
// environment, since a migrating node has no database yet) and restores it to
// the given database path. Used by the `-restoreFromS3` CLI flag for one-shot
// node migration.
func RestoreFromS3(databaseFile string) error {
	s3, err := storageproviders.NewArchiveS3FromEnv()
	if err != nil {
		return err
	}

	keys, err := s3.ListBackups()
	if err != nil {
		return fmt.Errorf("listing S3 backups: %w", err)
	}
	latest, ok := latestBackupObject(keys)
	if !ok {
		return fmt.Errorf("no backups found in the S3 bucket under %s", storageproviders.BackupObjectPrefix)
	}

	tmp, err := os.CreateTemp("", "owncast-restore-*.bak")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	defer os.Remove(tmpPath)

	log.Infoln("restore: downloading", latest, "from S3")
	if err := s3.DownloadBackup(latest, tmpPath, os.Getenv(previousBackupSecretEnv)); err != nil {
		return fmt.Errorf("reading %s: %w", latest, explainBackupKeyError(err, "OWNCAST_S3_SECRET"))
	}

	if err := utils.Restore(tmpPath, databaseFile); err != nil {
		return fmt.Errorf("restoring database: %w", err)
	}
	log.Infoln("restore: database restored from S3 backup", latest)
	return nil
}

// RestoreDatabaseFile restores a backup file for the `-restoreDatabase` CLI
// flag. A backup downloaded from the bucket is encrypted; it is decrypted with
// the S3 secret key from OWNCAST_S3_SECRET or OWNCAST_BACKUP_SECRET.
func RestoreDatabaseFile(backupFile, databaseFile string) error {
	raw, err := os.ReadFile(backupFile) // nolint:gosec
	if err != nil {
		return err
	}
	if !storageproviders.IsEncryptedBackup(raw) {
		return utils.Restore(backupFile, databaseFile)
	}

	secrets := []string{os.Getenv("OWNCAST_S3_SECRET"), os.Getenv(previousBackupSecretEnv)}
	if secrets[0] == "" && secrets[1] == "" {
		return fmt.Errorf("%s is an encrypted backup: set OWNCAST_S3_SECRET (or %s) to the S3 secret key that was configured when it was made", backupFile, previousBackupSecretEnv)
	}
	plain, err := storageproviders.DecryptBackup(raw, secrets...)
	if err != nil {
		return explainBackupKeyError(err, "OWNCAST_S3_SECRET or "+previousBackupSecretEnv)
	}

	tmp, err := os.CreateTemp("", "owncast-restore-*.bak")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	_, writeErr := tmp.Write(plain)
	if closeErr := tmp.Close(); writeErr == nil {
		writeErr = closeErr
	}
	if writeErr != nil {
		return writeErr
	}
	return utils.Restore(tmpPath, databaseFile)
}

// explainBackupKeyError tells the operator what to do when no given secret
// matches a backup. tried names the environment variable(s) that were used.
func explainBackupKeyError(err error, tried string) error {
	if errors.Is(err, storageproviders.ErrBackupKeyMismatch) {
		return fmt.Errorf("%w than %s; set %s to the S3 secret key that was configured when the backup was made", err, tried, previousBackupSecretEnv)
	}
	return err
}
