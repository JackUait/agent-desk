package conversation

import "context"

type Conversation struct {
	ID       string    `json:"id"`
	CardID   string    `json:"cardId"`
	Messages []Message `json:"messages"`
}

type Message struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type Repository interface {
	Get(ctx context.Context, id string) (Conversation, error)
	List(ctx context.Context) ([]Conversation, error)
	Create(ctx context.Context, conv Conversation) (Conversation, error)
	AddMessage(ctx context.Context, conversationID string, msg Message) (Message, error)
}
