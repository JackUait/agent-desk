package board

import "context"

type Board struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Columns []Column `json:"columns"`
}

type Column struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	CardIDs []string `json:"cardIds"`
}

type Repository interface {
	Get(ctx context.Context, id string) (Board, error)
	List(ctx context.Context) ([]Board, error)
	Create(ctx context.Context, board Board) (Board, error)
	Update(ctx context.Context, board Board) (Board, error)
	Delete(ctx context.Context, id string) error
	GetColumn(ctx context.Context, boardID, columnID string) (Column, error)
	MoveCard(ctx context.Context, boardID, cardID, fromColumnID, toColumnID string) error
}
