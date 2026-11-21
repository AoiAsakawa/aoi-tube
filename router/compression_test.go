package router

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// The whole web server sits behind the compression middleware, so a release
// of that library that mangles response headers breaks pages while the build
// and every other test stay green. v0.0.9 did that: a response whose handler
// leaves Content-Type to net/http was typed from its compressed bytes
// (application/x-gzip, application/octet-stream) instead of its content.
//
// This test sends the kinds of response the server produces through the
// adapter it really uses and checks that compressing them changes nothing but
// the encoding. It fails against v0.0.9 on the "/sniffed.html" case.

// A body comfortably above the size below which the middleware doesn't bother.
var filler = strings.Repeat("AoiTube streams live video to its viewers. ", 200)

func compressionTestHandler() http.Handler {
	mux := http.NewServeMux()

	// The HTML shell: the handler names its type.
	mux.HandleFunc("/explicit.html", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<!doctype html><html><body>"+filler+"</body></html>")
	})
	// No Content-Type set: net/http works it out from the first bytes, which
	// must be the uncompressed ones.
	mux.HandleFunc("/sniffed.html", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "<!doctype html><html><body>"+filler+"</body></html>")
	})
	// An API response.
	mux.HandleFunc("/api.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"message":"`+filler+`"}`)
	})
	// Bundles are served by http.FileServer, which types them by extension.
	assets := fstest.MapFS{
		"main.js":   {Data: []byte("console.log('" + filler + "');")},
		"style.css": {Data: []byte("body::after { content: '" + filler + "'; }")},
	}
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.FS(assets))))

	return mux
}

func fetch(t *testing.T, handler http.Handler, path, acceptEncoding string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if acceptEncoding != "" {
		r.Header.Set("Accept-Encoding", acceptEncoding)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s (Accept-Encoding %q): status %d", path, acceptEncoding, w.Code)
	}
	return w
}

func TestCompressionKeepsContentType(t *testing.T) {
	compress, err := newCompressionAdapter()
	if err != nil {
		t.Fatalf("unable to create the compression adapter: %v", err)
	}
	plain := compressionTestHandler()
	compressed := compress(compressionTestHandler())

	wantTypes := map[string]string{
		"/explicit.html":    "text/html; charset=utf-8",
		"/sniffed.html":     "text/html; charset=utf-8",
		"/api.json":         "application/json",
		"/assets/main.js":   "text/javascript; charset=utf-8",
		"/assets/style.css": "text/css; charset=utf-8",
	}

	for path, wantType := range wantTypes {
		// What the handler answers without the middleware in the way.
		direct := fetch(t, plain, path, "")
		if got := direct.Header().Get("Content-Type"); got != wantType {
			t.Fatalf("%s without the middleware: Content-Type %q, want %q (the test setup is off)", path, got, wantType)
		}

		for _, encoding := range []string{"", "gzip", "br", "zstd", "gzip, deflate, br, zstd"} {
			response := fetch(t, compressed, path, encoding)

			if got := response.Header().Get("Content-Type"); got != wantType {
				t.Errorf("%s with Accept-Encoding %q: Content-Type %q, want %q", path, encoding, got, wantType)
			}

			used := response.Header().Get("Content-Encoding")
			if encoding == "" {
				if used != "" {
					t.Errorf("%s without Accept-Encoding: got Content-Encoding %q", path, used)
				}
				if !bytes.Equal(response.Body.Bytes(), direct.Body.Bytes()) {
					t.Errorf("%s without Accept-Encoding: the body differs from the handler's", path)
				}
				continue
			}

			// If the middleware stopped compressing, the checks above would
			// pass for the wrong reason.
			if used == "" {
				t.Errorf("%s with Accept-Encoding %q was not compressed", path, encoding)
				continue
			}
			if !strings.Contains(encoding, used) {
				t.Errorf("%s with Accept-Encoding %q: got Content-Encoding %q, which was not offered", path, encoding, used)
			}
			if !strings.Contains(response.Header().Get("Vary"), "Accept-Encoding") {
				t.Errorf("%s with Accept-Encoding %q: Vary is %q, want it to name Accept-Encoding", path, encoding, response.Header().Get("Vary"))
			}
			if used == "gzip" {
				reader, err := gzip.NewReader(response.Body)
				if err != nil {
					t.Errorf("%s: the gzip body can't be read: %v", path, err)
					continue
				}
				body, err := io.ReadAll(reader)
				if err != nil || !bytes.Equal(body, direct.Body.Bytes()) {
					t.Errorf("%s: the gzip body doesn't decompress to the handler's body (err %v)", path, err)
				}
			}
		}
	}
}
