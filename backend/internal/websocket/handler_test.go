package websocket_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/internal/domain"
	"github.com/jackuait/agent-desk/backend/internal/mcp"
	"github.com/jackuait/agent-desk/backend/internal/project"
	wsinternal "github.com/jackuait/agent-desk/backend/internal/websocket"
	gowebsocket "nhooyr.io/websocket"
)

// noopGit satisfies project.Git without touching the filesystem.
type noopGit struct{}

func (noopGit) IsRepo(path string) bool { return true }
func (noopGit) Init(path string) error  { return nil }

// spyClaudeBin writes a tiny shell script that appends each invocation's
// argv to argvFile (one arg per line, invocation-separated by a blank line)
// and exits immediately with no output. Used by slice-B4 tests to observe
// the --model flag passed to agent.Manager.Send without mocking it.
func spyClaudeBin(t *testing.T, argvFile string) string {
	t.Helper()
	script := fmt.Sprintf("#!/bin/sh\n{ printf '%%s\\n' \"$@\"; printf -- '---\\n'; } >> %q\nexit 0\n", argvFile)
	path := filepath.Join(t.TempDir(), "spy-claude.sh")
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("spyClaudeBin write: %v", err)
	}
	return path
}

// readSpyArgv reads the argv capture file produced by spyClaudeBin and
// returns the individual invocations (each a []string).
func readSpyArgv(t *testing.T, path string) [][]string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("read argv file: %v", err)
	}
	var invocations [][]string
	var current []string
	for _, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if line == "---" {
			invocations = append(invocations, current)
			current = nil
			continue
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		invocations = append(invocations, current)
	}
	return invocations
}

// buildServerWithSpy wires the ws handler against a spy Claude binary so
// tests can assert on the argv the spawned "agent" received.
func buildServerWithSpy(t *testing.T, argvFile string) (srv *httptest.Server, svc *card.Service, cardID string) {
	t.Helper()

	store := card.NewStore()
	svc = card.NewService(store)
	c := svc.CreateCard("proj-test", "model test")

	hub := wsinternal.NewHub()
	manager := agent.NewManager(spyClaudeBin(t, argvFile))
	projStore := project.NewStore(noopGit{})
	h := wsinternal.NewHandler(hub, manager, svc, projStore, nil, 0)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, svc, c.ID
}

// argvContainsModel returns true if the argv has "--model id" as adjacent entries.
func argvContainsModel(argv []string, id string) bool {
	for i, a := range argv {
		if a == "--model" && i+1 < len(argv) && argv[i+1] == id {
			return true
		}
	}
	return false
}

// argvContainsEffort returns true if the argv has "--effort level" as
// adjacent entries.
func argvContainsEffort(argv []string, level string) bool {
	for i, a := range argv {
		if a == "--effort" && i+1 < len(argv) && argv[i+1] == level {
			return true
		}
	}
	return false
}

// waitForSpyArgv polls until the spy binary has recorded at least one
// invocation or the deadline elapses.
func waitForSpyArgv(t *testing.T, path string, timeout time.Duration) [][]string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		inv := readSpyArgv(t, path)
		if len(inv) > 0 {
			return inv
		}
		time.Sleep(20 * time.Millisecond)
	}
	return nil
}

// buildServer wires up a test HTTP server with the WebSocket handler.
func buildServer(t *testing.T) (srv *httptest.Server, cardID string, hub *wsinternal.Hub) {
	t.Helper()

	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "test card")

	hub = wsinternal.NewHub()
	// Use "false" as the agent binary — it exits immediately so tests don't hang.
	manager := agent.NewManager("false")
	projStore := project.NewStore(noopGit{})
	h := wsinternal.NewHandler(hub, manager, svc, projStore, nil, 0)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	return srv, c.ID, hub
}

