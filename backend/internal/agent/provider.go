package agent

import "context"

type Message struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type Provider interface {
	SendMessage(ctx context.Context, conversationID string, content string) (Message, error)
	StreamResponse(ctx context.Context, conversationID string, content string) (<-chan string, error)
}
