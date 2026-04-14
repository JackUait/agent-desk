package attachment

import "testing"

func TestLimitsAreWhatSpecSays(t *testing.T) {
	if MaxFileBytes != 10*1024*1024 {
		t.Fatalf("MaxFileBytes = %d, want %d", MaxFileBytes, 10*1024*1024)
	}
	if MaxFilesPerCard != 20 {
		t.Fatalf("MaxFilesPerCard = %d, want 20", MaxFilesPerCard)
	}
	if MaxTotalBytes != 50*1024*1024 {
		t.Fatalf("MaxTotalBytes = %d, want %d", MaxTotalBytes, 50*1024*1024)
	}
}

func TestAttachmentJSONShape(t *testing.T) {
	a := Attachment{Name: "x.txt", Size: 4, MIMEType: "text/plain", UploadedAt: 7}
	if a.Name != "x.txt" || a.Size != 4 || a.MIMEType != "text/plain" || a.UploadedAt != 7 {
		t.Fatalf("unexpected: %+v", a)
	}
}
