package agent_test

import (
	"context"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/domain"
)

type mockProvider struct{}

func (m *mockProvider) SendMessage(_ context.Context, _ string, _ string) (domain.Message, error) {
	return domain.Message{}, nil
}

func (m *mockProvider) StreamResponse(_ context.Context, _ string, _ string) (<-chan string, error) {
	return nil, nil
}

var _ agent.Provider = (*mockProvider)(nil)

func TestProviderInterfaceIsImplementable(t *testing.T) {
	var p agent.Provider = &mockProvider{}
	if p == nil {
		t.Error("expected non-nil provider")
	}
}
