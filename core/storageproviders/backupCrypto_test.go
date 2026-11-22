package storageproviders

import (
	"bytes"
	"compress/gzip"
	"errors"
	"testing"
)

const (
	testSecret      = "4f2b9c0e1d7a6b5c8e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d"
	testOtherSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
)

// testBackup returns a small gzip file like the ones utils.Backup writes.
func testBackup(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	w := gzip.NewWriter(&b)
	if _, err := w.Write([]byte("CREATE TABLE datastore (key TEXT, value BLOB);\nINSERT INTO datastore VALUES('s3_storage_config', x'00');\n")); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestEncryptBackupRoundTrip(t *testing.T) {
	plain := testBackup(t)

	encrypted, err := EncryptBackup(plain, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if !IsEncryptedBackup(encrypted) {
		t.Fatal("encrypted backup is not recognized as encrypted")
	}
	if IsEncryptedBackup(plain) {
		t.Fatal("a plain gzip backup must not look encrypted")
	}
	if bytes.Contains(encrypted, []byte("s3_storage_config")) || bytes.Contains(encrypted, plain[10:]) {
		t.Fatal("the plaintext is visible in the encrypted backup")
	}

	decrypted, err := DecryptBackup(encrypted, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decrypted, plain) {
		t.Fatal("decrypted backup differs from the original")
	}
}

func TestEncryptBackupUsesFreshSaltAndNonce(t *testing.T) {
	plain := testBackup(t)
	a, err := EncryptBackup(plain, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	b, err := EncryptBackup(plain, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(a, b) {
		t.Fatal("two encryptions of the same backup are identical")
	}
	// Same secret, so the same key ID.
	idStart, idEnd := len(encryptedBackupMagic), len(encryptedBackupMagic)+backupKeyIDSize
	if !bytes.Equal(a[idStart:idEnd], b[idStart:idEnd]) {
		t.Fatal("the key ID should depend on the secret only")
	}
}

func TestEncryptBackupRequiresSecret(t *testing.T) {
	if _, err := EncryptBackup(testBackup(t), ""); err == nil {
		t.Fatal("encrypting without a secret must fail")
	}
}

func TestDecryptBackupWithWrongSecret(t *testing.T) {
	encrypted, err := EncryptBackup(testBackup(t), testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := DecryptBackup(encrypted, testOtherSecret); !errors.Is(err, ErrBackupKeyMismatch) {
		t.Fatalf("err = %v, want ErrBackupKeyMismatch", err)
	}
	if _, err := DecryptBackup(encrypted); !errors.Is(err, ErrBackupKeyMismatch) {
		t.Fatalf("no secrets: err = %v, want ErrBackupKeyMismatch", err)
	}
	if _, err := DecryptBackup(encrypted, ""); !errors.Is(err, ErrBackupKeyMismatch) {
		t.Fatalf("empty secret: err = %v, want ErrBackupKeyMismatch", err)
	}
}

func TestDecryptBackupFindsPreviousSecret(t *testing.T) {
	plain := testBackup(t)
	// Made before the S3 key was replaced: the current secret no longer
	// matches, the previous one does.
	encrypted, err := EncryptBackup(plain, testOtherSecret)
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := DecryptBackup(encrypted, testSecret, "", testOtherSecret)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decrypted, plain) {
		t.Fatal("decrypted backup differs from the original")
	}
}

func TestDecryptBackupDetectsTampering(t *testing.T) {
	encrypted, err := EncryptBackup(testBackup(t), testSecret)
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]func([]byte) []byte{
		"ciphertext byte flipped": func(b []byte) []byte { b[len(b)-20] ^= 0x01; return b },
		"tag byte flipped":        func(b []byte) []byte { b[len(b)-1] ^= 0x80; return b },
		"salt byte flipped":       func(b []byte) []byte { b[len(encryptedBackupMagic)+backupKeyIDSize] ^= 0x01; return b },
		"nonce byte flipped":      func(b []byte) []byte { b[backupHeaderSize-1] ^= 0x01; return b },
		"truncated":               func(b []byte) []byte { return b[:len(b)-1] },
		"header only":             func(b []byte) []byte { return b[:backupHeaderSize] },
		"cut inside header":       func(b []byte) []byte { return b[:backupHeaderSize-4] },
	}
	for name, damage := range cases {
		t.Run(name, func(t *testing.T) {
			damaged := damage(bytes.Clone(encrypted))
			if _, err := DecryptBackup(damaged, testSecret); !errors.Is(err, ErrBackupCorrupt) {
				t.Fatalf("err = %v, want ErrBackupCorrupt", err)
			}
		})
	}

	// A changed key ID reads as "different secret": it can't be told apart
	// from a backup made with another key.
	damaged := bytes.Clone(encrypted)
	damaged[len(encryptedBackupMagic)] ^= 0x01
	if _, err := DecryptBackup(damaged, testSecret); !errors.Is(err, ErrBackupKeyMismatch) {
		t.Fatalf("changed key ID: err = %v, want ErrBackupKeyMismatch", err)
	}
}

func TestDecodeBackupPassesLegacyBackupsThrough(t *testing.T) {
	plain := testBackup(t)
	decoded, err := DecodeBackup(plain, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded, plain) {
		t.Fatal("a backup from before encryption must be returned unchanged")
	}

	encrypted, err := EncryptBackup(plain, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err = DecodeBackup(encrypted, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded, plain) {
		t.Fatal("DecodeBackup did not decrypt an encrypted backup")
	}
}

func TestDecryptBackupRejectsPlainData(t *testing.T) {
	if _, err := DecryptBackup(testBackup(t), testSecret); err == nil {
		t.Fatal("decrypting a plain backup must fail")
	}
}
