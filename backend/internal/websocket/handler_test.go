package websocket_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	wsinternal "github.com/jackuait/agent-desk/backend/internal/websocket"
	gowebsocket "nhooyr.io/websocket"
)

// buildServer wires up a test HTTP server with the WebSocket handler.
func buildServer(t *testing.T) (srv *httptest.Server, cardID string, hub *wsinternal.Hub) {
	t.Helper()

	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("test card")

	hub = wsinternal.NewHub()
	// Use "false" as the agent binary — it exits immediately so tests don't hang.
	manager := agent.NewManager("false")
	h := wsinternal.NewHandler(hub, manager, svc)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	return srv, c.ID, hub
}

func TestHandler_ClientReceivesHubBroadcast(t *testing.T) {
	srv, cardID, hub := buildServer(t)

	// Convert HTTP URL to ws:// URL.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/" + cardID + "/ws"

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := gowebsocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()

	// Give the server a moment to set up the subscription.
	time.Sleep(20 * time.Millisecond)

	// Broadcast a message through the hub.
	payload, _ := json.Marshal(map[string]string{"hello": "world"})
	hub.Broadcast(cardID, payload)

	// Expect the client to receive it.
	conn.SetReadLimit(1 << 20)
	_, got, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != string(payload) {
		t.Fatalf("expected %s, got %s", payload, got)
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

func TestHandler_Returns404ForUnknownCard(t *testing.T) {
	srv, _, _ := buildServer(t)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/cards/nonexistent/ws"

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, resp, err := gowebsocket.Dial(ctx, wsURL, nil)
	// nhooyr.io/websocket returns an error when the server rejects the upgrade.
	if err == nil {
		t.Fatal("expected dial to fail for unknown card")
	}
	if resp != nil && resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}
