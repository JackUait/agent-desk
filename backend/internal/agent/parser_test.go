package agent_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

func TestParseStreamEvent_TextDelta(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventTextDelta {
		t.Errorf("expected EventTextDelta, got %q", ev.Type)
	}
	if ev.SessionID != "sess-123" {
		t.Errorf("expected session_id sess-123, got %q", ev.SessionID)
	}
	if ev.Text != "Hello " {
		t.Errorf("expected text %q, got %q", "Hello ", ev.Text)
	}
}

func TestParseStreamEvent_MessageStart(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-abc","event":{"type":"message_start","message":{"id":"msg-1","type":"message"}}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStart {
		t.Errorf("expected EventMessageStart, got %q", ev.Type)
	}
	if ev.SessionID != "sess-abc" {
		t.Errorf("expected session_id sess-abc, got %q", ev.SessionID)
	}
}

func TestParseStreamEvent_MessageStop(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-xyz","event":{"type":"message_stop"}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStop {
		t.Errorf("expected EventMessageStop, got %q", ev.Type)
	}
}

func TestParseStreamEvent_ToolUseStart(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-tool","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-1","name":"bash"}}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolUseStart {
		t.Errorf("expected EventToolUseStart, got %q", ev.Type)
	}
	if ev.ToolName != "bash" {
		t.Errorf("expected tool name %q, got %q", "bash", ev.ToolName)
	}
	if ev.ToolID != "tool-1" {
		t.Errorf("expected tool id %q, got %q", "tool-1", ev.ToolID)
	}
}

func TestParseStreamEvent_ToolUseEnd(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-tool","event":{"type":"content_block_stop"}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolUseEnd {
		t.Errorf("expected EventToolUseEnd, got %q", ev.Type)
	}
}

func TestParseStreamEvent_Result(t *testing.T) {
	line := `{"type":"result","session_id":"sess-res","result":"Task complete","is_error":false}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventResult {
		t.Errorf("expected EventResult, got %q", ev.Type)
	}
	if ev.Text != "Task complete" {
		t.Errorf("expected text %q, got %q", "Task complete", ev.Text)
	}
}

func TestParseStreamEvent_Unknown(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-unk","event":{"type":"something_else"}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown, got %q", ev.Type)
	}
}

func TestParseStreamEvent_NonTextDelta(t *testing.T) {
	// content_block_delta but NOT text_delta — should be unknown
	line := `{"type":"stream_event","session_id":"sess-inp","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{"}}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown for non-text delta, got %q", ev.Type)
	}
}

func TestParseStreamEvent_InvalidJSON(t *testing.T) {
	_, err := agent.ParseStreamEvent("not json {{{")
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestParseStreamEvent_RawIsPopulated(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"message_stop"}}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ev.Raw) == 0 {
		t.Error("expected Raw to be populated")
	}
}
