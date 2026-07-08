package utils

import (
	"crypto/sha512"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword hashes a password with bcrypt, pre-compressing it so inputs
// longer than bcrypt's 72 byte limit are still accepted.
func HashPassword(password string) (string, error) {
	passwordBytes := compressPassword([]byte(password))
	// 0 will use the default cost of 10 instead
	hash, err := bcrypt.GenerateFromPassword(passwordBytes, 0)
	return string(hash), err
}

// CompareHash compares a bcrypt hash with a password, applying the same
// pre-compression used by HashPassword.
func CompareHash(hash string, password string) error {
	passwordBytes := compressPassword([]byte(password))
	return bcrypt.CompareHashAndPassword([]byte(hash), passwordBytes)
}

// compressPassword computes a sha-512 hash of the password if it is longer
// than 72 bytes, guaranteeing the bcrypt input stays under the limit.
func compressPassword(password []byte) []byte {
	if len(password) > 72 {
		sha512Hashed := sha512.Sum512(password)
		password = sha512Hashed[:]
	}
	return password
}
