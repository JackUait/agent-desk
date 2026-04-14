package skills

import (
	"path/filepath"
	"testing"
)

func TestResolveWritable(t *testing.T) {
	tmp := t.TempDir()
	roots := Roots{Writable: []string{filepath.Join(tmp, "skills")}}

	ok := filepath.Join(tmp, "skills", "foo", "SKILL.md")
	if _, err := ResolveWritable(ok, roots); err != nil {
		t.Errorf("expected ok, got %v", err)
	}

	bad := filepath.Join(tmp, "other", "SKILL.md")
	if _, err := ResolveWritable(bad, roots); err == nil {
		t.Error("expected rejection for path outside writable roots")
	}

	traversal := filepath.Join(tmp, "skills", "..", "etc", "passwd")
	if _, err := ResolveWritable(traversal, roots); err == nil {
		t.Error("expected rejection for traversal")
	}
}

func TestResolveReadable(t *testing.T) {
	tmp := t.TempDir()
	roots := Roots{
		Writable: []string{filepath.Join(tmp, "skills")},
		Readable: []string{filepath.Join(tmp, "plugins")},
	}
	if _, err := ResolveReadable(filepath.Join(tmp, "skills", "a.md"), roots); err != nil {
		t.Errorf("writable should be readable: %v", err)
	}
	if _, err := ResolveReadable(filepath.Join(tmp, "plugins", "p", "SKILL.md"), roots); err != nil {
		t.Errorf("plugin should be readable: %v", err)
	}
	if _, err := ResolveReadable(filepath.Join(tmp, "nope", "x"), roots); err == nil {
		t.Error("expected rejection for path outside all roots")
	}
}
