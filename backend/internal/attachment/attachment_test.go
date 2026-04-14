package attachment

import (
	"bytes"
	"testing"
)

func TestDefaultLimitsPermitVideo(t *testing.T) {
	lim := DefaultLimits()
	const want int64 = 500 * 1024 * 1024
	if lim.MaxFileBytes != want {
		t.Fatalf("DefaultLimits().MaxFileBytes = %d, want %d", lim.MaxFileBytes, want)
	}
	const wantTotal int64 = 2 * 1024 * 1024 * 1024
	if lim.MaxTotalBytes != wantTotal {
		t.Fatalf("DefaultLimits().MaxTotalBytes = %d, want %d", lim.MaxTotalBytes, wantTotal)
	}
	if lim.MaxFilesPerCard != 20 {
		t.Fatalf("DefaultLimits().MaxFilesPerCard = %d, want 20", lim.MaxFilesPerCard)
	}
}

func TestUploadAcceptsElevenMBWithDefaultLimits(t *testing.T) {
	s := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	buf := make([]byte, 11*1024*1024)
	_, err := s.Upload("c1", "video.mp4", bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("Upload 11MB: %v", err)
	}
}

func TestAttachmentJSONShape(t *testing.T) {
	a := Attachment{Name: "x.txt", Size: 4, MIMEType: "text/plain", UploadedAt: 7}
	if a.Name != "x.txt" || a.Size != 4 || a.MIMEType != "text/plain" || a.UploadedAt != 7 {
		t.Fatalf("unexpected: %+v", a)
	}
}
