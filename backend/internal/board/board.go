package board

type ColumnResponse struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	CardIDs []string `json:"cardIds"`
}

type BoardResponse struct {
	ID      string           `json:"id"`
	Title   string           `json:"title"`
	Columns []ColumnResponse `json:"columns"`
}
