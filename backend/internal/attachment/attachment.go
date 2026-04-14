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
	MaxFileBytes    int64 = 500 * 1024 * 1024
	MaxFilesPerCard       = 20
	MaxTotalBytes   int64 = 2 * 1024 * 1024 * 1024
)

// Limits caps the size and count of attachments a Service will accept.
type Limits struct {
	MaxFileBytes    int64
	MaxTotalBytes   int64
	MaxFilesPerCard int
}

// DefaultLimits returns the production default caps.
func DefaultLimits() Limits {
	return Limits{
		MaxFileBytes:    MaxFileBytes,
		MaxTotalBytes:   MaxTotalBytes,
		MaxFilesPerCard: MaxFilesPerCard,
	}
}
