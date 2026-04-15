package agent

import (
	"encoding/json"
	"strings"
)

type EventType string

const (
	EventTextDelta         EventType = "text_delta"
	EventMessageStart      EventType = "message_start"
	EventMessageStop       EventType = "message_stop"
	EventToolUseStart      EventType = "tool_use_start"
	EventToolUseEnd        EventType = "tool_use_end"
	EventResult            EventType = "result"
	EventUnknown           EventType = "unknown"
	EventThinkingStart     EventType = "thinking_start"
	EventThinkingDelta     EventType = "thinking_delta"
	EventPartialText       EventType = "partial_text"
	EventPartialTextStart  EventType = "partial_text_start"
	EventToolInputDelta    EventType = "tool_input_delta"
	EventToolResult        EventType = "tool_result"
	EventMessageDelta      EventType = "message_delta"
	EventContentBlockStop  EventType = "content_block_stop"
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
	InputTokens         int
	OutputTokens        int
	CacheReadTokens     int
	CacheCreationTokens int
}

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
	InputTokens              int `json:"input_tokens"`
	OutputTokens             int `json:"output_tokens"`
	CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
}

// totalInput folds cache_read + cache_creation into input_tokens so
// prompt-cached context still counts toward the per-turn context size.
// Without cache folding the visible "input_tokens" reflects only the
// fresh portion of the prompt and drastically underreports real usage.
func (u *rawUsage) totalInput() int {
	if u == nil {
		return 0
	}
	return u.InputTokens + u.CacheReadInputTokens + u.CacheCreationInputTokens
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

		// Snapshot is a fallback: individual blocks are surfaced via
		// stream_event partials. When mixed, prefer tool_use so tool
		// calls render even if partial events were disabled.
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
		ev.Type = EventMessageStop
		ev.Text = envelope.Result
		ev.DurationMS = envelope.DurationMS
		ev.CostUSD = envelope.CostUSD
		if envelope.Usage != nil {
			ev.InputTokens = envelope.Usage.totalInput()
			ev.OutputTokens = envelope.Usage.OutputTokens
			ev.CacheReadTokens = envelope.Usage.CacheReadInputTokens
			ev.CacheCreationTokens = envelope.Usage.CacheCreationInputTokens
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

	// Index is only meaningful on content_block_* events; leave it zero
	// on message_* events so the handler cannot accidentally correlate
	// a turn-level event to block 0.
	switch inner.Type {
	case "content_block_start":
		ev.Index = inner.Index
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
		ev.Index = inner.Index
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
		// signature_delta and anything else drop silently; a thinking
		// block's signature must never leak downstream.
		ev.Type = EventUnknown
		return ev, nil

	case "content_block_stop":
		ev.Index = inner.Index
		ev.Type = EventContentBlockStop
		return ev, nil

	case "message_delta":
		ev.Type = EventMessageDelta
		if inner.Delta != nil {
			ev.StopReason = inner.Delta.StopReason
		}
		if inner.Usage != nil {
			ev.InputTokens = inner.Usage.totalInput()
			ev.OutputTokens = inner.Usage.OutputTokens
			ev.CacheReadTokens = inner.Usage.CacheReadInputTokens
			ev.CacheCreationTokens = inner.Usage.CacheCreationInputTokens
		}
		return ev, nil

	case "message_start", "message_stop":
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
	// ParseStreamEvent returns one event per line, so a user envelope
	// with multiple tool_result blocks (parallel tool calls) exposes
	// only the first here. ev.Raw preserves the full payload.
	for _, block := range msg.Content {
		if block.Type != "tool_result" {
			continue
		}
		ev.Type = EventToolResult
		ev.ToolUseID = block.ToolUseID
		ev.IsError = block.IsError
		if len(block.Content) > 0 {
			var s string
			if err := json.Unmarshal(block.Content, &s); err == nil {
				ev.ToolResult = s
			} else {
				// Content-block array form: preserve verbatim JSON
				// instead of dropping the payload.
				ev.ToolResult = string(block.Content)
			}
		}
		return ev, nil
	}
	ev.Type = EventUnknown
	return ev, nil
}
