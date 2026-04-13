package agent

import (
	"encoding/json"
	"strings"
)

type EventType string

const (
	EventTextDelta    EventType = "text_delta"
	EventMessageStart EventType = "message_start"
	EventMessageStop  EventType = "message_stop"
	EventToolUseStart EventType = "tool_use_start"
	EventToolUseEnd   EventType = "tool_use_end"
	EventResult       EventType = "result"
	EventUnknown      EventType = "unknown"
)

type StreamEvent struct {
	Type      EventType
	SessionID string
	Text      string
	ToolName  string
	ToolID    string
	Raw       json.RawMessage
}

// rawLine is the top-level envelope emitted by
//
//	claude -p --output-format stream-json
//
// See docs.anthropic.com — Claude Code non-interactive mode.
type rawLine struct {
	Type      string          `json:"type"`
	Subtype   string          `json:"subtype"`
	SessionID string          `json:"session_id"`
	Message   json.RawMessage `json:"message"`
	Result    string          `json:"result"`
}

type rawAssistantMessage struct {
	Content []rawContentBlock `json:"content"`
}

type rawContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
	ID   string `json:"id"`
	Name string `json:"name"`
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

	case "result":
		// The terminal result line flushes the accumulated assistant
		// message. We carry the full result text as a safety net for
		// callers that want the complete answer in one shot.
		ev.Type = EventMessageStop
		ev.Text = envelope.Result
		return ev, nil

	default:
		// type:user (tool results) and anything else we do not render.
		ev.Type = EventUnknown
		return ev, nil
	}
}
