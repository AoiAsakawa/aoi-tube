package utils

import (
	"testing"
)

func TestGetHashtagsFromText(t *testing.T) {
	text := `Some text with a #hashtag goes here.\n\n
	Another #secondhashtag, goes here.\n\n
	#thirdhashtag`

	hashtags := GetHashtagsFromText(text)

	if hashtags[0] != "#hashtag" || hashtags[1] != "#secondhashtag" || hashtags[2] != "#thirdhashtag" {
		t.Error("Incorrect hashtags fetched from text.")
	}
}

func TestPercentageUtilsTest(t *testing.T) {
	total := 42
	number := 18

	percent := IntPercentage(number, total)

	if percent != 42 {
		t.Error("Incorrect percentage calculation.")
	}
}

func TestGetCacheDurationSecondsForPath(t *testing.T) {
	const day = 24 * 60 * 60
	for _, tc := range []struct {
		path string
		want int
	}{
		// Content-hashed bundles never change under a given name.
		{"/assets/main-Bmye7hz6.js", 30 * day},
		{"/assets/main-CuPNVWvk.css", 30 * day},
		{"assets/admin-Dm_bb3V8.js", 30 * day},
		// Scripts with a fixed name change in place on a deploy.
		{"/asset-recovery.js", 60 * 60},
		{"/serviceWorker.js", 60 * 60},
		{"/assets/../asset-recovery.js", 60 * 60},
		{"/admin/assets/settings.js", 60 * 60},
		// Other kinds of files keep their rules.
		{"thumbnail.jpg", 20},
		{"/img/follow.svg", 30 * day},
		{"/fonts/inter/inter.woff2", 31557600},
		{"0/stream-abc-1.ts", 31557600},
		{"0/stream.m3u8", 0},
		{"/", 0},
		{"/manifest.json", day},
	} {
		if got := GetCacheDurationSecondsForPath(tc.path); got != tc.want {
			t.Errorf("GetCacheDurationSecondsForPath(%q) = %d, want %d", tc.path, got, tc.want)
		}
	}
}
