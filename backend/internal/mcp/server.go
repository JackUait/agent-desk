package mcp

import (
	"context"
	"net/http"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// ctxKey is a private type for context.Value keys to avoid collisions.
type ctxKey int

const (
	cardIDCtxKey ctxKey = iota
)

// cardIDFromContext returns the cardID attached by the session middleware.
// Returns "" if no scoped session is present.
func cardIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(cardIDCtxKey).(string)
	return v
}

// NewServer wires the existing Handlers to a streamable HTTP MCP server with
// session-token middleware. Every request must carry ?token=<tok>; missing or
// unknown tokens are rejected with 401 before reaching the MCP server.
func NewServer(svc CardMutator, sessions *Sessions, broadcaster Broadcaster) http.Handler {
	handlers := NewHandlersWithBroadcaster(svc, broadcaster)

	mcpSrv := server.NewMCPServer("agent-desk", "0.1.0")
	registerTools(mcpSrv, handlers)

	// HTTPContextFunc fires after our middleware has already validated the
	// token and stamped cardID into r.Context(); we just propagate it into
	// the per-request ctx that mcp-go passes to tool handlers.
	httpHandler := server.NewStreamableHTTPServer(
		mcpSrv,
		server.WithStateLess(true),
		server.WithHTTPContextFunc(func(ctx context.Context, r *http.Request) context.Context {
			if cardID := cardIDFromContext(r.Context()); cardID != "" {
				return context.WithValue(ctx, cardIDCtxKey, cardID)
			}
			return ctx
		}),
	)

	return sessionMiddleware(sessions, httpHandler)
}

// sessionMiddleware enforces ?token=<tok> on every request and attaches the
// resolved cardID to the request context.
func sessionMiddleware(sessions *Sessions, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := r.URL.Query().Get("token")
		if tok == "" {
			http.Error(w, "missing session token", http.StatusUnauthorized)
			return
		}
		cardID, ok := sessions.Resolve(tok)
		if !ok {
			http.Error(w, "unknown session token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), cardIDCtxKey, cardID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// toolFunc adapts a Handlers method into mcp-go's ToolHandlerFunc, looking up
// the scoped cardID from context and translating the local Result type into
// mcp.CallToolResult.
func toolFunc(fn func(ctx context.Context, cardID string, args map[string]any) (Result, error)) server.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		cardID := cardIDFromContext(ctx)
		if cardID == "" {
			return mcp.NewToolResultError("no scoped card session"), nil
		}
		args := req.GetArguments()
		res, err := fn(ctx, cardID, args)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if res.IsError {
			return mcp.NewToolResultError(res.Message), nil
		}
		return mcp.NewToolResultText(res.Message), nil
	}
}

// registerTools attaches all 16 agent-desk tools to the MCP server.
func registerTools(s *server.MCPServer, h *Handlers) {
	s.AddTool(
		mcp.NewTool("mcp__agent_desk__get_card",
			mcp.WithDescription("Read the current state of the scoped card."),
		),
		toolFunc(h.GetCard),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_status",
			mcp.WithDescription("Move the scoped card to a different column."),
			mcp.WithString("column",
				mcp.Required(),
				mcp.Description("Target column"),
				mcp.Enum("backlog", "in_progress", "review", "done"),
			),
		),
		toolFunc(h.SetStatus),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_title",
			mcp.WithDescription("Set the scoped card's title."),
			mcp.WithString("title",
				mcp.Required(),
				mcp.MaxLength(200),
			),
		),
		toolFunc(h.SetTitle),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_description",
			mcp.WithDescription("Set the scoped card's description (markdown)."),
			mcp.WithString("description",
				mcp.Required(),
				mcp.MaxLength(8000),
			),
		),
		toolFunc(h.SetDescription),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_summary",
			mcp.WithDescription("Set a one-line agent status summary."),
			mcp.WithString("summary",
				mcp.Required(),
				mcp.MaxLength(280),
			),
		),
		toolFunc(h.SetSummary),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_complexity",
			mcp.WithDescription("Set the scoped card's complexity rating."),
			mcp.WithString("complexity",
				mcp.Required(),
				mcp.Enum("low", "medium", "high"),
			),
		),
		toolFunc(h.SetComplexity),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_progress",
			mcp.WithDescription("Report current progress on the scoped card."),
			mcp.WithNumber("step",
				mcp.Required(),
				mcp.Description("Current step number"),
			),
			mcp.WithNumber("totalSteps",
				mcp.Required(),
				mcp.Min(1),
				mcp.Description("Total number of steps"),
			),
			mcp.WithString("currentStep",
				mcp.Required(),
				mcp.Description("Human-readable label for the current step"),
			),
		),
		toolFunc(h.SetProgress),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__clear_progress",
			mcp.WithDescription("Clear the progress indicator on the scoped card."),
		),
		toolFunc(h.ClearProgress),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_blocked",
			mcp.WithDescription("Mark the scoped card as blocked with a reason."),
			mcp.WithString("reason",
				mcp.Required(),
				mcp.MinLength(1),
			),
		),
		toolFunc(h.SetBlocked),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__clear_blocked",
			mcp.WithDescription("Clear the blocked flag on the scoped card."),
		),
		toolFunc(h.ClearBlocked),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__add_label",
			mcp.WithDescription("Add a label to the scoped card."),
			mcp.WithString("label", mcp.Required()),
		),
		toolFunc(h.AddLabel),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__remove_label",
			mcp.WithDescription("Remove a label from the scoped card."),
			mcp.WithString("label", mcp.Required()),
		),
		toolFunc(h.RemoveLabel),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__add_acceptance_criterion",
			mcp.WithDescription("Append an acceptance criterion to the scoped card."),
			mcp.WithString("text", mcp.Required()),
		),
		toolFunc(h.AddAcceptanceCriterion),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__remove_acceptance_criterion",
			mcp.WithDescription("Remove an acceptance criterion by index."),
			mcp.WithNumber("index",
				mcp.Required(),
				mcp.Min(0),
			),
		),
		toolFunc(h.RemoveAcceptanceCriterion),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_acceptance_criteria",
			mcp.WithDescription("Replace the entire acceptance criteria list."),
			mcp.WithArray("items",
				mcp.Required(),
				mcp.Items(map[string]any{"type": "string"}),
			),
		),
		toolFunc(h.SetAcceptanceCriteria),
	)

	s.AddTool(
		mcp.NewTool("mcp__agent_desk__set_relevant_files",
			mcp.WithDescription("Replace the relevant files list."),
			mcp.WithArray("paths",
				mcp.Required(),
				mcp.Items(map[string]any{"type": "string"}),
			),
		),
		toolFunc(h.SetRelevantFiles),
	)
}
