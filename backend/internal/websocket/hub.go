package websocket

import "sync"

// Hub manages pub/sub channels keyed by card ID.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[string][]chan []byte
}

// NewHub returns an initialised Hub.
func NewHub() *Hub {
	return &Hub{
		subscribers: make(map[string][]chan []byte),
	}
}

// Subscribe registers ch as a subscriber for cardID.
func (h *Hub) Subscribe(cardID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.subscribers[cardID] = append(h.subscribers[cardID], ch)
}

// Unsubscribe removes ch from cardID's subscriber list.
// Empty subscriber lists are cleaned up.
func (h *Hub) Unsubscribe(cardID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs := h.subscribers[cardID]
	updated := subs[:0]
	for _, s := range subs {
		if s != ch {
			updated = append(updated, s)
		}
	}
	if len(updated) == 0 {
		delete(h.subscribers, cardID)
	} else {
		h.subscribers[cardID] = updated
	}
}

// Broadcast sends msg to all subscribers for cardID.
// Slow subscribers are skipped (non-blocking send).
func (h *Hub) Broadcast(cardID string, msg []byte) {
	h.mu.RLock()
	subs := make([]chan []byte, len(h.subscribers[cardID]))
	copy(subs, h.subscribers[cardID])
	h.mu.RUnlock()

	for _, ch := range subs {
		select {
		case ch <- msg:
		default:
		}
	}
}
