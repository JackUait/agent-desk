package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/internal/domain"
	"github.com/jackuait/agent-desk/backend/internal/mcp"
	"github.com/jackuait/agent-desk/backend/internal/project"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
	gowebsocket "nhooyr.io/websocket"
)

// Handler wires WebSocket connections to the Hub and Agent Manager.
type Handler struct {
	hub          *Hub
	manager      *agent.Manager
	cardSvc      *card.Service
	projectStore *project.Store
	sessions     *mcp.Sessions
	mcpPort      int
}

// NewHandler returns a Handler. sessions and mcpPort may be nil/0; when both
// are configured the handler mints a per-turn MCP session token and writes a
// temp .mcp.json that the spawned agent uses to call back into the local
// MCP server.
func NewHandler(hub *Hub, manager *agent.Manager, cardSvc *card.Service, projectStore *project.Store, sessions *mcp.Sessions, mcpPort int) *Handler {
	return &Handler{
		hub:          hub,
		manager:      manager,
		cardSvc:      cardSvc,
		projectStore: projectStore,
		sessions:     sessions,
		mcpPort:      mcpPort,
	}
}

// HandleWebSocket upgrades the HTTP connection for card {id} to WebSocket,
// spawns an agent if none is running, and bridges messages between the
// client and the hub.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")

	c, err := h.cardSvc.GetCard(cardID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, err.Error())
		return
	}

	conn, err := gowebsocket.Accept(w, r, &gowebsocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("ws: accept error for card %s: %v", cardID, err)
		return
	}
	defer conn.CloseNow()

	// Subscribe this connection to the hub.
	ch := make(chan []byte, 64)
	h.hub.Subscribe(cardID, ch)
	defer h.hub.Unsubscribe(cardID, ch)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Writer goroutine: hub messages → WebSocket.
	go func() {
		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				if writeErr := conn.Write(ctx, gowebsocket.MessageText, msg); writeErr != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// sendToAgent spawns a per-message Claude CLI process and bridges events.
	sendToAgent := func(message string) {
		c, _ = h.cardSvc.GetCard(cardID)
		var workDir string
		if proj, ok := h.projectStore.Get(c.ProjectID); ok {
			workDir = proj.Path
		}

		var (
			mcpConfigPath string
			mcpToken      string
		)
		if h.sessions != nil && h.mcpPort > 0 {
			mcpToken = h.sessions.Mint(cardID)
			cfgPath, cfgErr := writeMcpConfig(cardID, mcpToken, h.mcpPort)
			if cfgErr != nil {
				log.Printf("ws: mcp config write failed for card %s: %v", cardID, cfgErr)
			} else {
				mcpConfigPath = cfgPath
			}
		}

		// cleanupMcp revokes the per-turn token + removes the temp config.
		// Safe to call even if no token was minted.
		cleanupMcp := func() {
			if mcpToken != "" {
				h.sessions.Revoke(mcpToken)
			}
			if mcpConfigPath != "" {
				_ = os.Remove(mcpConfigPath)
			}
		}

		events := make(chan agent.StreamEvent, 64)
		if sendErr := h.manager.Send(agent.SendRequest{
			CardID:        cardID,
			SessionID:     c.SessionID,
			Model:         c.Model,
			Effort:        c.Effort,
			Message:       message,
			WorkDir:       workDir,
			McpConfigPath: mcpConfigPath,
		}, events); sendErr != nil {
			log.Printf("ws: send error for card %s: %v", cardID, sendErr)
			h.broadcastError(cardID, sendErr.Error())
			cleanupMcp()
			return
		}
		go func() {
			h.StartEventBridge(cardID, events)
			cleanupMcp()
		}()
	}

	// Reader loop: WebSocket messages → agent/service actions.
	for {
		_, data, readErr := conn.Read(ctx)
		if readErr != nil {
			break
		}

		var msg struct {
			Type    string `json:"type"`
			Content string `json:"content"`
			Model   string `json:"model,omitempty"`
			Effort  string `json:"effort,omitempty"`
		}
		if jsonErr := json.Unmarshal(data, &msg); jsonErr != nil {
			continue
		}

		switch msg.Type {
		case "message":
			if msg.Model != "" {
				if !agent.IsAllowed(msg.Model) {
					h.broadcastError(cardID, "unknown model: "+msg.Model)
					break
				}
				updated, svcErr := h.cardSvc.SetModel(cardID, msg.Model)
				if svcErr != nil {
					log.Printf("ws: SetModel error for card %s: %v", cardID, svcErr)
					h.broadcastError(cardID, svcErr.Error())
					break
				}
				h.broadcastCard(cardID, updated)
			}
			if msg.Effort != "" {
				if !agent.IsAllowedEffort(msg.Effort) {
					h.broadcastError(cardID, "unknown effort: "+msg.Effort)
					break
				}
				updated, svcErr := h.cardSvc.SetEffort(cardID, msg.Effort)
				if svcErr != nil {
					log.Printf("ws: SetEffort error for card %s: %v", cardID, svcErr)
					h.broadcastError(cardID, svcErr.Error())
					break
				}
				h.broadcastCard(cardID, updated)
			}
			if err := h.cardSvc.AppendMessage(cardID, domain.Message{
				ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:      "user",
				Content:   msg.Content,
				Timestamp: time.Now().Unix(),
			}); err != nil {
				log.Printf("ws: AppendMessage (user) for card %s: %v", cardID, err)
			}
			sendToAgent(msg.Content)

		case "start":
			updated, svcErr := h.cardSvc.StartDevelopment(cardID)
			if svcErr != nil {
				log.Printf("ws: StartDevelopment error for card %s: %v", cardID, svcErr)
				h.broadcastError(cardID, svcErr.Error())
				break
			}
			h.broadcastCard(cardID, updated)
			sendToAgent("Start development now.")

		case "approve":
			sendToAgent("Create a PR now.")

		case "merge":
			updated, svcErr := h.cardSvc.MoveToDone(cardID)
			if svcErr != nil {
				log.Printf("ws: MoveToDone error for card %s: %v", cardID, svcErr)
				h.broadcastError(cardID, svcErr.Error())
				break
			}
			h.broadcastCard(cardID, updated)
		}
	}

	conn.Close(gowebsocket.StatusNormalClosure, "")
}