func TestHandler_ClientReceivesHubBroadcast(t *testing.T) {
	srv, cardID, hub := buildServer(t)

	// Convert HTTP URL to ws:// URL.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/" + cardID + "/ws"

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := gowebsocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()

	// Give the server a moment to set up the subscription.
	time.Sleep(20 * time.Millisecond)

	// Broadcast a message through the hub.
	payload, _ := json.Marshal(map[string]string{"hello": "world"})
	hub.Broadcast(cardID, payload)

	// Expect the client to receive it.
	conn.SetReadLimit(1 << 20)
	_, got, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != string(payload) {
		t.Fatalf("expected %s, got %s", payload, got)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_BroadcastsErrorOnInvalidMerge(t *testing.T) {
	srv, cardID, _ := buildServer(t)

	// Card is in "backlog" — merging requires "review", so this must fail.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/" + cardID + "/ws"

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := gowebsocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()

	// Give the server a moment to set up the subscription.
	time.Sleep(20 * time.Millisecond)

	// Send a merge command — should fail because card is in backlog.
	mergeMsg, _ := json.Marshal(map[string]string{"type": "merge"})
	if err := conn.Write(ctx, gowebsocket.MessageText, mergeMsg); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Read the response — expect an error message broadcast.
	conn.SetReadLimit(1 << 20)
	_, got, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var resp struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(got, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Type != "error" {
		t.Fatalf("expected type %q, got %q", "error", resp.Type)
	}
	if !strings.Contains(resp.Message, "MoveToDone") {
		t.Fatalf("expected message to mention MoveToDone, got %q", resp.Message)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

// collectBridgeFrames runs StartEventBridge against a real hub+card and
// returns the parsed JSON frames in order. It blocks until the bridge
// returns (events chan closed) or the short deadline expires.
func collectBridgeFrames(t *testing.T, events []agent.StreamEvent) (string, []map[string]any) {
	t.Helper()

	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "bridge test")
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc, project.NewStore(noopGit{}), nil, 0)

	ch := make(chan []byte, 256)
	hub.Subscribe(c.ID, ch)
	t.Cleanup(func() { hub.Unsubscribe(c.ID, ch) })

	evCh := make(chan agent.StreamEvent, len(events)+1)
	for _, e := range events {
		evCh <- e
	}
	close(evCh)

	done := make(chan struct{})
	go func() {
		h.StartEventBridge(c.ID, evCh)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("StartEventBridge did not return within 2s")
	}

	// Drain the subscriber channel of everything enqueued so far.
	var frames []map[string]any
drain:
	for {
		select {
		case raw := <-ch:
			var f map[string]any
			if err := json.Unmarshal(raw, &f); err != nil {
				t.Fatalf("unmarshal frame: %v — raw=%s", err, raw)
			}
			frames = append(frames, f)
		default:
			break drain
		}
	}

	return c.ID, frames
}

// frameTypes returns the ordered list of "type" values in frames.
func frameTypes(frames []map[string]any) []string {
	out := make([]string, 0, len(frames))
	for _, f := range frames {
		if t, ok := f["type"].(string); ok {
			out = append(out, t)
		} else {
			out = append(out, "<no-type>")
		}
	}
	return out
}

func TestEventBridge_EmitsTurnStart_OnMessageStart(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "sess-1"},
	})
	if len(frames) != 1 {
		t.Fatalf("expected 1 frame, got %d: %+v", len(frames), frameTypes(frames))
	}
	f := frames[0]
	if f["type"] != "turn_start" {
		t.Fatalf("expected turn_start, got %v", f["type"])
	}
	if f["sessionId"] != "sess-1" {
		t.Fatalf("expected sessionId sess-1, got %v", f["sessionId"])
	}
}

func TestEventBridge_EmitsBlockStartBlockDeltaBlockStop_ForPartialText(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventPartialTextStart, Index: 0},
		{Type: agent.EventPartialText, Index: 0, Text: "Hi "},
		{Type: agent.EventPartialText, Index: 0, Text: "there"},
		{Type: agent.EventContentBlockStop, Index: 0},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "block_start", "block_delta", "block_delta", "block_stop"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	if frames[1]["kind"] != "text" {
		t.Fatalf("expected block_start kind=text, got %v", frames[1]["kind"])
	}
	if frames[1]["index"].(float64) != 0 {
		t.Fatalf("expected index 0")
	}
	if frames[2]["text"] != "Hi " || frames[3]["text"] != "there" {
		t.Fatalf("block_delta text mismatch: %v %v", frames[2]["text"], frames[3]["text"])
	}
	if frames[4]["index"].(float64) != 0 {
		t.Fatalf("block_stop index mismatch")
	}
}

func TestEventBridge_LegacyFramesNotEmitted(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventTextDelta, Text: "Hello"},
		{Type: agent.EventMessageStop, Text: "Hello"},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "turn_end"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	for _, f := range frames {
		if ty, _ := f["type"].(string); ty == "token" || ty == "message" {
			t.Fatalf("legacy frame %q should no longer be emitted: %+v", ty, f)
		}
	}
}

