package core

import (
	"fmt"
	"os"
	"path/filepath"
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

	if data.GetBackupStoreOnS3() {
		if err := uploadBackupToS3(localPath, name); err != nil {
			log.Warnln("backup: unable to upload backup to S3:", err)
		} else {
			log.Infoln("backup: uploaded to S3:", name)
		}
	}

	pruneLocalBackups(data.GetBackupRetentionCount())
}

// uploadBackupToS3 offloads a backup file to the configured bucket.
func uploadBackupToS3(localPath, name string) error {
	s3, err := storageproviders.NewArchiveS3()
	if err != nil {
		return err
	}
	return s3.UploadBackup(localPath, name)
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
	if len(keys) == 0 {
		return fmt.Errorf("no backups found in the S3 bucket under backups/")
	}
	latest := keys[len(keys)-1] // ListBackups returns keys sorted ascending.

	tmp, err := os.CreateTemp("", "owncast-restore-*.bak")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	defer os.Remove(tmpPath)

	log.Infoln("restore: downloading", latest, "from S3")
	if err := s3.DownloadBackupObject(latest, tmpPath); err != nil {
		return fmt.Errorf("downloading %s: %w", latest, err)
	}

	if err := utils.Restore(tmpPath, databaseFile); err != nil {
		return fmt.Errorf("restoring database: %w", err)
	}
	log.Infoln("restore: database restored from S3 backup", latest)
	return nil
}
