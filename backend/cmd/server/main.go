package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/card"
	ws "github.com/jackuait/agent-desk/backend/internal/websocket"
	"github.com/jackuait/agent-desk/backend/pkg/middleware"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok\n"))
	})

	cardStore := card.NewStore()
	cardSvc := card.NewService(cardStore)
	cardHandler := card.NewHandler(cardSvc)
	cardHandler.RegisterRoutes(mux)

	boardHandler := board.NewHandler(cardStore)
	boardHandler.RegisterRoutes(mux)

	agentMgr := agent.NewManager("claude")
	wsHub := ws.NewHub()
	wsHandler := ws.NewHandler(wsHub, agentMgr, cardSvc)
	wsHandler.RegisterRoutes(mux)

	server := &http.Server{
		Addr:         ":8080",
		Handler:      middleware.CORS(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server forced to shutdown: %v", err)
		}
	}()

	log.Println("Server starting on :8080")
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
