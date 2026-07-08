package core

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/aoiasakawa/aoitube/config"
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
