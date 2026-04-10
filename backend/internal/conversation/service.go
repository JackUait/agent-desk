package conversation

import "context"

type Service interface {
	GetConversation(ctx context.Context, id string) (Conversation, error)
	ListConversations(ctx context.Context) ([]Conversation, error)
	CreateConversation(ctx context.Context, cardID string) (Conversation, error)
	SendMessage(ctx context.Context, conversationID, content string) (Message, error)
}
