package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/internal/project"
	"github.com/jackuait/agent-desk/backend/internal/worktree"
	ws "github.com/jackuait/agent-desk/backend/internal/websocket"
	"github.com/jackuait/agent-desk/backend/pkg/middleware"
)

type projectCascade struct {
	cardSvc     *card.Service
	worktreeMgr *worktree.Manager
}

func (c *projectCascade) DeleteByProject(projectID string) {
	c.cardSvc.DeleteByProject(projectID)
	c.worktreeMgr.Remove(projectID)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok\n"))
	})

	projectStore := project.NewStore(project.NewRealGit())
	picker := project.NewPicker(runtime.GOOS, project.ExecRunner{})

	cardStore := card.NewStore()
	cardSvc := card.NewService(cardStore)

	worktreeMgr := worktree.NewManager()
	agentMgr := agent.NewManager("claude")

	cascade := &projectCascade{cardSvc: cardSvc, worktreeMgr: worktreeMgr}
	projectHandler := project.NewHandler(projectStore, picker, cascade)
	projectHandler.RegisterRoutes(mux)

	cardHandler := card.NewHandler(cardSvc, agentMgr, worktreeMgr, projectStore)
	cardHandler.RegisterRoutes(mux)

	boardHandler := board.NewHandler(cardStore)
	boardHandler.RegisterRoutes(mux)

	wsHub := ws.NewHub()
	wsHandler := ws.NewHandler(wsHub, agentMgr, cardSvc, projectStore, nil, 0)
	wsHandler.RegisterRoutes(mux)

	modelsHandler := agent.NewModelsHandler()
	modelsHandler.RegisterRoutes(mux)

	server := &http.Server{
		Addr:         ":8080",
		Handler:      middleware.CORS(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,
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