// StartEventBridge reads agent events, translates them into typed
// WSServerMessage frames the frontend expects, and broadcasts them to
// hub subscribers.
func (h *Handler) StartEventBridge(cardID string, events <-chan agent.StreamEvent) {
	// Per-turn state. Reset on every EventMessageStart.
	stopReason := ""
	inputTokens := 0
	outputTokens := 0
	emittedTools := make(map[string]bool)

	broadcast := func(payload map[string]any) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		h.hub.Broadcast(cardID, data)
	}

	for ev := range events {
		switch ev.Type {
		case agent.EventMessageStart:
			// Capture session id (if present) before resetting state.
			if ev.SessionID != "" {
				if _, err := h.cardSvc.SetSessionID(cardID, ev.SessionID); err != nil {
					log.Printf("ws: SetSessionID error for card %s: %v", cardID, err)
				}
			}
			stopReason = ""
			inputTokens = 0
			outputTokens = 0
			emittedTools = make(map[string]bool)

			broadcast(map[string]any{
				"type":      "turn_start",
				"sessionId": ev.SessionID,
			})

		case agent.EventTextDelta:
			// Assistant-snapshot text. The typed frame protocol carries
			// the streaming text via partial_text events; this branch
			// exists solely to scan the completed snapshot for the
			// review signal that auto-moves the card.
			if strings.Contains(ev.Text, "READY_FOR_REVIEW") {
				if _, err := h.cardSvc.MoveToReview(cardID); err != nil {
					log.Printf("ws: MoveToReview error for card %s: %v", cardID, err)
				} else {
					c, _ := h.cardSvc.GetCard(cardID)
					h.broadcastCard(cardID, c)
				}
			}
			if ev.Text != "" {
				if err := h.cardSvc.AppendMessage(cardID, domain.Message{
					ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
					Role:      "assistant",
					Content:   ev.Text,
					Timestamp: time.Now().Unix(),
				}); err != nil {
					log.Printf("ws: AppendMessage (assistant) for card %s: %v", cardID, err)
				}
			}

		case agent.EventPartialTextStart:
			broadcast(map[string]any{
				"type":  "block_start",
				"index": ev.Index,
				"kind":  "text",
			})

		case agent.EventThinkingStart:
			broadcast(map[string]any{
				"type":  "block_start",
				"index": ev.Index,
				"kind":  "thinking",
			})

		case agent.EventToolUseStart:
			// Tool-use blocks arrive from BOTH the stream_event
			// content_block_start path and the assistant snapshot
			// fallback. Dedupe by tool id within a turn so the
			// frontend only sees one block_start per tool call.
			if ev.ToolID != "" && emittedTools[ev.ToolID] {
				continue
			}
			if ev.ToolID != "" {
				emittedTools[ev.ToolID] = true
			}
			broadcast(map[string]any{
				"type":     "block_start",
				"index":    ev.Index,
				"kind":     "tool_use",
				"toolId":   ev.ToolID,
				"toolName": ev.ToolName,
			})

		case agent.EventPartialText:
			broadcast(map[string]any{
				"type":  "block_delta",
				"index": ev.Index,
				"text":  ev.Text,
			})

		case agent.EventThinkingDelta:
			broadcast(map[string]any{
				"type":     "block_delta",
				"index":    ev.Index,
				"thinking": ev.Thinking,
			})

		case agent.EventToolInputDelta:
			broadcast(map[string]any{
				"type":        "block_delta",
				"index":       ev.Index,
				"partialJson": ev.PartialJSON,
			})

		case agent.EventContentBlockStop:
			broadcast(map[string]any{
				"type":  "block_stop",
				"index": ev.Index,
			})

		case agent.EventMessageDelta:
			// Stash per-turn metrics; surfaced on turn_end. No
			// standalone frame — the frontend reducer correlates
			// these to the turn, not to any individual block.
			if ev.StopReason != "" {
				stopReason = ev.StopReason
			}
			if ev.InputTokens != 0 {
				inputTokens = ev.InputTokens
			}
			if ev.OutputTokens != 0 {
				outputTokens = ev.OutputTokens
			}

		case agent.EventToolResult:
			broadcast(map[string]any{
				"type":      "tool_result",
				"toolUseId": ev.ToolUseID,
				"content":   ev.ToolResult,
				"isError":   ev.IsError,
			})

		case agent.EventMessageStop:
			// The result envelope carries its own cumulative metrics —
			// prefer them over the last EventMessageDelta when present.
			if ev.InputTokens != 0 {
				inputTokens = ev.InputTokens
			}
			if ev.OutputTokens != 0 {
				outputTokens = ev.OutputTokens
			}
			broadcast(map[string]any{
				"type":         "turn_end",
				"durationMs":   ev.DurationMS,
				"costUsd":      ev.CostUSD,
				"inputTokens":  inputTokens,
				"outputTokens": outputTokens,
				"stopReason":   stopReason,
			})
		}
	}
}

