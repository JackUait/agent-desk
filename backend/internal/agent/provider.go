package agent

import (
	"context"

	"github.com/jackuait/agent-desk/backend/internal/domain"
)

type Provider interface {
	SendMessage(ctx context.Context, conversationID string, content string) (domain.Message, error)
	StreamResponse(ctx context.Context, conversationID string, content string) (<-chan string, error)
}
