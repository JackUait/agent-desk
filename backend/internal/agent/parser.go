package agent

import "encoding/json"

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

// rawLine is the top-level envelope from Claude CLI stream-json output.
type rawLine struct {
	Type      string          `json:"type"`
	SessionID string          `json:"session_id"`
	Event     json.RawMessage `json:"event"`
	Result    string          `json:"result"`
}

type rawEvent struct {
	Type         string          `json:"type"`
	Delta        json.RawMessage `json:"delta"`
	ContentBlock json.RawMessage `json:"content_block"`
}

type rawDelta struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type rawContentBlock struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ParseStreamEvent parses a single line from Claude CLI stream-json output.
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

	if envelope.Type == "result" {
		ev.Type = EventResult
		ev.Text = envelope.Result
		return ev, nil
	}

	var event rawEvent
	if err := json.Unmarshal(envelope.Event, &event); err != nil {
		ev.Type = EventUnknown
		return ev, nil
	}

	switch event.Type {
	case "message_start":
		ev.Type = EventMessageStart

	case "message_stop":
		ev.Type = EventMessageStop

	case "content_block_start":
		var cb rawContentBlock
		if err := json.Unmarshal(event.ContentBlock, &cb); err == nil && cb.Type == "tool_use" {
			ev.Type = EventToolUseStart
			ev.ToolName = cb.Name
			ev.ToolID = cb.ID
		} else {
			ev.Type = EventUnknown
		}

	case "content_block_stop":
		ev.Type = EventToolUseEnd

	case "content_block_delta":
		var delta rawDelta
		if err := json.Unmarshal(event.Delta, &delta); err == nil && delta.Type == "text_delta" {
			ev.Type = EventTextDelta
			ev.Text = delta.Text
		} else {
			ev.Type = EventUnknown
		}

	default:
		ev.Type = EventUnknown
	}

	return ev, nil
}
