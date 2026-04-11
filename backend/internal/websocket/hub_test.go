package websocket

import (
	"testing"
	"time"
)

func recvWithTimeout(ch chan []byte, d time.Duration) ([]byte, bool) {
	select {
	case msg := <-ch:
		return msg, true
	case <-time.After(d):
		return nil, false
	}
}

func TestHub_SubscribeAndBroadcast(t *testing.T) {
	h := NewHub()
	ch := make(chan []byte, 1)
	h.Subscribe("card-1", ch)

	h.Broadcast("card-1", []byte("hello"))

	msg, ok := recvWithTimeout(ch, 100*time.Millisecond)
	if !ok {
		t.Fatal("expected message but channel was empty")
	}
	if string(msg) != "hello" {
		t.Fatalf("expected %q, got %q", "hello", string(msg))
	}
}

func TestHub_UnsubscribeNotReceived(t *testing.T) {
	h := NewHub()
	ch := make(chan []byte, 1)
	h.Subscribe("card-1", ch)
	h.Unsubscribe("card-1", ch)

	h.Broadcast("card-1", []byte("should not arrive"))

	_, ok := recvWithTimeout(ch, 30*time.Millisecond)
	if ok {
		t.Fatal("expected no message after unsubscribe")
	}
}

func TestHub_UnsubscribeCleansUpEmptyEntry(t *testing.T) {
	h := NewHub()
	ch := make(chan []byte, 1)
	h.Subscribe("card-1", ch)
	h.Unsubscribe("card-1", ch)

	h.mu.RLock()
	_, exists := h.subscribers["card-1"]
	h.mu.RUnlock()
	if exists {
		t.Fatal("expected subscriber map entry to be removed after last unsubscribe")
	}
}

func TestHub_MultipleSubscribers(t *testing.T) {
	h := NewHub()
	ch1 := make(chan []byte, 1)
	ch2 := make(chan []byte, 1)
	h.Subscribe("card-1", ch1)
	h.Subscribe("card-1", ch2)

	h.Broadcast("card-1", []byte("hi"))

	msg1, ok1 := recvWithTimeout(ch1, 100*time.Millisecond)
	msg2, ok2 := recvWithTimeout(ch2, 100*time.Millisecond)
	if !ok1 || !ok2 {
		t.Fatal("both subscribers should have received the message")
	}
	if string(msg1) != "hi" || string(msg2) != "hi" {
		t.Fatalf("unexpected messages: %q %q", string(msg1), string(msg2))
	}
}

func TestHub_BroadcastWrongCard(t *testing.T) {
	h := NewHub()
	ch := make(chan []byte, 1)
	h.Subscribe("card-1", ch)

	h.Broadcast("card-2", []byte("wrong card"))

	_, ok := recvWithTimeout(ch, 30*time.Millisecond)
	if ok {
		t.Fatal("subscriber for card-1 should not receive broadcast for card-2")
	}
}
