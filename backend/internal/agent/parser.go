package agent

import (
	"encoding/json"
	"strings"
)

type EventType string

const (
	EventTextDelta        EventType = "text_delta"
	EventMessageStart     EventType = "message_start"
	EventMessageStop      EventType = "message_stop"
	EventToolUseStart     EventType = "tool_use_start"
	EventToolUseEnd       EventType = "tool_use_end"
	EventResult           EventType = "result"
	EventUnknown          EventType = "unknown"
	EventThinkingStart    EventType = "thinking_start"
	EventThinkingDelta    EventType = "thinking_delta"
	EventPartialText      EventType = "partial_text"
	EventPartialTextStart EventType = "partial_text_start"
	EventToolInputDelta   EventType = "tool_input_delta"
	EventToolResult       EventType = "tool_result"
	EventMessageDelta     EventType = "message_delta"
)

type StreamEvent struct {
	Type      EventType
	SessionID string
	Text      string
	ToolName  string
	ToolID    string
	Raw       json.RawMessage

	// Partial streaming + tool result + result metadata.
	Index        int
	PartialJSON  string
	Thinking     string
	ToolUseID    string
	ToolResult   string
	IsError      bool
	StopReason   string
	DurationMS   int
	CostUSD      float64
	InputTokens  int
	OutputTokens int
}

// rawLine is the top-level envelope emitted by
//
//	claude -p --output-format stream-json [--include-partial-messages]
//
// See docs.anthropic.com — Claude Code non-interactive mode.
type rawLine struct {
	Type      string          `json:"type"`
	Subtype   string          `json:"subtype"`
	SessionID string          `json:"session_id"`
	Message   json.RawMessage `json:"message"`
	Event     json.RawMessage `json:"event"`
	Result    string          `json:"result"`

	// result line metrics
	DurationMS int       `json:"duration_ms"`
	CostUSD    float64   `json:"total_cost_usd"`
	Usage      *rawUsage `json:"usage"`
}

type rawUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type rawAssistantMessage struct {
	Content []rawContentBlock `json:"content"`
}

type rawUserMessage struct {
	Content []rawUserContentBlock `json:"content"`
}

type rawContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
	ID   string `json:"id"`
	Name string `json:"name"`
}

