package attachment

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

var (
	ErrFileTooLarge  = errors.New("attachment: file too large")
	ErrTooManyFiles  = errors.New("attachment: too many attachments")
	ErrQuotaExceeded = errors.New("attachment: quota exceeded")
)

// NowFunc returns the current unix time; injected for tests.
type NowFunc func() int64

// Service is the upload/list/read/delete policy layer above Store.
type Service struct {
	store  *Store
	now    NowFunc
	limits Limits
}

func NewService(store *Store, now NowFunc) *Service {
	return NewServiceWithLimits(store, now, DefaultLimits())
}

func NewServiceWithLimits(store *Store, now NowFunc, lim Limits) *Service {
	return &Service{store: store, now: now, limits: lim}
}

// Upload reads r in full, enforces limits, stores the bytes, and returns the
// manifest entry it wrote.
func (s *Service) Upload(cardID, name string, r io.Reader) (Attachment, error) {
	if !validName(name) {
		return Attachment{}, ErrInvalidName
	}

	limited := io.LimitReader(r, s.limits.MaxFileBytes+1)
	buf, err := io.ReadAll(limited)
	if err != nil {
		return Attachment{}, err
	}
	if int64(len(buf)) > s.limits.MaxFileBytes {
		return Attachment{}, ErrFileTooLarge
	}

	existing, err := s.store.List(cardID)
	if err != nil {
		return Attachment{}, err
	}
	if len(existing) >= s.limits.MaxFilesPerCard {
		return Attachment{}, ErrTooManyFiles
	}
	var total int64
	for _, e := range existing {
		total += e.Size
	}
	if total+int64(len(buf)) > s.limits.MaxTotalBytes {
		return Attachment{}, ErrQuotaExceeded
	}

	a := Attachment{
		Name:       name,
		Size:       int64(len(buf)),
		MIMEType:   detectMIME(name, buf),
		UploadedAt: s.now(),
	}
	if putErr := s.store.Put(cardID, a, buf); putErr != nil {
		return Attachment{}, putErr
	}
	return a, nil
}

// detectMIME prefers content sniffing, but falls back to the filename
// extension when sniffing yields a generic octet-stream — common for
// QuickTime/MP4 variants the stdlib sniffer doesn't recognize.
func detectMIME(name string, buf []byte) string {
	sniffed := http.DetectContentType(buf)
	if sniffed != "application/octet-stream" {
		return sniffed
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return sniffed
	}
	if byExt := mime.TypeByExtension(ext); byExt != "" {
		if semi := strings.IndexByte(byExt, ';'); semi != -1 {
			byExt = strings.TrimSpace(byExt[:semi])
		}
		return byExt
	}
	return sniffed
}

func (s *Service) List(cardID string) ([]Attachment, error) {
	return s.store.List(cardID)
}

func (s *Service) Read(cardID, name string) ([]byte, string, error) {
	data, m, err := s.store.Read(cardID, name)
	if err != nil {
		return nil, "", err
	}
	if m == "" || m == "application/octet-stream" {
		if recovered := mimeByExtension(name); recovered != "" {
			m = recovered
		} else {
			m = detectMIME(name, data)
		}
	}
	return data, m, nil
}

func mimeByExtension(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return ""
	}
	t := mime.TypeByExtension(ext)
	if t == "" {
		return ""
	}
	if semi := strings.IndexByte(t, ';'); semi != -1 {
		t = strings.TrimSpace(t[:semi])
	}
	return t
}

func (s *Service) Delete(cardID, name string) error {
	return s.store.Delete(cardID, name)
}
