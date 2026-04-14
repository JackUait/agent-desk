package attachment

import (
	"encoding/json"
	"errors"
	"mime"
	"net/http"
)

// Handler exposes attachment routes.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/cards/{id}/attachments", h.upload)
	mux.HandleFunc("GET /api/cards/{id}/attachments/{name}", h.download)
	mux.HandleFunc("DELETE /api/cards/{id}/attachments/{name}", h.remove)
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")

	mr, err := r.MultipartReader()
	if err != nil {
		writeErr(w, http.StatusBadRequest, "multipart parse failed")
		return
	}

	// Find the "file" part, validate raw filename before Go sanitizes it.
	for {
		part, err := mr.NextPart()
		if err != nil {
			writeErr(w, http.StatusBadRequest, "missing file field")
			return
		}
		if part.FormName() != "file" {
			continue
		}

		// Extract raw filename from Content-Disposition before sanitization.
		rawName := rawFilename(part.Header.Get("Content-Disposition"))
		if rawName == "" {
			rawName = part.FileName()
		}

		a, upErr := h.svc.Upload(cardID, rawName, part)
		if upErr != nil {
			writeErr(w, statusFor(upErr), upErr.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(a)
		return
	}
}

// rawFilename parses the Content-Disposition header and returns the raw
// filename= parameter without any path sanitization.
func rawFilename(cd string) string {
	if cd == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(cd)
	if err != nil {
		return ""
	}
	return params["filename"]
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	name := r.PathValue("name")
	data, mime, err := h.svc.Read(cardID, name)
	if err != nil {
		writeErr(w, statusFor(err), err.Error())
		return
	}
	w.Header().Set("Content-Type", mime)
	_, _ = w.Write(data)
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	name := r.PathValue("name")
	if err := h.svc.Delete(cardID, name); err != nil {
		writeErr(w, statusFor(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func statusFor(err error) int {
	switch {
	case errors.Is(err, ErrFileTooLarge):
		return http.StatusRequestEntityTooLarge
	case errors.Is(err, ErrTooManyFiles), errors.Is(err, ErrQuotaExceeded), errors.Is(err, ErrFileExists):
		return http.StatusConflict
	case errors.Is(err, ErrInvalidName):
		return http.StatusBadRequest
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