func TestEventBridge_DedupesToolUseStart_BetweenSnapshotAndStreamEvent(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventToolUseStart, ToolID: "t1", ToolName: "Bash", Index: 0},
		{Type: agent.EventToolUseStart, ToolID: "t1", ToolName: "Bash"},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "block_start"}
	if !equalStrings(got, want) {
		t.Fatalf("expected single block_start after dedupe, got %v", got)
	}
	if frames[1]["kind"] != "tool_use" {
		t.Fatalf("expected kind=tool_use, got %v", frames[1]["kind"])
	}
	if frames[1]["toolId"] != "t1" || frames[1]["toolName"] != "Bash" {
		t.Fatalf("tool fields mismatch: %+v", frames[1])
	}
}

func TestEventBridge_EmitsToolInputDelta_ForPartialJSON(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventToolUseStart, ToolID: "t1", ToolName: "Bash", Index: 0},
		{Type: agent.EventToolInputDelta, Index: 0, PartialJSON: `{"cmd`},
		{Type: agent.EventToolInputDelta, Index: 0, PartialJSON: `": "ls"}`},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "block_start", "block_delta", "block_delta"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	if frames[2]["partialJson"] != `{"cmd` {
		t.Fatalf("partialJson mismatch: %v", frames[2]["partialJson"])
	}
	if frames[3]["partialJson"] != `": "ls"}` {
		t.Fatalf("partialJson mismatch: %v", frames[3]["partialJson"])
	}
}

func TestEventBridge_EmitsThinkingDelta(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventThinkingStart, Index: 0},
		{Type: agent.EventThinkingDelta, Index: 0, Thinking: "Let me "},
		{Type: agent.EventThinkingDelta, Index: 0, Thinking: "think..."},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "block_start", "block_delta", "block_delta"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	if frames[1]["kind"] != "thinking" {
		t.Fatalf("expected kind=thinking, got %v", frames[1]["kind"])
	}
	if frames[2]["thinking"] != "Let me " || frames[3]["thinking"] != "think..." {
		t.Fatalf("thinking delta mismatch: %v %v", frames[2]["thinking"], frames[3]["thinking"])
	}
}

func TestEventBridge_EmitsToolResult(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventToolResult, ToolUseID: "t1", ToolResult: "hello world", IsError: false},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "tool_result"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	if frames[1]["toolUseId"] != "t1" {
		t.Fatalf("toolUseId mismatch: %v", frames[1]["toolUseId"])
	}
	if frames[1]["content"] != "hello world" {
		t.Fatalf("content mismatch: %v", frames[1]["content"])
	}
	if frames[1]["isError"] != false {
		t.Fatalf("isError mismatch: %v", frames[1]["isError"])
	}
}

func TestEventBridge_EmitsTurnEnd_WithMetrics(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventMessageDelta, StopReason: "end_turn", InputTokens: 6, OutputTokens: 10},
		{Type: agent.EventMessageStop, Text: "done", DurationMS: 3245, CostUSD: 0.18, InputTokens: 6, OutputTokens: 10},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "turn_end"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch (no legacy message frame expected)\nwant: %v\n got: %v", want, got)
	}
	te := frames[1]
	if te["durationMs"].(float64) != 3245 {
		t.Fatalf("durationMs mismatch: %v", te["durationMs"])
	}
	if te["costUsd"].(float64) != 0.18 {
		t.Fatalf("costUsd mismatch: %v", te["costUsd"])
	}
	if te["inputTokens"].(float64) != 6 {
		t.Fatalf("inputTokens mismatch: %v", te["inputTokens"])
	}
	if te["outputTokens"].(float64) != 10 {
		t.Fatalf("outputTokens mismatch: %v", te["outputTokens"])
	}
	if te["stopReason"] != "end_turn" {
		t.Fatalf("stopReason mismatch: %v", te["stopReason"])
	}
}

func TestEventBridge_TurnStart_ResetsDedupeSet(t *testing.T) {
	_, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventToolUseStart, ToolID: "t1", ToolName: "Bash"},
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventToolUseStart, ToolID: "t1", ToolName: "Bash"},
	})
	got := frameTypes(frames)
	want := []string{"turn_start", "block_start", "turn_start", "block_start"}
	if !equalStrings(got, want) {
		t.Fatalf("expected two turns with one block_start each\nwant: %v\n got: %v", want, got)
	}
}

