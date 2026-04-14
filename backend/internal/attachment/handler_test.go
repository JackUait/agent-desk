package attachment

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newHandler(t *testing.T) *Handler {
	t.Helper()
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	return NewHandler(svc)
}

func multipartUpload(t *testing.T, name, content string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", name)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	fw.Write([]byte(content))
	mw.Close()
	return &body, mw.FormDataContentType()
}

func TestHandlerUploadCreated(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "readme.txt", "hello world")
	req := httptest.NewRequest("POST", "/api/cards/abc/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rr.Code)
	}
	var a Attachment
	if err := json.Unmarshal(rr.Body.Bytes(), &a); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if a.Name != "readme.txt" || a.Size != 11 {
		t.Fatalf("unexpected: %+v", a)
	}
}

func TestHandlerUploadTooLarge(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	big := strings.Repeat("x", int(MaxFileBytes+1))
	body, ct := multipartUpload(t, "big.bin", big)
	req := httptest.NewRequest("POST", "/api/cards/abc/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", rr.Code)
	}
}

func TestHandlerListDownloadDelete(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "note.txt", "hi")
	up := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	up.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, up)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d", rr.Code)
	}

	// download
	rr = httptest.NewRecorder()
	get := httptest.NewRequest("GET", "/api/cards/c1/attachments/note.txt", nil)
	mux.ServeHTTP(rr, get)
	if rr.Code != http.StatusOK {
		t.Fatalf("download status = %d", rr.Code)
	}
	if rr.Body.String() != "hi" {
		t.Fatalf("body = %q", rr.Body.String())
	}

	// delete
	rr = httptest.NewRecorder()
	del := httptest.NewRequest("DELETE", "/api/cards/c1/attachments/note.txt", nil)
	mux.ServeHTTP(rr, del)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rr.Code)
	}

	// download missing → 404
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, get)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("post-delete get = %d, want 404", rr.Code)
	}
}

func TestHandlerRejectsTraversal(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "../oops.txt", "x")
	req := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

type fakeDirtyRecorder struct {
	addedCalls   []string
	removedCalls []string
}

func (f *fakeDirtyRecorder) RecordAttachmentAdded(cardID, name string) {
	f.addedCalls = append(f.addedCalls, cardID+":"+name)
}
func (f *fakeDirtyRecorder) RecordAttachmentRemoved(cardID, name string) {
	f.removedCalls = append(f.removedCalls, cardID+":"+name)
}

func TestHandlerRecordsDirtyOnUpload(t *testing.T) {
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	rec := &fakeDirtyRecorder{}
	h := NewHandlerWithRecorder(svc, rec)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "a.txt", "x")
	req := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload status %d", rr.Code)
	}
	if len(rec.addedCalls) != 1 || rec.addedCalls[0] != "c1:a.txt" {
		t.Fatalf("unexpected calls %+v", rec.addedCalls)
	}
}

func TestHandlerRecordsDirtyOnDelete(t *testing.T) {
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	rec := &fakeDirtyRecorder{}
	h := NewHandlerWithRecorder(svc, rec)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "a.txt", "x")
	up := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	up.Header.Set("Content-Type", ct)
	mux.ServeHTTP(httptest.NewRecorder(), up)

	del := httptest.NewRequest("DELETE", "/api/cards/c1/attachments/a.txt", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, del)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete status %d", rr.Code)
	}
	if len(rec.removedCalls) != 1 || rec.removedCalls[0] != "c1:a.txt" {
		t.Fatalf("unexpected calls %+v", rec.removedCalls)
	}
}
