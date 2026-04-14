package project

type Project struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Path      string `json:"path"`
	ColorIdx  int    `json:"colorIdx"`
	CreatedAt int64  `json:"createdAt"`
}

const ColorPaletteSize = 6
