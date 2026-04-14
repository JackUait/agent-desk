package skills

type ItemKind string

const (
	KindSkill   ItemKind = "skill"
	KindCommand ItemKind = "command"
)

type ItemSource string

const (
	SourceUser   ItemSource = "user"
	SourcePlugin ItemSource = "plugin"
)

// Item is list metadata only — no body.
type Item struct {
	ID          string     `json:"id"`
	Kind        ItemKind   `json:"kind"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Source      ItemSource `json:"source"`
	PluginName  string     `json:"pluginName,omitempty"`
	ReadOnly    bool       `json:"readOnly"`
	Path        string     `json:"path"`
}

// Content is a single file's text + parsed frontmatter.
type Content struct {
	Path        string            `json:"path"`
	Body        string            `json:"body"`
	Frontmatter map[string]string `json:"frontmatter"`
}

// Roots describes the filesystem roots a scope operates on.
type Roots struct {
	Writable []string
	Readable []string
}
