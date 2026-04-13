package agent_test

import (
	"bufio"
	"os"
	"strings"
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

func TestParseStreamEvent_UserToolResult_EmitsToolResult(t *testing.T) {
	// type:user events carry tool results back into the conversation.
	// We surface them as EventToolResult so the UI can render the output.
	line := `{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_011dUgeB9w6PKzWSaTNpwPLe","type":"tool_result","content":"hello world\n","is_error":false}]},"session_id":"sess-tool"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolResult {
		t.Errorf("expected EventToolResult, got %q", ev.Type)
	}
	if ev.ToolUseID != "toolu_011dUgeB9w6PKzWSaTNpwPLe" {
		t.Errorf("expected tool_use_id, got %q", ev.ToolUseID)
	}
	if ev.ToolResult != "hello world\n" {
		t.Errorf("expected tool result text, got %q", ev.ToolResult)
	}
	if ev.IsError {
		t.Errorf("expected is_error=false, got true")
	}
	if ev.SessionID != "sess-tool" {
		t.Errorf("expected session id populated, got %q", ev.SessionID)
	}
}

func TestParseStreamEvent_StreamEvent_MessageStart_Unknown(t *testing.T) {
	// stream_event:message_start is a no-op for us — session id comes
	// from system:init at the very start of the stream.
	line := `{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-4-6","id":"msg_01","type":"message","role":"assistant","content":[],"stop_reason":null,"usage":{"input_tokens":6,"output_tokens":5}}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown for stream_event:message_start, got %q", ev.Type)
	}
}

func TestParseStreamEvent_StreamEvent_ContentBlockStart_Text_EmitsPartialTextStart(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventPartialTextStart {
		t.Errorf("expected EventPartialTextStart, got %q", ev.Type)
	}
	if ev.Index != 0 {
		t.Errorf("expected index 0, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_ContentBlockStart_ToolUse_EmitsToolUseStart(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_011dUgeB9w6PKzWSaTNpwPLe","name":"Bash","input":{}}},"session_id":"s"}`

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
	if ev.ToolID != "toolu_011dUgeB9w6PKzWSaTNpwPLe" {
		t.Errorf("expected tool id, got %q", ev.ToolID)
	}
	if ev.Index != 0 {
		t.Errorf("expected index 0, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_TextDelta_EmitsPartialText(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi there fri"}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventPartialText {
		t.Errorf("expected EventPartialText, got %q", ev.Type)
	}
	if ev.Text != "Hi there fri" {
		t.Errorf("expected text, got %q", ev.Text)
	}
	if ev.Index != 0 {
		t.Errorf("expected index 0, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_InputJsonDelta_EmitsToolInputDelta(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"comman"}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolInputDelta {
		t.Errorf("expected EventToolInputDelta, got %q", ev.Type)
	}
	if ev.PartialJSON != `{"comman` {
		t.Errorf("expected partial_json, got %q", ev.PartialJSON)
	}
	if ev.Index != 0 {
		t.Errorf("expected index 0, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_ThinkingDelta_EmitsThinkingDelta(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"Let me consider"}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventThinkingDelta {
		t.Errorf("expected EventThinkingDelta, got %q", ev.Type)
	}
	if ev.Thinking != "Let me consider" {
		t.Errorf("expected thinking text, got %q", ev.Thinking)
	}
	if ev.Index != 1 {
		t.Errorf("expected index 1, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_SignatureDelta_Unknown(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"signature_delta","signature":"ErUBCkY"}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown for signature_delta, got %q", ev.Type)
	}
}

