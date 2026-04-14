package card

type Column string

const (
	ColumnBacklog    Column = "backlog"
	ColumnInProgress Column = "in_progress"
	ColumnReview     Column = "review"
	ColumnDone       Column = "done"
)

type Card struct {
	ID                 string   `json:"id"`
	ProjectID          string   `json:"projectId"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Column             Column   `json:"column"`
	AcceptanceCriteria []string `json:"acceptanceCriteria"`
	Complexity         string   `json:"complexity"`
	RelevantFiles      []string `json:"relevantFiles"`
	Model              string   `json:"model"`
	SessionID          string   `json:"sessionId"`
	WorktreePath       string   `json:"worktreePath"`
	BranchName         string   `json:"branchName"`
	PRUrl              string   `json:"prUrl"`
	CreatedAt          int64    `json:"createdAt"`
}
