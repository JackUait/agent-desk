package mcp

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func newTestServer(t *testing.T) (*httptest.Server, *Sessions, *card.Service) {
	t.Helper()
	store := card.NewStore()
	svc := card.NewService(store)
	sessions := NewSessions()
	srv := NewServer(svc, sessions, nil)
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return ts, sessions, svc
}

func TestServer_UnknownToken_Returns401(t *testing.T) {
	ts, _, _ := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token=ghost", strings.NewReader(`{}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestServer_MissingToken_Returns401(t *testing.T) {
	ts, _, _ := newTestServer(t)
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/", strings.NewReader(`{}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestServer_ToolCall_SetSummary_HappyPath(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	c := svc.CreateCard("p", "x")
	tok := sessions.Mint(c.ID)

	body := `{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/call",
		"params": {
			"name": "mcp__agent_desk__set_summary",
			"arguments": {"summary": "refactoring auth"}
		}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tok, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, body = %s", resp.StatusCode, raw)
	}
	updated, _ := svc.GetCard(c.ID)
	if updated.Summary != "refactoring auth" {
		t.Fatalf("summary = %q, want 'refactoring auth'", updated.Summary)
	}
}

func TestServer_ToolCall_SetStatus_IllegalTransition_ReturnsIsError(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	c := svc.CreateCard("p", "x")
	tok := sessions.Mint(c.ID)

	body := `{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/call",
		"params": {
			"name": "mcp__agent_desk__set_status",
			"arguments": {"column": "done"}
		}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tok, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(raw), `"isError":true`) {
		t.Fatalf("expected isError:true in response, got %s", raw)
	}
	after, _ := svc.GetCard(c.ID)
	if after.Column != card.ColumnBacklog {
		t.Fatalf("column = %q, want unchanged backlog", after.Column)
	}
}

func TestServer_ToolCall_WrongSession_ScopedToOwnCard(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	cA := svc.CreateCard("p", "card A")
	cB := svc.CreateCard("p", "card B")
	tokA := sessions.Mint(cA.ID)

	body := `{
		"jsonrpc":"2.0","id":1,"method":"tools/call",
		"params":{"name":"mcp__agent_desk__set_summary","arguments":{"summary":"only A"}}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tokA, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	resp.Body.Close()

	gotA, _ := svc.GetCard(cA.ID)
	gotB, _ := svc.GetCard(cB.ID)
	if gotA.Summary != "only A" {
		t.Fatalf("card A summary = %q", gotA.Summary)
	}
	if gotB.Summary != "" {
		t.Fatalf("card B summary changed to %q — session leak", gotB.Summary)
	}
}
