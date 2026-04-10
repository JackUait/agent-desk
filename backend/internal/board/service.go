package board

import "context"

type Service interface {
	GetBoard(ctx context.Context, id string) (Board, error)
	ListBoards(ctx context.Context) ([]Board, error)
	CreateBoard(ctx context.Context, title string) (Board, error)
	UpdateBoard(ctx context.Context, board Board) (Board, error)
	DeleteBoard(ctx context.Context, id string) error
	MoveCard(ctx context.Context, boardID, cardID, fromColumnID, toColumnID string) error
}
