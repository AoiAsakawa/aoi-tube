package core

import (
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/storageproviders"
)

func setupStorage() error {
	s3Config := data.GetS3Config()

	// Silent (test) stream mode keeps all output on local storage so nothing
	// is published to external/CDN storage. Local playback is then gated to
	// admins and moderators by the HLS handler. Takes effect on stream start.
	if s3Config.Enabled && !data.GetSilentStreamMode() {
		_storage = storageproviders.NewS3Storage()
	} else {
		_storage = storageproviders.NewLocalStorage()
	}

	if err := _storage.Setup(); err != nil {
		return err
	}

	handler.Storage = _storage

	return nil
}
