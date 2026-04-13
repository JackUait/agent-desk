package websocket_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	wsinternal "github.com/jackuait/agent-desk/backend/internal/websocket"
	gowebsocket "nhooyr.io/websocket"
)

// buildServer wires up a test HTTP server with the WebSocket handler.
func buildServer(t *testing.T) (srv *httptest.Server, cardID string, hub *wsinternal.Hub) {
	t.Helper()

	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("test card")

	hub = wsinternal.NewHub()
	// Use "false" as the agent binary — it exits immediately so tests don't hang.
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc)

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
	c := svc.CreateCard("bridge test")
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc)

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

func TestEventBridge_LegacyTokenAndMessageStillEmit(t *testing.T) {
	cardID, frames := collectBridgeFrames(t, []agent.StreamEvent{
		{Type: agent.EventMessageStart, SessionID: "s"},
		{Type: agent.EventTextDelta, Text: "Hello"},
		{Type: agent.EventMessageStop, Text: "Hello"},
	})
	_ = cardID
	got := frameTypes(frames)
	want := []string{"turn_start", "token", "message", "turn_end"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch\nwant: %v\n got: %v", want, got)
	}
	if frames[1]["content"] != "Hello" {
		t.Fatalf("expected token content Hello, got %v", frames[1]["content"])
	}
	if frames[2]["role"] != "assistant" || frames[2]["content"] != "Hello" {
		t.Fatalf("message frame malformed: %+v", frames[2])
	}
	if id, ok := frames[2]["id"].(string); !ok || !strings.HasPrefix(id, "msg-") {
		t.Fatalf("expected id to start with msg-, got %v", frames[2]["id"])
	}
	if ts, ok := frames[2]["timestamp"].(float64); !ok || ts <= 0 {
		t.Fatalf("expected positive timestamp, got %v", frames[2]["timestamp"])
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
	want := []string{"turn_start", "message", "turn_end"}
	if !equalStrings(got, want) {
		t.Fatalf("frame type sequence mismatch (no message_delta frame expected)\nwant: %v\n got: %v", want, got)
	}
	te := frames[2]
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
	c := svc.CreateCard("review test")
	// Move through statuses so MoveToReview is legal.
	if _, err := svc.StartDevelopment(c.ID); err != nil {
		t.Fatalf("StartDevelopment: %v", err)
	}
	hub := wsinternal.NewHub()
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc)

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
