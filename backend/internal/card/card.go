package card

import "time"

type Column = string

const (
	ColumnBacklog     Column = "backlog"
	ColumnInProgress  Column = "in_progress"
	ColumnReview      Column = "review"
	ColumnDone        Column = "done"
)

type Card struct {
	ID                 string    `json:"id"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Column             Column    `json:"column"`
	AcceptanceCriteria string    `json:"acceptanceCriteria"`
	Complexity         int       `json:"complexity"`
	RelevantFiles      []string  `json:"relevantFiles"`
	SessionID          string    `json:"sessionId"`
	WorktreePath       string    `json:"worktreePath"`
	BranchName         string    `json:"branchName"`
	PRUrl              string    `json:"prUrl"`
	CreatedAt          time.Time `json:"createdAt"`
}
