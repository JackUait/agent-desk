package attachment

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	root := t.TempDir()
	s := NewStore(root)

	a := Attachment{Name: "notes.txt", Size: 5, MIMEType: "text/plain", UploadedAt: 42}
	if err := s.Put("card-1", a, []byte("hello")); err != nil {
		t.Fatalf("Put: %v", err)
	}

	entries, err := s.List("card-1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "notes.txt" {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	data, mime, err := s.Read("card-1", "notes.txt")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if string(data) != "hello" || mime != "text/plain" {
		t.Fatalf("unexpected data=%q mime=%q", data, mime)
	}

	p := filepath.Join(root, "card-1", "attachments", "notes.txt")
	if _, statErr := os.Stat(p); statErr != nil {
		t.Fatalf("expected file at %s: %v", p, statErr)
	}

	if err := s.Delete("card-1", "notes.txt"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	entries, _ = s.List("card-1")
	if len(entries) != 0 {
		t.Fatalf("expected empty after delete, got %+v", entries)
	}
	if _, statErr := os.Stat(p); !os.IsNotExist(statErr) {
		t.Fatalf("expected file removed, stat err = %v", statErr)
	}
}

func TestStoreListMissingCard(t *testing.T) {
	s := NewStore(t.TempDir())
	entries, err := s.List("nope")
	if err != nil {
		t.Fatalf("List on missing card should be nil error, got %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty slice, got %+v", entries)
	}
}

func TestStoreRejectsTraversal(t *testing.T) {
	s := NewStore(t.TempDir())
	err := s.Put("card-x", Attachment{Name: "../escape.txt"}, []byte("no"))
	if err == nil {
		t.Fatalf("expected error on traversal, got nil")
	}
}

func TestStoreRejectsCollision(t *testing.T) {
	s := NewStore(t.TempDir())
	_ = s.Put("card-x", Attachment{Name: "a.txt", Size: 1, MIMEType: "text/plain"}, []byte("a"))
	err := s.Put("card-x", Attachment{Name: "a.txt", Size: 1, MIMEType: "text/plain"}, []byte("a"))
	if err == nil {
		t.Fatalf("expected collision error")
	}
}
