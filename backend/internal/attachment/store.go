package attachment

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	ErrInvalidName     = errors.New("attachment: invalid filename")
	ErrFileExists      = errors.New("attachment: filename already exists")
	ErrNotFound        = errors.New("attachment: not found")
	ErrManifestCorrupt = errors.New("attachment: manifest corrupt")
)

// Store persists attachment files and a per-card manifest to disk.
type Store struct {
	root string
	mu   sync.Mutex
}

func NewStore(root string) *Store {
	return &Store{root: root}
}

func (s *Store) cardDir(cardID string) string {
	return filepath.Join(s.root, cardID, "attachments")
}

func (s *Store) manifestPath(cardID string) string {
	return filepath.Join(s.cardDir(cardID), "manifest.json")
}

func validName(name string) bool {
	if name == "" {
		return false
	}
	if strings.ContainsAny(name, "/\\\x00") {
		return false
	}
	if name == "." || name == ".." || strings.Contains(name, "..") {
		return false
	}
	return true
}

func (s *Store) readManifest(cardID string) ([]Attachment, error) {
	path := s.manifestPath(cardID)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return []Attachment{}, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Attachment
	if jsonErr := json.Unmarshal(b, &out); jsonErr != nil {
		return []Attachment{}, nil
	}
	return out, nil
}

func (s *Store) writeManifest(cardID string, entries []Attachment) error {
	if err := os.MkdirAll(s.cardDir(cardID), 0o755); err != nil {
		return err
	}
	tmp := s.manifestPath(cardID) + ".tmp"
	b, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.manifestPath(cardID))
}

// Put writes bytes + appends a manifest entry. Caller sets Name/Size/MIMEType/UploadedAt.
func (s *Store) Put(cardID string, a Attachment, data []byte) error {
	if !validName(a.Name) {
		return ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := s.readManifest(cardID)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Name == a.Name {
			return fmt.Errorf("%w: %s", ErrFileExists, a.Name)
		}
	}
	if err := os.MkdirAll(s.cardDir(cardID), 0o755); err != nil {
		return err
	}
	path := filepath.Join(s.cardDir(cardID), a.Name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	entries = append(entries, a)
	return s.writeManifest(cardID, entries)
}

func (s *Store) List(cardID string) ([]Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readManifest(cardID)
}

func (s *Store) Read(cardID, name string) ([]byte, string, error) {
	if !validName(name) {
		return nil, "", ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := s.readManifest(cardID)
	if err != nil {
		return nil, "", err
	}
	var mime string
	found := false
	for _, e := range entries {
		if e.Name == name {
			mime = e.MIMEType
			found = true
			break
		}
	}
	if !found {
		return nil, "", ErrNotFound
	}
	data, err := os.ReadFile(filepath.Join(s.cardDir(cardID), name))
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return data, mime, nil
}

func (s *Store) Delete(cardID, name string) error {
	if !validName(name) {
		return ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := s.readManifest(cardID)
	if err != nil {
		return err
	}
	kept := entries[:0]
	found := false
	for _, e := range entries {
		if e.Name == name {
			found = true
			continue
		}
		kept = append(kept, e)
	}
	if !found {
		return ErrNotFound
	}
	path := filepath.Join(s.cardDir(cardID), name)
	if rmErr := os.Remove(path); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
		return rmErr
	}
	return s.writeManifest(cardID, kept)
}