// broadcastError sends an error message to all hub subscribers for a card.
func (h *Handler) broadcastError(cardID string, msg string) {
	payload, _ := json.Marshal(map[string]string{"type": "error", "message": msg})
	h.hub.Broadcast(cardID, payload)
}

// broadcastCard serialises a card and broadcasts it to hub subscribers.
func (h *Handler) broadcastCard(cardID string, c card.Card) {
	payload := map[string]any{
		"type": "card_update",
		"fields": c,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.hub.Broadcast(cardID, data)
}

// RegisterRoutes mounts the WebSocket handler.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/cards/{id}/ws", h.HandleWebSocket)
}

// writeMcpConfig serialises a minimal Claude CLI .mcp.json that points the
// spawned agent at the local MCP HTTP server with the per-turn session
// token. The caller owns the returned path and is responsible for removing
// it once the turn completes.
func writeMcpConfig(cardID, token string, port int) (string, error) {
	cfg := map[string]any{
		"mcpServers": map[string]any{
			"agent_desk": map[string]any{
				"type": "http",
				"url":  fmt.Sprintf("http://127.0.0.1:%d/mcp?token=%s", port, token),
			},
		},
	}
	payload, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp("", "agent-desk-mcp-"+cardID+"-*.json")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(payload); err != nil {
		return "", err
	}
	return f.Name(), nil
}

