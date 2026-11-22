package admin

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
)

func TestMain(m *testing.M) {
	dbFile, err := os.CreateTemp(os.TempDir(), "aoitube-admin-test-*.db")
	if err != nil {
		panic(err)
	}
	dbFile.Close()

	if err := data.SetupPersistence(dbFile.Name()); err != nil {
		panic(err)
	}
	code := m.Run()
	_ = os.Remove(dbFile.Name())
	os.Exit(code)
}

func postS3Config(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/config/s3", strings.NewReader(body))
	rec := httptest.NewRecorder()
	SetS3Configuration(rec, req)
	return rec
}

func TestMaskS3Secret(t *testing.T) {
	masked := maskS3Secret(models.S3{AccessKey: "key", Secret: "real-secret"})
	if masked.Secret != maskedSecretValue || masked.AccessKey != "key" {
		t.Errorf("masked = %+v", masked)
	}
	if empty := maskS3Secret(models.S3{}); empty.Secret != "" {
		t.Errorf("an unset secret must stay empty so the page shows it as unset, got %q", empty.Secret)
	}
}

func TestSetS3ConfigurationKeepsSecretWhenMaskIsPosted(t *testing.T) {
	if err := data.SetS3Config(models.S3{Endpoint: "https://s3.example.com", AccessKey: "key", Secret: "real-secret", Bucket: "b", Region: "auto"}); err != nil {
		t.Fatal(err)
	}

	rec := postS3Config(t, `{"value":{"enabled":false,"endpoint":"https://s3.example.com","accessKey":"key2","secret":"********","bucket":"b","region":"auto"}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	got := data.GetS3Config()
	if got.Secret != "real-secret" || got.AccessKey != "key2" {
		t.Errorf("stored config = access key %q, secret kept: %v", got.AccessKey, got.Secret == "real-secret")
	}

	rec = postS3Config(t, `{"value":{"enabled":false,"endpoint":"https://s3.example.com","accessKey":"key2","secret":"new-secret","bucket":"b","region":"auto"}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if got := data.GetS3Config(); got.Secret != "new-secret" {
		t.Error("a newly typed secret was not stored")
	}
}

func TestSetS3ConfigurationSavesConnectionWithoutLiveDistribution(t *testing.T) {
	rec := postS3Config(t, `{"value":{"enabled":false,"endpoint":"https://acct.r2.cloudflarestorage.com","accessKey":"k","secret":"s","bucket":"private","region":"auto","forcePathStyle":true}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	got := data.GetS3Config()
	if got.Enabled || got.Bucket != "private" || !got.ForcePathStyle {
		t.Errorf("stored config = enabled %v, bucket %q, forcePathStyle %v", got.Enabled, got.Bucket, got.ForcePathStyle)
	}

	rec = postS3Config(t, `{"value":{"enabled":false,"endpoint":"not a url","accessKey":"k","secret":"s","bucket":"private","region":"auto"}}`)
	if rec.Code == http.StatusOK {
		t.Error("an invalid endpoint must be refused even with live distribution off")
	}
}
