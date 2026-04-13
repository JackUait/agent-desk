package agent_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

// The fixtures below are captured verbatim from
//   claude -p --verbose --output-format stream-json "say hi in 3 words"
// so the parser is tested against the real Claude CLI wire format.

func TestParseStreamEvent_SystemInit_EmitsMessageStartWithSessionID(t *testing.T) {
	// First line Claude CLI prints is an init system event carrying the
	// session_id we must capture so subsequent --resume calls work.
	line := `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"3dfd476f-099e-47dc-8898-d02a7976a4f3","model":"claude-opus-4-6"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStart {
		t.Errorf("expected EventMessageStart for system:init, got %q", ev.Type)
	}
	if ev.SessionID != "3dfd476f-099e-47dc-8898-d02a7976a4f3" {
		t.Errorf("expected session id captured, got %q", ev.SessionID)
	}
}

func TestParseStreamEvent_AssistantText_EmitsTextDelta(t *testing.T) {
	// A type:assistant line carries a message.content array. For plain
	// text responses each content item is {type:text, text:"..."}.
	line := `{"type":"assistant","message":{"model":"claude-opus-4-6","id":"msg_01","type":"message","role":"assistant","content":[{"type":"text","text":"Hi there friend"}]},"session_id":"3dfd476f-099e-47dc-8898-d02a7976a4f3"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventTextDelta {
		t.Errorf("expected EventTextDelta, got %q", ev.Type)
	}
	if ev.Text != "Hi there friend" {
		t.Errorf("expected text %q, got %q", "Hi there friend", ev.Text)
	}
	if ev.SessionID != "3dfd476f-099e-47dc-8898-d02a7976a4f3" {
		t.Errorf("expected session id, got %q", ev.SessionID)
	}
}

func TestParseStreamEvent_AssistantToolUse_EmitsToolUseStart(t *testing.T) {
	// When the model calls a tool, the assistant content item is
	// {type:tool_use, id, name, input}. We surface it as EventToolUseStart.
	line := `{"type":"assistant","message":{"id":"msg_01","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}]},"session_id":"sess-tool"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolUseStart {
		t.Errorf("expected EventToolUseStart, got %q", ev.Type)
	}
	if ev.ToolName != "Bash" {
		t.Errorf("expected tool name Bash, got %q", ev.ToolName)
	}
	if ev.ToolID != "toolu_1" {
		t.Errorf("expected tool id toolu_1, got %q", ev.ToolID)
	}
}

func TestParseStreamEvent_Result_EmitsMessageStop(t *testing.T) {
	// The final type:result line terminates a turn. Handler expects
	// EventMessageStop to flush the accumulated assistant buffer.
	line := `{"type":"result","subtype":"success","is_error":false,"result":"Hi there friend","session_id":"3dfd476f-099e-47dc-8898-d02a7976a4f3","duration_ms":1846}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStop {
		t.Errorf("expected EventMessageStop, got %q", ev.Type)
	}
	if ev.SessionID != "3dfd476f-099e-47dc-8898-d02a7976a4f3" {
		t.Errorf("expected session id, got %q", ev.SessionID)
	}
	if ev.Text != "Hi there friend" {
		t.Errorf("expected full result text, got %q", ev.Text)
	}
}

func TestParseStreamEvent_UserToolResult_Unknown(t *testing.T) {
	// type:user events carry tool results back into the conversation.
	// They are not rendered in the chat, so we treat them as unknown.
	line := `{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file1\nfile2"}]},"session_id":"sess-tool"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown for user/tool_result, got %q", ev.Type)
	}
}

func TestParseStreamEvent_AssistantMultipleTextBlocks_UsesFirstText(t *testing.T) {
	// An assistant message may contain multiple blocks. We use the
	// concatenated text so the full turn is visible in the chat.
	line := `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world"}]},"session_id":"sess-1"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventTextDelta {
		t.Fatalf("expected EventTextDelta, got %q", ev.Type)
	}
	if ev.Text != "Hello world" {
		t.Errorf("expected concatenated text %q, got %q", "Hello world", ev.Text)
	}
}

func TestParseStreamEvent_InvalidJSON(t *testing.T) {
	_, err := agent.ParseStreamEvent("not json {{{")
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestParseStreamEvent_RawIsPopulated(t *testing.T) {
	line := `{"type":"result","subtype":"success","result":"ok","session_id":"s"}`
	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ev.Raw) == 0 {
		t.Error("expected Raw to be populated")
	}
}
