package domain

type Message struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}
