package httputil_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func TestJSON(t *testing.T) {
	t.Run("writes JSON response with correct status and headers", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		data := map[string]string{"message": "hello"}

		httputil.JSON(recorder, http.StatusOK, data)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, recorder.Code)
		}

		contentType := recorder.Header().Get("Content-Type")
		if contentType != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", contentType)
		}

		expected := `{"message":"hello"}` + "\n"
		if recorder.Body.String() != expected {
			t.Errorf("expected body %q, got %q", expected, recorder.Body.String())
		}
	})

	t.Run("writes error status codes", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		data := map[string]string{"error": "not found"}

		httputil.JSON(recorder, http.StatusNotFound, data)

		if recorder.Code != http.StatusNotFound {
			t.Errorf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
		}
	})
}

func TestError(t *testing.T) {
	t.Run("writes error response with correct status and structure", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		httputil.Error(recorder, http.StatusNotFound, "board not found")

		if recorder.Code != http.StatusNotFound {
			t.Errorf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
		}

		contentType := recorder.Header().Get("Content-Type")
		if contentType != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", contentType)
		}

		expected := `{"error":"board not found"}` + "\n"
		if recorder.Body.String() != expected {
			t.Errorf("expected body %q, got %q", expected, recorder.Body.String())
		}
	})

	t.Run("writes server error", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		httputil.Error(recorder, http.StatusInternalServerError, "internal error")

		if recorder.Code != http.StatusInternalServerError {
			t.Errorf("expected status %d, got %d", http.StatusInternalServerError, recorder.Code)
		}
	})
}