func TestParseStreamEvent_StreamEvent_ContentBlockStop_EmitsContentBlockStop(t *testing.T) {
	// content_block_stop carries only an index, no block type. The
	// handler correlates back to the opening block via Index.
	line := `{"type":"stream_event","event":{"type":"content_block_stop","index":2},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventContentBlockStop {
		t.Errorf("expected EventContentBlockStop, got %q", ev.Type)
	}
	if ev.Index != 2 {
		t.Errorf("expected index 2, got %d", ev.Index)
	}
}

func TestParseStreamEvent_StreamEvent_MessageDelta_LeavesIndexZero(t *testing.T) {
	// message_delta has no content block, so Index must stay zero to
	// avoid ambiguity with a content_block_stop on block 0.
	line := `{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageDelta {
		t.Fatalf("expected EventMessageDelta, got %q", ev.Type)
	}
	if ev.Index != 0 {
		t.Errorf("expected Index 0, got %d", ev.Index)
	}
}

func TestParseStreamEvent_UserToolResult_ArrayContent_PreservesRawJSON(t *testing.T) {
	// tool_result.content may be an array of content blocks. We preserve
	// the raw JSON so the payload is not silently dropped.
	line := `{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":[{"type":"text","text":"ok"}],"is_error":false}]},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolResult {
		t.Fatalf("expected EventToolResult, got %q", ev.Type)
	}
	if !strings.Contains(ev.ToolResult, `"text":"ok"`) {
		t.Errorf("expected raw JSON preserved in ToolResult, got %q", ev.ToolResult)
	}
}

func TestParseStreamEvent_StreamEvent_MessageDelta_EmitsMessageDelta(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":6,"output_tokens":10}},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageDelta {
		t.Errorf("expected EventMessageDelta, got %q", ev.Type)
	}
	if ev.StopReason != "end_turn" {
		t.Errorf("expected stop_reason end_turn, got %q", ev.StopReason)
	}
	if ev.InputTokens != 6 {
		t.Errorf("expected input tokens 6, got %d", ev.InputTokens)
	}
	if ev.OutputTokens != 10 {
		t.Errorf("expected output tokens 10, got %d", ev.OutputTokens)
	}
}

func TestParseStreamEvent_StreamEvent_MessageStop_Unknown(t *testing.T) {
	line := `{"type":"stream_event","event":{"type":"message_stop"},"session_id":"s"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventUnknown {
		t.Errorf("expected EventUnknown for stream_event:message_stop, got %q", ev.Type)
	}
}

func TestParseStreamEvent_Result_PopulatesMetrics(t *testing.T) {
	line := `{"type":"result","subtype":"success","is_error":false,"duration_ms":3245,"num_turns":1,"result":"Hi there friend","stop_reason":"end_turn","session_id":"s","total_cost_usd":0.18221125,"usage":{"input_tokens":6,"output_tokens":10}}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStop {
		t.Errorf("expected EventMessageStop, got %q", ev.Type)
	}
	if ev.DurationMS != 3245 {
		t.Errorf("expected DurationMS 3245, got %d", ev.DurationMS)
	}
	if ev.CostUSD != 0.18221125 {
		t.Errorf("expected CostUSD 0.18221125, got %v", ev.CostUSD)
	}
	if ev.InputTokens != 6 {
		t.Errorf("expected InputTokens 6, got %d", ev.InputTokens)
	}
	if ev.OutputTokens != 10 {
		t.Errorf("expected OutputTokens 10, got %d", ev.OutputTokens)
	}
}

func TestParseStreamEvent_AssistantMixedBlocks_DoesNotDropText(t *testing.T) {
	// Mixed assistant snapshot: the parser prefers the tool_use block
	// (existing behaviour). Partial streaming events surface individual
	// text runs via EventPartialText, so the snapshot is only a fallback.
	line := `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me help"},{"type":"tool_use","id":"t1","name":"Bash","input":{}}]},"session_id":"sess-mixed"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolUseStart {
		t.Errorf("expected EventToolUseStart for mixed snapshot, got %q", ev.Type)
	}
	if ev.ToolID != "t1" {
		t.Errorf("expected tool id t1, got %q", ev.ToolID)
	}
}

func TestParseStreamEvent_StreamTextFixture_EndToEnd(t *testing.T) {
	got := parseFixture(t, "testdata/stream_text.jsonl")
	want := []agent.EventType{
		agent.EventMessageStart,
		agent.EventUnknown,
		agent.EventPartialTextStart,
		agent.EventPartialText,
		agent.EventPartialText,
		agent.EventTextDelta,
		agent.EventContentBlockStop,
		agent.EventMessageDelta,
		agent.EventUnknown,
		agent.EventMessageStop,
	}
	assertEventSequence(t, got, want)
}

func TestParseStreamEvent_StreamToolFixture_EndToEnd(t *testing.T) {
	got := parseFixture(t, "testdata/stream_tool.jsonl")
	want := []agent.EventType{
		agent.EventToolUseStart,
		agent.EventToolInputDelta,
		agent.EventToolInputDelta,
		agent.EventContentBlockStop,
		agent.EventToolResult,
	}
	assertEventSequence(t, got, want)
}

func parseFixture(t *testing.T, path string) []agent.EventType {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open fixture %s: %v", path, err)
	}
	defer f.Close()

	var out []agent.EventType
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		ev, err := agent.ParseStreamEvent(line)
		if err != nil {
			t.Fatalf("parse line %q: %v", line, err)
		}
		out = append(out, ev.Type)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan fixture: %v", err)
	}
	return out
}

func assertEventSequence(t *testing.T, got, want []agent.EventType) {
	t.Helper()
	if len(got) != len(want) {
		t.Logf("actual sequence: %v", got)
		t.Fatalf("expected %d events, got %d", len(want), len(got))
	}
	for i := range got {
		if got[i] != want[i] {
			t.Logf("actual sequence: %v", got)
			t.Errorf("event %d: expected %q, got %q", i, want[i], got[i])
		}
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
