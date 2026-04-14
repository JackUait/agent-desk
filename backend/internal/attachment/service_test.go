package attachment

import (
	"bytes"
	"strings"
	"testing"
)

func newSvc(t *testing.T) *Service {
	t.Helper()
	return NewService(NewStore(t.TempDir()), func() int64 { return 100 })
}

func TestUploadSuccess(t *testing.T) {
	s := newSvc(t)
	a, err := s.Upload("c1", "hello.txt", bytes.NewReader([]byte("hi there")))
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if a.Name != "hello.txt" || a.Size != int64(len("hi there")) {
		t.Fatalf("unexpected: %+v", a)
	}
	if !strings.HasPrefix(a.MIMEType, "text/") {
		t.Fatalf("unexpected mime: %q", a.MIMEType)
	}
	if a.UploadedAt != 100 {
		t.Fatalf("UploadedAt = %d, want 100", a.UploadedAt)
	}
}

func TestUploadRejectsOversize(t *testing.T) {
	s := newSvc(t)
	big := bytes.NewReader(make([]byte, MaxFileBytes+1))
	_, err := s.Upload("c1", "big.bin", big)
	if err == nil {
		t.Fatalf("expected oversize error")
	}
	if err != ErrFileTooLarge {
		t.Fatalf("err = %v, want ErrFileTooLarge", err)
	}
}

func TestUploadRejectsAtFileCountCap(t *testing.T) {
	s := newSvc(t)
	for i := 0; i < MaxFilesPerCard; i++ {
		name := "f" + string(rune('a'+i)) + ".txt"
		if _, err := s.Upload("c1", name, bytes.NewReader([]byte("x"))); err != nil {
			t.Fatalf("Upload %d: %v", i, err)
		}
	}
	_, err := s.Upload("c1", "overflow.txt", bytes.NewReader([]byte("x")))
	if err != ErrTooManyFiles {
		t.Fatalf("err = %v, want ErrTooManyFiles", err)
	}
}

func TestUploadRejectsTotalQuota(t *testing.T) {
	s := newSvc(t)
	chunk := make([]byte, MaxFileBytes)
	for i := 0; i < 5; i++ {
		name := "blob" + string(rune('0'+i)) + ".bin"
		if _, err := s.Upload("c1", name, bytes.NewReader(chunk)); err != nil {
			t.Fatalf("Upload %d: %v", i, err)
		}
	}
	_, err := s.Upload("c1", "overflow.bin", bytes.NewReader(chunk))
	if err != ErrQuotaExceeded {
		t.Fatalf("err = %v, want ErrQuotaExceeded", err)
	}
}

func TestUploadSanitizesTraversal(t *testing.T) {
	s := newSvc(t)
	_, err := s.Upload("c1", "../escape.txt", bytes.NewReader([]byte("x")))
	if err != ErrInvalidName {
		t.Fatalf("err = %v, want ErrInvalidName", err)
	}
}
