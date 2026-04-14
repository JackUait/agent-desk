package attachment

import (
	"errors"
	"io"
	"net/http"
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
	store *Store
	now   NowFunc
}

func NewService(store *Store, now NowFunc) *Service {
	return &Service{store: store, now: now}
}

// Upload reads r in full, enforces limits, stores the bytes, and returns the
// manifest entry it wrote.
func (s *Service) Upload(cardID, name string, r io.Reader) (Attachment, error) {
	if !validName(name) {
		return Attachment{}, ErrInvalidName
	}

	limited := io.LimitReader(r, MaxFileBytes+1)
	buf, err := io.ReadAll(limited)
	if err != nil {
		return Attachment{}, err
	}
	if int64(len(buf)) > MaxFileBytes {
		return Attachment{}, ErrFileTooLarge
	}

	existing, err := s.store.List(cardID)
	if err != nil {
		return Attachment{}, err
	}
	if len(existing) >= MaxFilesPerCard {
		return Attachment{}, ErrTooManyFiles
	}
	var total int64
	for _, e := range existing {
		total += e.Size
	}
	if total+int64(len(buf)) > MaxTotalBytes {
		return Attachment{}, ErrQuotaExceeded
	}

	mime := http.DetectContentType(buf)
	a := Attachment{
		Name:       name,
		Size:       int64(len(buf)),
		MIMEType:   mime,
		UploadedAt: s.now(),
	}
	if putErr := s.store.Put(cardID, a, buf); putErr != nil {
		return Attachment{}, putErr
	}
	return a, nil
}

func (s *Service) List(cardID string) ([]Attachment, error) {
	return s.store.List(cardID)
}

func (s *Service) Read(cardID, name string) ([]byte, string, error) {
	return s.store.Read(cardID, name)
}

func (s *Service) Delete(cardID, name string) error {
	return s.store.Delete(cardID, name)
}
