package attachment

// Attachment is the manifest entry for a single file attached to a card.
type Attachment struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	MIMEType   string `json:"mimeType"`
	UploadedAt int64  `json:"uploadedAt"`
}

// AttachmentDiff captures the net change between two manifest snapshots.
type AttachmentDiff struct {
	Added   []Attachment
	Removed []string // filenames
}

const (
	MaxFileBytes    int64 = 10 * 1024 * 1024
	MaxFilesPerCard       = 20
	MaxTotalBytes   int64 = 50 * 1024 * 1024
)
