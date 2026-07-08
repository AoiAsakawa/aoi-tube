package storageproviders

import "testing"

func TestArchiveObjectKey(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"20260101-120000/0/seg-5.m4s", "archives/20260101-120000/0/seg-5.m4s"},
		{"/20260101-120000/0/seg-5.m4s", "archives/20260101-120000/0/seg-5.m4s"},
		{"20260101-120000", "archives/20260101-120000"},
	}
	for _, c := range cases {
		if got := ArchiveObjectKey(c.in); got != c.want {
			t.Errorf("ArchiveObjectKey(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestArchiveContentType(t *testing.T) {
	cases := map[string]string{
		"a/b/seg.m4s":     "video/mp4",
		"a/init-0.mp4":    "video/mp4",
		"a/seg.ts":        "video/mp2t",
		"a/stream.m3u8":   "",
		"a/manifest.json": "",
	}
	for in, want := range cases {
		if got := archiveContentType(in); got != want {
			t.Errorf("archiveContentType(%q) = %q, want %q", in, got, want)
		}
	}
}
