package storageproviders

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"errors"
)

// Database backups are encrypted before they go to S3. A backup is the whole
// database: stream keys, the admin password hash, payment provider and OAuth
// secrets, the S3 credentials themselves, users and their tokens. A bucket can
// become readable by others through a public domain, an r2.dev URL, an ACL or
// a bucket policy, and the object names are predictable, so the copies in the
// bucket must be useless without a key.
//
// The key is derived from the S3 secret access key. Whoever restores from the
// bucket needs that secret anyway, so the operator has no extra key to keep,
// and making the bucket public does not reveal it. The flip side: after the S3
// key is replaced, restoring a backup made under the old key needs the old
// secret (see the OWNCAST_BACKUP_SECRET handling in core/backup.go).
//
// Layout of an encrypted backup:
//
//	magic (28 bytes) | key ID (8) | salt (16) | nonce (12) | AES-256-GCM ciphertext + tag
//
// The key ID identifies the secret a backup was made with, so a restore with
// the wrong secret is reported as such rather than as damage. Every file gets
// its own random salt, and so its own key. The header is authenticated as
// additional data.

const encryptedBackupMagic = "AoiTube encrypted backup v1\n"

// EncryptedBackupSuffix ends the object name of every encrypted backup, so
// that a listing shows which copies are encrypted.
const EncryptedBackupSuffix = ".enc"

const (
	backupKeyIDSize  = 8
	backupSaltSize   = 16
	backupNonceSize  = 12
	backupHeaderSize = len(encryptedBackupMagic) + backupKeyIDSize + backupSaltSize + backupNonceSize

	// The HKDF info strings separate the two values derived from a secret.
	// Changing either makes every existing backup unreadable.
	backupKeyInfo   = "aoitube backup encryption key v1"
	backupKeyIDInfo = "aoitube backup key id v1"
)

var (
	// ErrBackupKeyMismatch means the backup was made with a secret other
	// than the ones tried.
	ErrBackupKeyMismatch = errors.New("the backup was encrypted with a different S3 secret key")

	// ErrBackupCorrupt means the backup failed authentication: it is
	// truncated or was modified.
	ErrBackupCorrupt = errors.New("the encrypted backup is damaged or was modified")

	errNoBackupSecret = errors.New("no S3 secret key to derive the backup encryption key from")
)

// IsEncryptedBackup reports whether data is an encrypted backup. Backups
// uploaded before encryption are gzip files and never match.
func IsEncryptedBackup(data []byte) bool {
	return bytes.HasPrefix(data, []byte(encryptedBackupMagic))
}

// EncryptBackup encrypts the contents of a backup file with a key derived
// from secret.
func EncryptBackup(plain []byte, secret string) ([]byte, error) {
	if secret == "" {
		return nil, errNoBackupSecret
	}

	keyID, err := backupKeyID(secret)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, backupSaltSize)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	nonce := make([]byte, backupNonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	header := make([]byte, 0, backupHeaderSize)
	header = append(header, encryptedBackupMagic...)
	header = append(header, keyID...)
	header = append(header, salt...)
	header = append(header, nonce...)

	aead, err := backupAEAD(secret, salt)
	if err != nil {
		return nil, err
	}
	// Seal appends to its first argument, which must not overlap the
	// additional data: write into a copy of the header.
	out := make([]byte, len(header), len(header)+len(plain)+aead.Overhead())
	copy(out, header)
	return aead.Seal(out, nonce, plain, header), nil
}

// DecryptBackup decrypts an encrypted backup with whichever of secrets it was
// made with. Empty secrets are skipped.
func DecryptBackup(data []byte, secrets ...string) ([]byte, error) {
	if !IsEncryptedBackup(data) {
		return nil, errors.New("not an encrypted backup")
	}
	if len(data) < backupHeaderSize {
		return nil, ErrBackupCorrupt
	}

	header := data[:backupHeaderSize]
	rest := header[len(encryptedBackupMagic):]
	keyID := rest[:backupKeyIDSize]
	salt := rest[backupKeyIDSize : backupKeyIDSize+backupSaltSize]
	nonce := rest[backupKeyIDSize+backupSaltSize:]

	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		id, err := backupKeyID(secret)
		if err != nil {
			return nil, err
		}
		if !bytes.Equal(id, keyID) {
			continue
		}
		aead, err := backupAEAD(secret, salt)
		if err != nil {
			return nil, err
		}
		plain, err := aead.Open(nil, nonce, data[backupHeaderSize:], header)
		if err != nil {
			return nil, ErrBackupCorrupt
		}
		return plain, nil
	}
	return nil, ErrBackupKeyMismatch
}

// DecodeBackup returns the plaintext of a backup file: encrypted backups are
// decrypted with one of secrets, and backups from before encryption are
// returned unchanged.
func DecodeBackup(data []byte, secrets ...string) ([]byte, error) {
	if !IsEncryptedBackup(data) {
		return data, nil
	}
	return DecryptBackup(data, secrets...)
}

// backupKeyID derives the public identifier of the key made from secret.
func backupKeyID(secret string) ([]byte, error) {
	return hkdf.Key(sha256.New, []byte(secret), nil, backupKeyIDInfo, backupKeyIDSize)
}

// backupAEAD returns the AES-256-GCM cipher for one backup file.
func backupAEAD(secret string, salt []byte) (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, []byte(secret), salt, backupKeyInfo, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
