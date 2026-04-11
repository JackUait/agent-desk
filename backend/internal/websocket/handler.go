package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
	gowebsocket "nhooyr.io/websocket"
)

// Handler wires WebSocket connections to the Hub and Agent Manager.
type Handler struct {
	hub     *Hub
	manager *agent.Manager
	cardSvc *card.Service
}

// NewHandler returns a Handler.
func NewHandler(hub *Hub, manager *agent.Manager, cardSvc *card.Service) *Handler {
	return &Handler{hub: hub, manager: manager, cardSvc: cardSvc}
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

	// Spawn agent if not already running.
	if !h.manager.IsRunning(cardID) {
		events := make(chan agent.StreamEvent, 64)
		if spawnErr := h.manager.Spawn(cardID, c.SessionID, events); spawnErr != nil {
			log.Printf("ws: spawn error for card %s: %v", cardID, spawnErr)
		} else {
			go h.StartEventBridge(cardID, events)
		}
	}

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

	// Reader loop: WebSocket messages → agent/service actions.
	for {
		_, data, readErr := conn.Read(ctx)
		if readErr != nil {
			break
		}

		var msg struct {
			Type    string `json:"type"`
			Content string `json:"content"`
		}
		if jsonErr := json.Unmarshal(data, &msg); jsonErr != nil {
			continue
		}

		switch msg.Type {
		case "message":
			if sendErr := h.manager.Send(cardID, msg.Content); sendErr != nil {
				log.Printf("ws: send error for card %s: %v", cardID, sendErr)
				h.broadcastError(cardID, sendErr.Error())
			}

		case "start":
			updated, svcErr := h.cardSvc.StartDevelopment(cardID)
			if svcErr != nil {
				log.Printf("ws: StartDevelopment error for card %s: %v", cardID, svcErr)
				h.broadcastError(cardID, svcErr.Error())
				break
			}
			h.broadcastCard(cardID, updated)
			if sendErr := h.manager.Send(cardID, "Start development now."); sendErr != nil {
				log.Printf("ws: send start error for card %s: %v", cardID, sendErr)
			}

		case "approve":
			if sendErr := h.manager.Send(cardID, "Create a PR now."); sendErr != nil {
				log.Printf("ws: send approve error for card %s: %v", cardID, sendErr)
			}

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

// StartEventBridge reads agent events and broadcasts them to hub subscribers.
// It also detects "READY_FOR_REVIEW" in text deltas and moves the card to review.
func (h *Handler) StartEventBridge(cardID string, events <-chan agent.StreamEvent) {
	for ev := range events {
		// Capture session ID on first message_start.
		if ev.Type == agent.EventMessageStart && ev.SessionID != "" {
			if _, err := h.cardSvc.SetSessionID(cardID, ev.SessionID); err != nil {
				log.Printf("ws: SetSessionID error for card %s: %v", cardID, err)
			}
		}

		// Forward raw event JSON to subscribers.
		h.hub.Broadcast(cardID, ev.Raw)

		// Detect review signal in text deltas.
		if ev.Type == agent.EventTextDelta && strings.Contains(ev.Text, "READY_FOR_REVIEW") {
			if _, err := h.cardSvc.MoveToReview(cardID); err != nil {
				log.Printf("ws: MoveToReview error for card %s: %v", cardID, err)
			} else {
				c, _ := h.cardSvc.GetCard(cardID)
				h.broadcastCard(cardID, c)
			}
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

