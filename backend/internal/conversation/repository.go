package conversation

import (
	"context"

	"github.com/jackuait/agent-desk/backend/internal/domain"
)

type Conversation struct {
	ID       string           `json:"id"`
	CardID   string           `json:"cardId"`
	Messages []domain.Message `json:"messages"`
}

type Repository interface {
	Get(ctx context.Context, id string) (Conversation, error)
	List(ctx context.Context) ([]Conversation, error)
	Create(ctx context.Context, conv Conversation) (Conversation, error)
	AddMessage(ctx context.Context, conversationID string, msg domain.Message) (domain.Message, error)
}