func TestEventBridge_ReadyForReviewStillMovesCard(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "review test")
	// Move through statuses so MoveToReview is legal.
	if _, err := svc.StartDevelopment(c.ID); err != nil {
		t.Fatalf("StartDevelopment: %v", err)
	}
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc, project.NewStore(noopGit{}), nil, 0)

	ch := make(chan []byte, 256)
	hub.Subscribe(c.ID, ch)
	t.Cleanup(func() { hub.Unsubscribe(c.ID, ch) })

	evCh := make(chan agent.StreamEvent, 8)
	evCh <- agent.StreamEvent{Type: agent.EventMessageStart, SessionID: "s"}
	evCh <- agent.StreamEvent{Type: agent.EventTextDelta, Text: "All done. READY_FOR_REVIEW\n"}
	close(evCh)

	done := make(chan struct{})
	go func() {
		h.StartEventBridge(c.ID, evCh)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("bridge hang")
	}

	got, err := svc.GetCard(c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Column != card.ColumnReview {
		t.Fatalf("expected card moved to review, got %q", got.Column)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// --- Slice B4: model-on-message-frame tests ---

func dialWS(t *testing.T, srv *httptest.Server, cardID string) (*gowebsocket.Conn, context.Context, context.CancelFunc) {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/" + cardID + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	conn, _, err := gowebsocket.Dial(ctx, wsURL, nil)
	if err != nil {
		cancel()
		t.Fatalf("dial: %v", err)
	}
	// Give the handler a beat to set up the subscription.
	time.Sleep(20 * time.Millisecond)
	return conn, ctx, cancel
}

func TestHandler_MessageFrame_ValidModel_SetsModelAndSpawnsWithFlag(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
		"model":   "claude-sonnet-4-6",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if !argvContainsModel(inv[0], "claude-sonnet-4-6") {
		t.Fatalf("expected --model claude-sonnet-4-6 in argv; got %v", inv[0])
	}

	// Model must have been persisted via SetModel.
	got, err := svc.GetCard(cardID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Model != "claude-sonnet-4-6" {
		t.Fatalf("expected persisted model claude-sonnet-4-6, got %q", got.Model)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_MessageFrame_InvalidModel_BroadcastsErrorAndSkipsSpawn(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
		"model":   "bogus",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Expect an error frame back.
	conn.SetReadLimit(1 << 20)
	_, got, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var resp struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(got, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Type != "error" {
		t.Fatalf("expected type error, got %q", resp.Type)
	}
	if !strings.Contains(resp.Message, "unknown model: bogus") {
		t.Fatalf("expected 'unknown model: bogus' in message, got %q", resp.Message)
	}

	// No spawn should have occurred.
	time.Sleep(100 * time.Millisecond)
	if inv := readSpyArgv(t, argvFile); len(inv) != 0 {
		t.Fatalf("expected zero spawns, got %d: %v", len(inv), inv)
	}

	// Card model must NOT have been persisted.
	got2, _ := svc.GetCard(cardID)
	if got2.Model != "" {
		t.Fatalf("expected empty card.Model, got %q", got2.Model)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_MessageFrame_NoModel_UsesCardPersistedModel(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	// Pre-set a model via the service so the handler must read it from the card.
	if _, err := svc.SetModel(cardID, "claude-haiku-4-5"); err != nil {
		t.Fatalf("pre-set model: %v", err)
	}

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if !argvContainsModel(inv[0], "claude-haiku-4-5") {
		t.Fatalf("expected --model claude-haiku-4-5 in argv; got %v", inv[0])
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_StartFrame_IgnoresClientModelField(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	// Pre-set haiku on the card so we can see that start spawns with the
	// card's persisted model, not the "claude-sonnet-4-6" the client sends.
	if _, err := svc.SetModel(cardID, "claude-haiku-4-5"); err != nil {
		t.Fatalf("pre-set model: %v", err)
	}

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":  "start",
		"model": "claude-sonnet-4-6",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if argvContainsModel(inv[0], "claude-sonnet-4-6") {
		t.Fatalf("start frame must not honour client model; got %v", inv[0])
	}
	if !argvContainsModel(inv[0], "claude-haiku-4-5") {
		t.Fatalf("expected persisted --model claude-haiku-4-5 in argv; got %v", inv[0])
	}

	// Card model must remain the persisted value — start frame must not overwrite.
	got, _ := svc.GetCard(cardID)
	if got.Model != "claude-haiku-4-5" {
		t.Fatalf("expected card model unchanged, got %q", got.Model)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestWS_Message_ValidEffort_PersistsAndSpawnsWithFlag(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
		"model":   "claude-sonnet-4-6",
		"effort":  "high",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if !argvContainsEffort(inv[0], "high") {
		t.Fatalf("expected --effort high in argv; got %v", inv[0])
	}

	got, err := svc.GetCard(cardID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Effort != "high" {
		t.Fatalf("expected persisted effort high, got %q", got.Effort)
	}

	// Drain at least one card_update frame from the connection to confirm
	// the broadcast happened. Model update (from claude-sonnet-4-6) and
	// effort update each broadcast a card_update; read both and look for
	// the one with effort = "high".
	conn.SetReadLimit(1 << 20)
	deadline, cancelR := context.WithTimeout(ctx, 2*time.Second)
	defer cancelR()
	foundEffort := false
	for !foundEffort {
		_, raw, readErr := conn.Read(deadline)
		if readErr != nil {
			break
		}
		var frame struct {
			Type   string `json:"type"`
			Fields struct {
				Effort string `json:"effort"`
			} `json:"fields"`
		}
		if err := json.Unmarshal(raw, &frame); err != nil {
			continue
		}
		if frame.Type == "card_update" && frame.Fields.Effort == "high" {
			foundEffort = true
		}
	}
	if !foundEffort {
		t.Error("expected a card_update frame with effort=high")
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestWS_Message_InvalidEffort_BroadcastsErrorNoSpawn(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
		"model":   "claude-opus-4-6",
		"effort":  "ultra",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Expect at least one error frame referencing unknown effort.
	conn.SetReadLimit(1 << 20)
	deadline, cancelR := context.WithTimeout(ctx, 2*time.Second)
	defer cancelR()
	foundErr := false
	for !foundErr {
		_, raw, readErr := conn.Read(deadline)
		if readErr != nil {
			break
		}
		var resp struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(raw, &resp); err != nil {
			continue
		}
		if resp.Type == "error" && strings.Contains(resp.Message, "unknown effort") {
			foundErr = true
		}
	}
	if !foundErr {
		t.Fatal("expected an error frame containing 'unknown effort'")
	}

	// No spawn should have occurred.
	time.Sleep(100 * time.Millisecond)
	if inv := readSpyArgv(t, argvFile); len(inv) != 0 {
		t.Fatalf("expected zero spawns, got %d: %v", len(inv), inv)
	}

	// Card effort must NOT have been persisted.
	got, _ := svc.GetCard(cardID)
	if got.Effort != "" {
		t.Fatalf("expected empty card.Effort, got %q", got.Effort)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestWS_Message_AbsentEffort_UsesPersistedValue(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	// Pre-set effort on the card so the handler must read it from persistence.
	if _, err := svc.SetEffort(cardID, "low"); err != nil {
		t.Fatalf("pre-set effort: %v", err)
	}

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if !argvContainsEffort(inv[0], "low") {
		t.Fatalf("expected --effort low in argv; got %v", inv[0])
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestWS_Start_IgnoresClientEffort(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	// Pre-set effort = medium so we can see that start uses the persisted
	// value, not a client-supplied "max".
	if _, err := svc.SetEffort(cardID, "medium"); err != nil {
		t.Fatalf("pre-set effort: %v", err)
	}

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":   "start",
		"effort": "max",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) == 0 {
		t.Fatal("expected one spawn invocation, got none")
	}
	if !argvContainsEffort(inv[0], "medium") {
		t.Fatalf("expected persisted --effort medium in argv; got %v", inv[0])
	}
	if argvContainsEffort(inv[0], "max") {
		t.Fatalf("start frame must not honour client effort; got %v", inv[0])
	}

	// Card effort must remain unchanged.
	got, _ := svc.GetCard(cardID)
	if got.Effort != "medium" {
		t.Fatalf("expected card.Effort unchanged (medium), got %q", got.Effort)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_MessageFrame_PersistsUserMessage(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	srv, svc, cardID := buildServerWithSpy(t, argvFile)

	conn, ctx, cancel := dialWS(t, srv, cardID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hello",
		"model":   "claude-sonnet-4-6",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	if inv := waitForSpyArgv(t, argvFile, 2*time.Second); len(inv) == 0 {
		t.Fatal("expected spawn to complete")
	}

	deadline := time.Now().Add(2 * time.Second)
	var msgs []domain.Message
	for time.Now().Before(deadline) {
		got, err := svc.ListMessages(cardID)
		if err != nil {
			t.Fatalf("ListMessages: %v", err)
		}
		if len(got) >= 1 {
			msgs = got
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(msgs) < 1 {
		t.Fatalf("expected at least 1 persisted message, got %d", len(msgs))
	}
	if msgs[0].Role != "user" {
		t.Fatalf("expected first message role=user, got %q", msgs[0].Role)
	}
	if msgs[0].Content != "hello" {
		t.Fatalf("expected first message content=hello, got %q", msgs[0].Content)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestEventBridge_PersistsAssistantMessage_OnTextDelta(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "bridge persist")
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc, project.NewStore(noopGit{}), nil, 0)

	ch := make(chan []byte, 256)
	hub.Subscribe(c.ID, ch)
	t.Cleanup(func() { hub.Unsubscribe(c.ID, ch) })

	evCh := make(chan agent.StreamEvent, 4)
	evCh <- agent.StreamEvent{Type: agent.EventMessageStart, SessionID: "s"}
	evCh <- agent.StreamEvent{Type: agent.EventTextDelta, Text: "hello back"}
	close(evCh)

	done := make(chan struct{})
	go func() {
		h.StartEventBridge(c.ID, evCh)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("bridge hang")
	}

	msgs, err := svc.ListMessages(c.ID)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 assistant message, got %d", len(msgs))
	}
	if msgs[0].Role != "assistant" {
		t.Fatalf("expected role=assistant, got %q", msgs[0].Role)
	}
	if msgs[0].Content != "hello back" {
		t.Fatalf("expected content=%q, got %q", "hello back", msgs[0].Content)
	}
}

func TestEventBridge_SkipsEmptyAssistantTextDelta(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "bridge empty")
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc, project.NewStore(noopGit{}), nil, 0)

	ch := make(chan []byte, 256)
	hub.Subscribe(c.ID, ch)
	t.Cleanup(func() { hub.Unsubscribe(c.ID, ch) })

	evCh := make(chan agent.StreamEvent, 4)
	evCh <- agent.StreamEvent{Type: agent.EventMessageStart, SessionID: "s"}
	evCh <- agent.StreamEvent{Type: agent.EventTextDelta, Text: ""}
	close(evCh)

	done := make(chan struct{})
	go func() {
		h.StartEventBridge(c.ID, evCh)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("bridge hang")
	}

	msgs, err := svc.ListMessages(c.ID)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 persisted messages for empty text delta, got %d", len(msgs))
	}
}

// mcpSpyClaudeBin writes a shell script that:
//   - appends each invocation's argv to argvFile (one arg per line, blank
//     line between invocations) — same shape as spyClaudeBin
//   - if --mcp-config <path> appears in argv, copies that file's contents
//     to mcpCopyFile so the test can read the temp .mcp.json BEFORE the
//     handler's cleanup goroutine removes it.
func mcpSpyClaudeBin(t *testing.T, argvFile, mcpCopyFile string) string {
	t.Helper()
	script := fmt.Sprintf(`#!/bin/sh
{ printf '%%s\n' "$@"; printf -- '---\n'; } >> %q
seen=0
for a in "$@"; do
  if [ $seen = 1 ]; then
    cp "$a" %q 2>/dev/null || true
    seen=0
    continue
  fi
  if [ "$a" = "--mcp-config" ]; then
    seen=1
  fi
done
exit 0
`, argvFile, mcpCopyFile)
	path := filepath.Join(t.TempDir(), "spy-claude-mcp.sh")
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("mcpSpyClaudeBin write: %v", err)
	}
	return path
}

// TestHandler_MintsMcpSession_WhenConfigured asserts that when a Handler is
// constructed with a non-nil *mcp.Sessions and a non-zero mcpPort, dispatching
// a single message frame causes exactly one Mint, the spawned agent argv
// includes --mcp-config + --allowed-tools, the temp config file contains a
// URL pointing at the configured port with the minted token, and the token
// is revoked + the file removed once the turn completes.
func TestHandler_MintsMcpSession_WhenConfigured(t *testing.T) {
	tmp := t.TempDir()
	argvFile := filepath.Join(tmp, "argv.txt")
	mcpCopyFile := filepath.Join(tmp, "mcp-config-copy.json")

	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("proj-test", "mcp test")

	hub := wsinternal.NewHub()
	manager := agent.NewManager(mcpSpyClaudeBin(t, argvFile, mcpCopyFile))
	projStore := project.NewStore(noopGit{})
	sessions := mcp.NewSessions()
	const mcpPort = 18765
	h := wsinternal.NewHandler(hub, manager, svc, projStore, sessions, mcpPort)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	conn, ctx, cancel := dialWS(t, srv, c.ID)
	defer cancel()
	defer conn.CloseNow()

	msg, _ := json.Marshal(map[string]string{
		"type":    "message",
		"content": "hi",
	})
	if err := conn.Write(ctx, gowebsocket.MessageText, msg); err != nil {
		t.Fatalf("write: %v", err)
	}

	inv := waitForSpyArgv(t, argvFile, 2*time.Second)
	if len(inv) != 1 {
		t.Fatalf("expected exactly one spawn invocation, got %d: %v", len(inv), inv)
	}

	// Locate --mcp-config <path> and --allowed-tools mcp__agent_desk__*.
	var cfgPath string
	var allowedTools string
	for i, a := range inv[0] {
		if a == "--mcp-config" && i+1 < len(inv[0]) {
			cfgPath = inv[0][i+1]
		}
		if a == "--allowed-tools" && i+1 < len(inv[0]) {
			allowedTools = inv[0][i+1]
		}
	}
	if cfgPath == "" {
		t.Fatalf("expected --mcp-config <path> in argv; got %v", inv[0])
	}
	if allowedTools != "mcp__agent_desk__*" {
		t.Fatalf("expected --allowed-tools mcp__agent_desk__*, got %q (argv=%v)", allowedTools, inv[0])
	}

	// The spy bin copied the temp config to mcpCopyFile *before* exiting, so
	// even though the cleanup goroutine has likely already removed the
	// original by now, we still have its bytes for inspection.
	raw, err := os.ReadFile(mcpCopyFile)
	if err != nil {
		t.Fatalf("read mcp config copy: %v (cfgPath=%s)", err, cfgPath)
	}

	var parsed struct {
		McpServers map[string]struct {
			Type string `json:"type"`
			URL  string `json:"url"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("unmarshal mcp config: %v — raw=%s", err, raw)
	}
	srvCfg, ok := parsed.McpServers["agent_desk"]
	if !ok {
		t.Fatalf("expected mcpServers.agent_desk entry; got %+v", parsed)
	}
	if srvCfg.Type != "http" {
		t.Fatalf("expected type=http, got %q", srvCfg.Type)
	}
	wantPrefix := fmt.Sprintf("http://127.0.0.1:%d/mcp?token=", mcpPort)
	if !strings.HasPrefix(srvCfg.URL, wantPrefix) {
		t.Fatalf("expected URL prefix %q, got %q", wantPrefix, srvCfg.URL)
	}
	token := strings.TrimPrefix(srvCfg.URL, wantPrefix)
	if token == "" {
		t.Fatal("expected non-empty token in mcp config URL")
	}

	// Eventually the cleanup goroutine revokes the token and removes the
	// temp file. Poll briefly to avoid flake.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, exists := sessions.Resolve(token); exists {
			time.Sleep(20 * time.Millisecond)
			continue
		}
		break
	}
	if cardID, exists := sessions.Resolve(token); exists {
		t.Fatalf("expected token to be revoked after turn; still resolves to %q", cardID)
	}
	if _, statErr := os.Stat(cfgPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected temp mcp config %s removed after turn; stat err=%v", cfgPath, statErr)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_Returns404ForUnknownCard(t *testing.T) {
	srv, _, _ := buildServer(t)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/nonexistent/ws"

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, resp, err := gowebsocket.Dial(ctx, wsURL, nil)
	// nhooyr.io/websocket returns an error when the server rejects the upgrade.
	if err == nil {
		t.Fatal("expected dial to fail for unknown card")
	}
	if resp != nil && resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}