type rawUserContentBlock struct {
	Type      string          `json:"type"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
	IsError   bool            `json:"is_error"`
}

// rawStreamEvent is the inner Anthropic Messages API event wrapped by a
// type:"stream_event" envelope when Claude CLI is invoked with
// --include-partial-messages.
type rawStreamEvent struct {
	Type         string             `json:"type"`
	Index        int                `json:"index"`
	ContentBlock *rawSEContentBlock `json:"content_block"`
	Delta        *rawSEDelta        `json:"delta"`
	Usage        *rawUsage          `json:"usage"`
}

type rawSEContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
	ID   string `json:"id"`
	Name string `json:"name"`
}

type rawSEDelta struct {
	Type        string `json:"type"`
	Text        string `json:"text"`
	PartialJSON string `json:"partial_json"`
	Thinking    string `json:"thinking"`
	StopReason  string `json:"stop_reason"`
}

// ParseStreamEvent parses a single line from Claude CLI stream-json output
// and maps it onto the internal StreamEvent model consumed by the
// websocket handler.
func ParseStreamEvent(line string) (StreamEvent, error) {
	raw := json.RawMessage(line)

	var envelope rawLine
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return StreamEvent{}, err
	}

	ev := StreamEvent{
		SessionID: envelope.SessionID,
		Raw:       raw,
	}

	switch envelope.Type {
	case "system":
		// system/init carries the session_id for a new conversation.
		// We surface it as message_start so the websocket handler can
		// persist the session id and reset its assistant buffer.
		if envelope.Subtype == "init" {
			ev.Type = EventMessageStart
			return ev, nil
		}
		ev.Type = EventUnknown
		return ev, nil

	case "assistant":
		var msg rawAssistantMessage
		if err := json.Unmarshal(envelope.Message, &msg); err != nil || len(msg.Content) == 0 {
			ev.Type = EventUnknown
			return ev, nil
		}

		// Prefer tool_use blocks over text when both are present so the
		// UI can render tool calls instead of silently swallowing them.
		// Individual text runs are surfaced via stream_event partials.
		for _, block := range msg.Content {
			if block.Type == "tool_use" {
				ev.Type = EventToolUseStart
				ev.ToolName = block.Name
				ev.ToolID = block.ID
				return ev, nil
			}
		}

		var sb strings.Builder
		for _, block := range msg.Content {
			if block.Type == "text" {
				sb.WriteString(block.Text)
			}
		}
		if sb.Len() == 0 {
			ev.Type = EventUnknown
			return ev, nil
		}
		ev.Type = EventTextDelta
		ev.Text = sb.String()
		return ev, nil

	case "stream_event":
		return parseStreamEventInner(ev, envelope.Event)

	case "user":
		return parseUserToolResult(ev, envelope.Message)

	case "result":
		// The terminal result line flushes the accumulated assistant
		// message. We carry the full result text as a safety net for
		// callers that want the complete answer in one shot.
		ev.Type = EventMessageStop
		ev.Text = envelope.Result
		ev.DurationMS = envelope.DurationMS
		ev.CostUSD = envelope.CostUSD
		if envelope.Usage != nil {
			ev.InputTokens = envelope.Usage.InputTokens
			ev.OutputTokens = envelope.Usage.OutputTokens
		}
		return ev, nil

	default:
		ev.Type = EventUnknown
		return ev, nil
	}
}

func parseStreamEventInner(ev StreamEvent, raw json.RawMessage) (StreamEvent, error) {
	if len(raw) == 0 {
		ev.Type = EventUnknown
		return ev, nil
	}
	var inner rawStreamEvent
	if err := json.Unmarshal(raw, &inner); err != nil {
		ev.Type = EventUnknown
		return ev, nil
	}

	ev.Index = inner.Index

	switch inner.Type {
	case "content_block_start":
		if inner.ContentBlock == nil {
			ev.Type = EventUnknown
			return ev, nil
		}
		switch inner.ContentBlock.Type {
		case "text":
			ev.Type = EventPartialTextStart
			return ev, nil
		case "tool_use":
			ev.Type = EventToolUseStart
			ev.ToolName = inner.ContentBlock.Name
			ev.ToolID = inner.ContentBlock.ID
			return ev, nil
		case "thinking":
			ev.Type = EventThinkingStart
			return ev, nil
		}
		ev.Type = EventUnknown
		return ev, nil

	case "content_block_delta":
		if inner.Delta == nil {
			ev.Type = EventUnknown
			return ev, nil
		}
		switch inner.Delta.Type {
		case "text_delta":
			ev.Type = EventPartialText
			ev.Text = inner.Delta.Text
			return ev, nil
		case "input_json_delta":
			ev.Type = EventToolInputDelta
			ev.PartialJSON = inner.Delta.PartialJSON
			return ev, nil
		case "thinking_delta":
			ev.Type = EventThinkingDelta
			ev.Thinking = inner.Delta.Thinking
			return ev, nil
		}
		// signature_delta and anything else
		ev.Type = EventUnknown
		return ev, nil

	case "content_block_stop":
		// Parser cannot know whether this closed a text or tool block
		// without stateful correlation. Handler does that via Index.
		ev.Type = EventUnknown
		return ev, nil

	case "message_delta":
		ev.Type = EventMessageDelta
		if inner.Delta != nil {
			ev.StopReason = inner.Delta.StopReason
		}
		if inner.Usage != nil {
			ev.InputTokens = inner.Usage.InputTokens
			ev.OutputTokens = inner.Usage.OutputTokens
		}
		return ev, nil

	case "message_start", "message_stop":
		// No-op: session id already captured at system:init, and the
		// envelope result line terminates the turn.
		ev.Type = EventUnknown
		return ev, nil
	}

	ev.Type = EventUnknown
	return ev, nil
}

func parseUserToolResult(ev StreamEvent, raw json.RawMessage) (StreamEvent, error) {
	if len(raw) == 0 {
		ev.Type = EventUnknown
		return ev, nil
	}
	var msg rawUserMessage
	if err := json.Unmarshal(raw, &msg); err != nil || len(msg.Content) == 0 {
		ev.Type = EventUnknown
		return ev, nil
	}
	for _, block := range msg.Content {
		if block.Type != "tool_result" {
			continue
		}
		ev.Type = EventToolResult
		ev.ToolUseID = block.ToolUseID
		ev.IsError = block.IsError
		// content may be a plain string or a content-block array. We
		// only capture the string form; the raw envelope is still in
		// ev.Raw for callers that need the full payload.
		if len(block.Content) > 0 {
			var s string
			if err := json.Unmarshal(block.Content, &s); err == nil {
				ev.ToolResult = s
			}
		}
		return ev, nil
	}
	ev.Type = EventUnknown
	return ev, nil
}
