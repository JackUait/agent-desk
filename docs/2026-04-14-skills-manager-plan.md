# Skills & Commands Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal-based manager that lets users view/create/edit/rename/delete Claude Code skills and slash commands at the global (`~/.claude/`) and per-project (`<project>/.claude/`) scopes, with a Milkdown rich editor and raw-text toggle.

**Architecture:** New `skills` domain on the Go backend exposes `/api/skills*` CRUD routes that read/write files under allow-listed roots and walk `~/.claude/plugins/cache` for read-only plugin items. New `frontend/src/features/skills/` feature ships a large dialog (list + editor) opened from two entry points: a global button next to `SettingsButton`, and a per-project button in each `ProjectSidebar` row.

**Tech Stack:** Go stdlib (`net/http`, `os`, `filepath`, `encoding/json`), React 19 + TypeScript + Vite, Milkdown (`@milkdown/core`, `@milkdown/react`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/theme-nord`), Vitest + React Testing Library.

**Parallelization hint:** Tasks 1–2 and 15 are sequential foundations. Tasks 3–6 run in parallel after Task 2. Tasks 7–11 run in parallel after Task 3. Tasks 16–22 run in parallel after Task 15. Task 12 wires everything and must run last.

---

## Spec

See `docs/2026-04-14-skills-manager-design.md` for the full design. Summary of scopes:

- **Global writable roots:** `~/.claude/skills/`, `~/.claude/commands/`
- **Project writable roots:** `<project.path>/.claude/skills/`, `<project.path>/.claude/commands/`
- **Plugin read-only roots:** `~/.claude/plugins/cache/<plugin>/<version>/skills/` and `.../commands/`

A **skill** is a directory containing `SKILL.md`. A **command** is a single `<name>.md` file under `commands/`. Frontmatter is a leading `---\nkey: value\n...\n---\n` block.

---

## File Structure

### Backend (new package `backend/internal/skills/`)

- `skills.go` — types (`Item`, `Content`, `Scope`), constants, minimal parser.
- `frontmatter.go` — split/parse/assemble frontmatter.
- `frontmatter_test.go`
- `service.go` — `Service` struct wrapping a filesystem root resolver; exposes `List`, `ReadContent`, `WriteContent`, `Create`, `Rename`, `Delete`.
- `service_test.go`
- `safety.go` — `resolveWritable(path, roots)` / `resolveReadable(path, roots)`.
- `safety_test.go`
- `handler.go` — HTTP handlers + `RegisterRoutes`.
- `handler_test.go`
- Server wiring in `backend/cmd/server/main.go`.

### Frontend (new feature `frontend/src/features/skills/`)

```
frontend/src/features/skills/
  types.ts
  skills-api.ts
  use-skills.ts
  use-skills.test.ts
  SkillsDialog.tsx
  SkillsDialog.test.tsx
  SkillsDialog.module.css
  SkillsList.tsx
  SkillsList.test.tsx
  SkillEditor.tsx
  SkillEditor.test.tsx
  SkillMarkdownEditor.tsx
  SkillMarkdownEditor.test.tsx
  FrontmatterForm.tsx
  FrontmatterForm.test.tsx
  NewSkillDialog.tsx
  NewSkillDialog.test.tsx
  DeleteSkillConfirm.tsx
  GlobalSkillsButton.tsx
  GlobalSkillsButton.test.tsx
  index.ts
```

Also:

- `frontend/src/features/settings/SettingsButton.tsx` — render `GlobalSkillsButton` alongside.
- `frontend/src/features/project/ProjectSidebar.tsx` — add per-row skills button.
- `frontend/src/shared/api/client.ts` — re-export skills-api (optional, skills-api can be consumed directly).

---

## Task 1: Backend Frontmatter Parser

**Files:**
- Create: `backend/internal/skills/frontmatter.go`
- Test: `backend/internal/skills/frontmatter_test.go`

- [ ] **Step 1: Write the failing test**

```go
// backend/internal/skills/frontmatter_test.go
package skills

import (
	"reflect"
	"testing"
)

func TestSplitFrontmatter(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		wantFM   map[string]string
		wantBody string
	}{
		{
			name:     "no frontmatter",
			input:    "# Hello\nbody",
			wantFM:   map[string]string{},
			wantBody: "# Hello\nbody",
		},
		{
			name:     "with frontmatter",
			input:    "---\nname: foo\ndescription: bar baz\n---\n# Hello\nbody",
			wantFM:   map[string]string{"name": "foo", "description": "bar baz"},
			wantBody: "# Hello\nbody",
		},
		{
			name:     "frontmatter only",
			input:    "---\nname: foo\n---\n",
			wantFM:   map[string]string{"name": "foo"},
			wantBody: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fm, body := SplitFrontmatter(tc.input)
			if !reflect.DeepEqual(fm, tc.wantFM) {
				t.Errorf("frontmatter = %v, want %v", fm, tc.wantFM)
			}
			if body != tc.wantBody {
				t.Errorf("body = %q, want %q", body, tc.wantBody)
			}
		})
	}
}

func TestAssembleFrontmatter(t *testing.T) {
	fm := map[string]string{"name": "foo", "description": "bar"}
	body := "# Hello"
	got := AssembleFrontmatter(fm, body)
	// keys sorted alphabetically for stable output
	want := "---\ndescription: bar\nname: foo\n---\n# Hello"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestAssembleFrontmatterEmpty(t *testing.T) {
	got := AssembleFrontmatter(map[string]string{}, "body only")
	if got != "body only" {
		t.Errorf("got %q, want %q", got, "body only")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/skills/...`
Expected: FAIL (package does not exist yet).

- [ ] **Step 3: Implement**

```go
// backend/internal/skills/frontmatter.go
package skills

import (
	"sort"
	"strings"
)

// SplitFrontmatter extracts a leading YAML-ish frontmatter block from content.
// It supports flat "key: value" pairs only.
func SplitFrontmatter(content string) (map[string]string, string) {
	fm := map[string]string{}
	if !strings.HasPrefix(content, "---\n") {
		return fm, content
	}
	rest := content[len("---\n"):]
	end := strings.Index(rest, "\n---\n")
	if end == -1 {
		// unterminated — treat as no frontmatter
		return fm, content
	}
	block := rest[:end]
	body := rest[end+len("\n---\n"):]
	for _, line := range strings.Split(block, "\n") {
		if line == "" {
			continue
		}
		idx := strings.Index(line, ":")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if key != "" {
			fm[key] = val
		}
	}
	return fm, body
}

// AssembleFrontmatter serialises fm + body back into a single string. Keys are
// sorted alphabetically so output is deterministic. If fm is empty, body is
// returned unchanged.
func AssembleFrontmatter(fm map[string]string, body string) string {
	if len(fm) == 0 {
		return body
	}
	keys := make([]string, 0, len(fm))
	for k := range fm {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("---\n")
	for _, k := range keys {
		b.WriteString(k)
		b.WriteString(": ")
		b.WriteString(fm[k])
		b.WriteString("\n")
	}
	b.WriteString("---\n")
	b.WriteString(body)
	return b.String()
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd backend && go test ./internal/skills/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/frontmatter.go backend/internal/skills/frontmatter_test.go
git commit -m "feat(skills): frontmatter split/assemble helpers"
```

---

## Task 2: Backend Types + Path Safety

**Files:**
- Create: `backend/internal/skills/skills.go`
- Create: `backend/internal/skills/safety.go`
- Test: `backend/internal/skills/safety_test.go`

- [ ] **Step 1: Write `skills.go` types**

```go
// backend/internal/skills/skills.go
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
	Writable []string // e.g. ~/.claude/skills, ~/.claude/commands
	Readable []string // plugin caches (read-only)
}
```

- [ ] **Step 2: Write safety test**

```go
// backend/internal/skills/safety_test.go
package skills

import (
	"path/filepath"
	"testing"
)

func TestResolveWritable(t *testing.T) {
	tmp := t.TempDir()
	roots := Roots{Writable: []string{filepath.Join(tmp, "skills")}}

	ok := filepath.Join(tmp, "skills", "foo", "SKILL.md")
	if _, err := ResolveWritable(ok, roots); err != nil {
		t.Errorf("expected ok, got %v", err)
	}

	bad := filepath.Join(tmp, "other", "SKILL.md")
	if _, err := ResolveWritable(bad, roots); err == nil {
		t.Error("expected rejection for path outside writable roots")
	}

	traversal := filepath.Join(tmp, "skills", "..", "etc", "passwd")
	if _, err := ResolveWritable(traversal, roots); err == nil {
		t.Error("expected rejection for traversal")
	}
}

func TestResolveReadable(t *testing.T) {
	tmp := t.TempDir()
	roots := Roots{
		Writable: []string{filepath.Join(tmp, "skills")},
		Readable: []string{filepath.Join(tmp, "plugins")},
	}
	// writable root is also readable
	if _, err := ResolveReadable(filepath.Join(tmp, "skills", "a.md"), roots); err != nil {
		t.Errorf("writable should be readable: %v", err)
	}
	// plugin root readable
	if _, err := ResolveReadable(filepath.Join(tmp, "plugins", "p", "SKILL.md"), roots); err != nil {
		t.Errorf("plugin should be readable: %v", err)
	}
	// outside all roots rejected
	if _, err := ResolveReadable(filepath.Join(tmp, "nope", "x"), roots); err == nil {
		t.Error("expected rejection for path outside all roots")
	}
}
```

- [ ] **Step 3: Run, expect FAIL**

Run: `cd backend && go test ./internal/skills/...`
Expected: FAIL (symbols undefined).

- [ ] **Step 4: Implement safety**

```go
// backend/internal/skills/safety.go
package skills

import (
	"errors"
	"path/filepath"
	"strings"
)

var ErrForbiddenPath = errors.New("path not allowed")

func resolveIn(path string, roots []string) (string, error) {
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", err
	}
	for _, root := range roots {
		rootAbs, err := filepath.Abs(filepath.Clean(root))
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(rootAbs, abs)
		if err != nil {
			continue
		}
		if rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)) {
			return abs, nil
		}
	}
	return "", ErrForbiddenPath
}

// ResolveWritable returns the absolute path if it lives inside one of the
// writable roots, otherwise ErrForbiddenPath.
func ResolveWritable(path string, roots Roots) (string, error) {
	return resolveIn(path, roots.Writable)
}

// ResolveReadable allows writable and readable roots.
func ResolveReadable(path string, roots Roots) (string, error) {
	all := make([]string, 0, len(roots.Writable)+len(roots.Readable))
	all = append(all, roots.Writable...)
	all = append(all, roots.Readable...)
	return resolveIn(path, all)
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `cd backend && go test ./internal/skills/...`

- [ ] **Step 6: Commit**

```bash
git add backend/internal/skills/skills.go backend/internal/skills/safety.go backend/internal/skills/safety_test.go
git commit -m "feat(skills): types and path safety resolver"
```

---

## Task 3: Backend Service — List User Items

**Files:**
- Create: `backend/internal/skills/service.go`
- Test: `backend/internal/skills/service_test.go`

- [ ] **Step 1: Failing test**

```go
// backend/internal/skills/service_test.go
package skills

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestServiceListUser(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")

	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: first skill\n---\nbody")
	writeFile(t, filepath.Join(commandsRoot, "greet.md"),
		"---\ndescription: say hi\n---\n/greet")

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})
	items, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })

	if len(items) != 2 {
		t.Fatalf("want 2 items, got %d", len(items))
	}
	if items[0].Name != "alpha" || items[0].Kind != KindSkill || items[0].Source != SourceUser {
		t.Errorf("unexpected item[0]: %+v", items[0])
	}
	if items[1].Name != "greet" || items[1].Kind != KindCommand || items[1].Source != SourceUser {
		t.Errorf("unexpected item[1]: %+v", items[1])
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement service skeleton + List user items**

```go
// backend/internal/skills/service.go
package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Service struct {
	roots Roots
}

func NewService(roots Roots) *Service {
	return &Service{roots: roots}
}

func (s *Service) Roots() Roots { return s.roots }

func (s *Service) List() ([]Item, error) {
	var items []Item
	for _, root := range s.roots.Writable {
		kind := detectKindForRoot(root)
		entries, err := listDir(root)
		if err != nil {
			return nil, err
		}
		for _, name := range entries {
			full := filepath.Join(root, name)
			item, ok, err := loadItem(full, kind, SourceUser, "")
			if err != nil {
				return nil, err
			}
			if ok {
				items = append(items, item)
			}
		}
	}
	// plugin items (read-only)
	for _, root := range s.roots.Readable {
		kind := detectKindForRoot(root)
		entries, err := listDir(root)
		if err != nil {
			return nil, err
		}
		plugin := pluginNameFromRoot(root)
		for _, name := range entries {
			full := filepath.Join(root, name)
			item, ok, err := loadItem(full, kind, SourcePlugin, plugin)
			if err != nil {
				return nil, err
			}
			if ok {
				items = append(items, item)
			}
		}
	}
	return items, nil
}

func detectKindForRoot(root string) ItemKind {
	base := filepath.Base(root)
	if base == "commands" {
		return KindCommand
	}
	return KindSkill
}

func pluginNameFromRoot(root string) string {
	// Roots like .../plugins/cache/<plugin>/<ver>/skills
	parts := strings.Split(filepath.ToSlash(root), "/")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == "cache" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func listDir(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out, nil
}

func loadItem(full string, kind ItemKind, source ItemSource, pluginName string) (Item, bool, error) {
	info, err := os.Stat(full)
	if err != nil {
		return Item{}, false, err
	}
	var filePath, name string
	switch kind {
	case KindSkill:
		if !info.IsDir() {
			return Item{}, false, nil
		}
		filePath = filepath.Join(full, "SKILL.md")
		if _, err := os.Stat(filePath); err != nil {
			return Item{}, false, nil
		}
		name = info.Name()
	case KindCommand:
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".md") {
			return Item{}, false, nil
		}
		filePath = full
		name = strings.TrimSuffix(info.Name(), ".md")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return Item{}, false, err
	}
	fm, _ := SplitFrontmatter(string(data))
	displayName := fm["name"]
	if displayName == "" {
		displayName = name
	}
	readOnly := source == SourcePlugin
	return Item{
		ID:          fmt.Sprintf("%s:%s:%s", source, kind, filePath),
		Kind:        kind,
		Name:        displayName,
		Description: fm["description"],
		Source:      source,
		PluginName:  pluginName,
		ReadOnly:    readOnly,
		Path:        filePath,
	}, true, nil
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/service.go backend/internal/skills/service_test.go
git commit -m "feat(skills): service lists user skills and commands"
```

---

## Task 4: Backend Service — Plugin Items

**Files:** extend `service_test.go`, no new file needed (code already supports plugin roots — this task asserts behavior).

- [ ] **Step 1: Add failing test**

```go
func TestServiceListPlugin(t *testing.T) {
	tmp := t.TempDir()
	// simulate plugin cache layout
	pluginSkills := filepath.Join(tmp, "plugins", "cache", "caveman", "1.0.0", "skills")
	writeFile(t, filepath.Join(pluginSkills, "caveman", "SKILL.md"),
		"---\nname: caveman\ndescription: talk caveman\n---\nbody")

	svc := NewService(Roots{Readable: []string{pluginSkills}})
	items, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	it := items[0]
	if it.Source != SourcePlugin || !it.ReadOnly || it.PluginName != "caveman" {
		t.Errorf("unexpected plugin item: %+v", it)
	}
}
```

- [ ] **Step 2: Run, expect PASS** (already supported — if it fails, fix `pluginNameFromRoot`).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/skills/service_test.go
git commit -m "test(skills): plugin items marked read-only with plugin name"
```

---

## Task 5: Backend Service — Read/Write Content

**Files:** extend `service.go` and `service_test.go`.

- [ ] **Step 1: Failing test**

```go
func TestServiceReadWriteContent(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: one\n---\nbody one")

	svc := NewService(Roots{Writable: []string{skillsRoot}})
	path := filepath.Join(skillsRoot, "alpha", "SKILL.md")

	c, err := svc.ReadContent(path)
	if err != nil {
		t.Fatal(err)
	}
	if c.Frontmatter["name"] != "alpha" || c.Body != "body one" {
		t.Errorf("unexpected content: %+v", c)
	}

	updated := "---\nname: alpha\ndescription: two\n---\nbody two"
	c2, err := svc.WriteContent(path, updated)
	if err != nil {
		t.Fatal(err)
	}
	if c2.Frontmatter["description"] != "two" || c2.Body != "body two" {
		t.Errorf("unexpected write result: %+v", c2)
	}

	// verify file on disk
	raw, _ := os.ReadFile(path)
	if string(raw) != updated {
		t.Errorf("file not updated: %q", string(raw))
	}

	// reject path outside writable roots
	if _, err := svc.WriteContent(filepath.Join(tmp, "evil.md"), "x"); err == nil {
		t.Error("expected rejection for write outside writable roots")
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Add to `service.go`:

```go
func (s *Service) ReadContent(path string) (Content, error) {
	resolved, err := ResolveReadable(path, s.roots)
	if err != nil {
		return Content{}, err
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return Content{}, err
	}
	fm, body := SplitFrontmatter(string(data))
	return Content{Path: resolved, Body: body, Frontmatter: fm}, nil
}

func (s *Service) WriteContent(path, content string) (Content, error) {
	resolved, err := ResolveWritable(path, s.roots)
	if err != nil {
		return Content{}, err
	}
	if err := os.WriteFile(resolved, []byte(content), 0o644); err != nil {
		return Content{}, err
	}
	fm, body := SplitFrontmatter(content)
	return Content{Path: resolved, Body: body, Frontmatter: fm}, nil
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/service.go backend/internal/skills/service_test.go
git commit -m "feat(skills): read and write content with path safety"
```

---

## Task 6: Backend Service — Create

**Files:** extend `service.go` + `service_test.go`.

- [ ] **Step 1: Failing test**

```go
func TestServiceCreateSkill(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")
	if err := os.MkdirAll(skillsRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(commandsRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})

	skill, err := svc.Create(KindSkill, "new-skill", "initial body")
	if err != nil {
		t.Fatal(err)
	}
	if skill.Kind != KindSkill || skill.Name != "new-skill" {
		t.Errorf("unexpected: %+v", skill)
	}
	if _, err := os.Stat(filepath.Join(skillsRoot, "new-skill", "SKILL.md")); err != nil {
		t.Errorf("file not created: %v", err)
	}

	cmd, err := svc.Create(KindCommand, "greet", "")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Kind != KindCommand || cmd.Name != "greet" {
		t.Errorf("unexpected: %+v", cmd)
	}
	if _, err := os.Stat(filepath.Join(commandsRoot, "greet.md")); err != nil {
		t.Errorf("file not created: %v", err)
	}

	// duplicate rejected
	if _, err := svc.Create(KindSkill, "new-skill", ""); err == nil {
		t.Error("expected duplicate rejection")
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Add to `service.go`:

```go
var ErrExists = errors.New("already exists")

func (s *Service) Create(kind ItemKind, name, body string) (Item, error) {
	root, err := s.writableRootFor(kind)
	if err != nil {
		return Item{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Item{}, errors.New("name required")
	}
	var target string
	switch kind {
	case KindSkill:
		dir := filepath.Join(root, name)
		if _, err := os.Stat(dir); err == nil {
			return Item{}, ErrExists
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Item{}, err
		}
		target = filepath.Join(dir, "SKILL.md")
	case KindCommand:
		target = filepath.Join(root, name+".md")
		if _, err := os.Stat(target); err == nil {
			return Item{}, ErrExists
		}
	default:
		return Item{}, errors.New("invalid kind")
	}
	fm := map[string]string{"name": name, "description": ""}
	content := AssembleFrontmatter(fm, body)
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return Item{}, err
	}
	item, _, err := loadItem(containingEntry(target, kind), kind, SourceUser, "")
	return item, err
}

func (s *Service) writableRootFor(kind ItemKind) (string, error) {
	suffix := "skills"
	if kind == KindCommand {
		suffix = "commands"
	}
	for _, r := range s.roots.Writable {
		if filepath.Base(r) == suffix {
			return r, nil
		}
	}
	return "", fmt.Errorf("no writable root for kind %s", kind)
}

func containingEntry(target string, kind ItemKind) string {
	if kind == KindSkill {
		return filepath.Dir(target)
	}
	return target
}
```

Add `"errors"` to the existing import block in `service.go` if not already imported.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/service.go backend/internal/skills/service_test.go
git commit -m "feat(skills): create new skills and commands"
```

---

## Task 7: Backend Service — Rename

**Files:** extend `service.go` + `service_test.go`.

- [ ] **Step 1: Failing test**

```go
func TestServiceRename(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")
	writeFile(t, filepath.Join(skillsRoot, "old", "SKILL.md"),
		"---\nname: old\n---\nbody")
	writeFile(t, filepath.Join(commandsRoot, "old.md"),
		"---\nname: old\n---\nbody")

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})

	newSkill, err := svc.Rename(filepath.Join(skillsRoot, "old", "SKILL.md"), "fresh")
	if err != nil {
		t.Fatal(err)
	}
	if newSkill != filepath.Join(skillsRoot, "fresh", "SKILL.md") {
		t.Errorf("unexpected new path: %s", newSkill)
	}

	newCmd, err := svc.Rename(filepath.Join(commandsRoot, "old.md"), "fresh")
	if err != nil {
		t.Fatal(err)
	}
	if newCmd != filepath.Join(commandsRoot, "fresh.md") {
		t.Errorf("unexpected new path: %s", newCmd)
	}

	// collision
	writeFile(t, filepath.Join(commandsRoot, "taken.md"), "x")
	if _, err := svc.Rename(filepath.Join(commandsRoot, "fresh.md"), "taken"); err == nil {
		t.Error("expected collision error")
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Add to `service.go`:

```go
func (s *Service) Rename(path, newName string) (string, error) {
	resolved, err := ResolveWritable(path, s.roots)
	if err != nil {
		return "", err
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return "", errors.New("name required")
	}
	// Skill: path ends in /<name>/SKILL.md, rename the parent dir.
	if filepath.Base(resolved) == "SKILL.md" {
		parent := filepath.Dir(resolved)
		newDir := filepath.Join(filepath.Dir(parent), newName)
		if _, err := os.Stat(newDir); err == nil {
			return "", ErrExists
		}
		if err := os.Rename(parent, newDir); err != nil {
			return "", err
		}
		return filepath.Join(newDir, "SKILL.md"), nil
	}
	// Command: single .md file; strip incoming extension, re-append.
	newName = strings.TrimSuffix(newName, ".md")
	newPath := filepath.Join(filepath.Dir(resolved), newName+".md")
	if _, err := os.Stat(newPath); err == nil {
		return "", ErrExists
	}
	if err := os.Rename(resolved, newPath); err != nil {
		return "", err
	}
	return newPath, nil
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/service.go backend/internal/skills/service_test.go
git commit -m "feat(skills): rename skills and commands"
```

---

## Task 8: Backend Service — Delete

- [ ] **Step 1: Failing test**

```go
func TestServiceDelete(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	writeFile(t, filepath.Join(skillsRoot, "victim", "SKILL.md"), "body")

	svc := NewService(Roots{Writable: []string{skillsRoot}})
	path := filepath.Join(skillsRoot, "victim", "SKILL.md")
	if err := svc.Delete(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(skillsRoot, "victim")); !os.IsNotExist(err) {
		t.Error("dir still exists")
	}

	// plugin path rejected
	pluginFile := filepath.Join(tmp, "plugins", "cache", "p", "1", "skills", "a", "SKILL.md")
	writeFile(t, pluginFile, "body")
	svcWithPlugin := NewService(Roots{
		Writable: []string{skillsRoot},
		Readable: []string{filepath.Join(tmp, "plugins", "cache", "p", "1", "skills")},
	})
	if err := svcWithPlugin.Delete(pluginFile); err == nil {
		t.Error("expected rejection for plugin delete")
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Add to `service.go`:

```go
func (s *Service) Delete(path string) error {
	resolved, err := ResolveWritable(path, s.roots)
	if err != nil {
		return err
	}
	if filepath.Base(resolved) == "SKILL.md" {
		return os.RemoveAll(filepath.Dir(resolved))
	}
	return os.Remove(resolved)
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/service.go backend/internal/skills/service_test.go
git commit -m "feat(skills): delete user items, reject plugin paths"
```

---

## Task 9: Backend HTTP Handler

**Files:**
- Create: `backend/internal/skills/handler.go`
- Test: `backend/internal/skills/handler_test.go`

**Integration with projects:** The handler needs to resolve project-scoped roots by `projectId`. We reuse `project.Store` via a minimal interface.

- [ ] **Step 1: Failing test**

```go
// backend/internal/skills/handler_test.go
package skills

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

type fakeProjectLookup struct {
	byID map[string]string
}

func (f *fakeProjectLookup) ProjectPath(id string) (string, bool) {
	p, ok := f.byID[id]
	return p, ok
}

func TestHandlerListGlobal(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	skillsRoot := filepath.Join(tmp, ".claude", "skills")
	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: d\n---\nbody")

	h := NewHandler(&fakeProjectLookup{})
	req := httptest.NewRequest("GET", "/api/skills?scope=global", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []Item `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Items) != 1 || resp.Items[0].Name != "alpha" {
		t.Errorf("unexpected items: %+v", resp.Items)
	}
}

func TestHandlerListProject(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp) // global roots empty
	projectPath := filepath.Join(tmp, "my-proj")
	writeFile(t, filepath.Join(projectPath, ".claude", "skills", "p", "SKILL.md"),
		"---\nname: p\n---\nbody")

	h := NewHandler(&fakeProjectLookup{byID: map[string]string{"proj-1": projectPath}})
	req := httptest.NewRequest("GET", "/api/skills?scope=project&projectId=proj-1", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []Item `json:"items"`
	}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.Items) != 1 || resp.Items[0].Name != "p" {
		t.Errorf("unexpected: %+v", resp.Items)
	}
}

func TestHandlerContentReadWrite(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	skillFile := filepath.Join(tmp, ".claude", "skills", "a", "SKILL.md")
	writeFile(t, skillFile, "---\nname: a\n---\nbody")

	h := NewHandler(&fakeProjectLookup{})

	// read
	req := httptest.NewRequest("GET", "/api/skills/content?scope=global&path="+skillFile, nil)
	rec := httptest.NewRecorder()
	h.ReadContent(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("read status %d body %s", rec.Code, rec.Body.String())
	}

	// write
	newContent := "---\nname: a\ndescription: updated\n---\nnew body"
	body, _ := json.Marshal(map[string]string{
		"scope":   "global",
		"path":    skillFile,
		"content": newContent,
	})
	req = httptest.NewRequest("PUT", "/api/skills/content", bytes.NewReader(body))
	rec = httptest.NewRecorder()
	h.WriteContent(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("write status %d body %s", rec.Code, rec.Body.String())
	}
	raw, _ := os.ReadFile(skillFile)
	if string(raw) != newContent {
		t.Errorf("file mismatch: %s", string(raw))
	}
}

func TestHandlerRejectsWriteOutsideRoot(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	evil := filepath.Join(tmp, "evil.md")
	body, _ := json.Marshal(map[string]string{
		"scope":   "global",
		"path":    evil,
		"content": "pwn",
	})
	h := NewHandler(&fakeProjectLookup{})
	req := httptest.NewRequest("PUT", "/api/skills/content", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.WriteContent(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement handler**

```go
// backend/internal/skills/handler.go
package skills

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

// ProjectLookup is the minimal interface the handler needs to resolve a
// project's root path from its ID.
type ProjectLookup interface {
	ProjectPath(id string) (string, bool)
}

type Handler struct {
	projects ProjectLookup
}

func NewHandler(projects ProjectLookup) *Handler {
	return &Handler{projects: projects}
}

func (h *Handler) serviceForRequest(r *http.Request) (*Service, error) {
	scope := r.URL.Query().Get("scope")
	switch scope {
	case "global":
		return NewService(GlobalRoots()), nil
	case "project":
		id := r.URL.Query().Get("projectId")
		if id == "" {
			return nil, errors.New("projectId required")
		}
		path, ok := h.projects.ProjectPath(id)
		if !ok {
			return nil, errors.New("project not found")
		}
		return NewService(ProjectRoots(path)), nil
	}
	return nil, errors.New("scope required")
}

func (h *Handler) serviceForBody(scope, projectID string) (*Service, error) {
	switch scope {
	case "global":
		return NewService(GlobalRoots()), nil
	case "project":
		path, ok := h.projects.ProjectPath(projectID)
		if !ok {
			return nil, errors.New("project not found")
		}
		return NewService(ProjectRoots(path)), nil
	}
	return nil, errors.New("scope required")
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	items, err := svc.List()
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []Item{}
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) ReadContent(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	path := r.URL.Query().Get("path")
	c, err := svc.ReadContent(path)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

type writeBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
	Content   string `json:"content"`
}

func (h *Handler) WriteContent(w http.ResponseWriter, r *http.Request) {
	var body writeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	c, err := svc.WriteContent(body.Path, body.Content)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

type createBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Body      string `json:"body"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var body createBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := svc.Create(ItemKind(body.Kind), body.Name, body.Body)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, item)
}

type renameBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
	NewName   string `json:"newName"`
}

func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var body renameBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	newPath, err := svc.Rename(body.Path, body.NewName)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"newPath": newPath})
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	path := r.URL.Query().Get("path")
	if err := svc.Delete(path); err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/skills", h.List)
	mux.HandleFunc("GET /api/skills/content", h.ReadContent)
	mux.HandleFunc("PUT /api/skills/content", h.WriteContent)
	mux.HandleFunc("POST /api/skills", h.Create)
	mux.HandleFunc("POST /api/skills/rename", h.Rename)
	mux.HandleFunc("DELETE /api/skills", h.Delete)
}

// GlobalRoots returns roots under $HOME/.claude.
func GlobalRoots() Roots {
	home, _ := os.UserHomeDir()
	base := filepath.Join(home, ".claude")
	r := Roots{
		Writable: []string{
			filepath.Join(base, "skills"),
			filepath.Join(base, "commands"),
		},
	}
	r.Readable = append(r.Readable, discoverPluginRoots(filepath.Join(base, "plugins", "cache"))...)
	return r
}

// ProjectRoots returns roots under <projectPath>/.claude.
func ProjectRoots(projectPath string) Roots {
	base := filepath.Join(projectPath, ".claude")
	r := Roots{
		Writable: []string{
			filepath.Join(base, "skills"),
			filepath.Join(base, "commands"),
		},
	}
	r.Readable = append(r.Readable, discoverPluginRoots(filepath.Join(base, "plugins", "cache"))...)
	return r
}

func discoverPluginRoots(cacheDir string) []string {
	var out []string
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return out
	}
	for _, plugin := range entries {
		if !plugin.IsDir() {
			continue
		}
		versions, _ := os.ReadDir(filepath.Join(cacheDir, plugin.Name()))
		for _, v := range versions {
			if !v.IsDir() {
				continue
			}
			base := filepath.Join(cacheDir, plugin.Name(), v.Name())
			if st, err := os.Stat(filepath.Join(base, "skills")); err == nil && st.IsDir() {
				out = append(out, filepath.Join(base, "skills"))
			}
			if st, err := os.Stat(filepath.Join(base, "commands")); err == nil && st.IsDir() {
				out = append(out, filepath.Join(base, "commands"))
			}
		}
	}
	return out
}

func classify(err error) int {
	if errors.Is(err, ErrForbiddenPath) {
		return http.StatusForbidden
	}
	if errors.Is(err, ErrExists) {
		return http.StatusConflict
	}
	if errors.Is(err, os.ErrNotExist) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && go test ./internal/skills/...`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/skills/handler.go backend/internal/skills/handler_test.go
git commit -m "feat(skills): HTTP handler with scope and path safety"
```

---

## Task 10: Wire Backend Into Server

**Files:**
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/internal/project/store.go` — add small `ProjectPath(id)` helper if missing.

- [ ] **Step 1: Check `project.Store` for a path lookup**

Run: `grep -n "func (s \*Store)" backend/internal/project/store.go`

If `Get(id)` already returns a struct with `Path`, write a tiny adapter. Otherwise add `ProjectPath(id string) (string, bool)`.

- [ ] **Step 2: Add adapter test (if new method added)**

If you added `ProjectPath`, add to `store_test.go`:

```go
func TestStoreProjectPath(t *testing.T) {
	s := NewStore(NewStubGit())
	p, err := s.Create(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path, ok := s.ProjectPath(p.ID)
	if !ok || path != p.Path {
		t.Errorf("ProjectPath mismatch: %s %v", path, ok)
	}
	if _, ok := s.ProjectPath("bogus"); ok {
		t.Error("expected miss")
	}
}
```

- [ ] **Step 3: Implement helper if needed**

```go
// backend/internal/project/store.go (append near Get)
func (s *Store) ProjectPath(id string) (string, bool) {
	p, ok := s.Get(id)
	if !ok {
		return "", false
	}
	return p.Path, true
}
```

- [ ] **Step 4: Wire handler in `main.go`**

Add import `"github.com/jackuait/agent-desk/backend/internal/skills"` and near existing handler wiring:

```go
skillsHandler := skills.NewHandler(projectStore)
skillsHandler.RegisterRoutes(mux)
```

- [ ] **Step 5: Build + run tests**

```bash
cd backend && go build ./... && go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add backend/cmd/server/main.go backend/internal/project/store.go backend/internal/project/store_test.go
git commit -m "feat(skills): wire handler into server"
```

---

## Task 11: Frontend — Install Milkdown

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

```bash
cd frontend && yarn add @milkdown/core @milkdown/react @milkdown/preset-commonmark @milkdown/preset-gfm @milkdown/theme-nord @milkdown/ctx @milkdown/prose
```

- [ ] **Step 2: Verify build still passes**

```bash
cd frontend && yarn build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/yarn.lock
git commit -m "chore(skills): add milkdown dependencies"
```

---

## Task 12: Frontend — Types + API Client

**Files:**
- Create: `frontend/src/features/skills/types.ts`
- Create: `frontend/src/features/skills/skills-api.ts`

- [ ] **Step 1: Define types**

```ts
// frontend/src/features/skills/types.ts
export type SkillKind = "skill" | "command";
export type SkillSource = "user" | "plugin";

export interface SkillItem {
  id: string;
  kind: SkillKind;
  name: string;
  description: string;
  source: SkillSource;
  pluginName?: string;
  readOnly: boolean;
  path: string;
}

export interface SkillContent {
  path: string;
  body: string;
  frontmatter: Record<string, string>;
}

export type SkillScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

export function scopeQuery(scope: SkillScope): string {
  if (scope.kind === "global") return "scope=global";
  return `scope=project&projectId=${encodeURIComponent(scope.projectId)}`;
}
```

- [ ] **Step 2: API client**

```ts
// frontend/src/features/skills/skills-api.ts
import type { SkillContent, SkillItem, SkillKind, SkillScope } from "./types";
import { scopeQuery } from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function scopeBody(scope: SkillScope): Record<string, string> {
  return scope.kind === "global"
    ? { scope: "global" }
    : { scope: "project", projectId: scope.projectId };
}

export const skillsApi = {
  list(scope: SkillScope): Promise<{ items: SkillItem[] }> {
    return request(`/skills?${scopeQuery(scope)}`);
  },
  readContent(scope: SkillScope, path: string): Promise<SkillContent> {
    return request(
      `/skills/content?${scopeQuery(scope)}&path=${encodeURIComponent(path)}`,
    );
  },
  writeContent(scope: SkillScope, path: string, content: string): Promise<SkillContent> {
    return request("/skills/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), path, content }),
    });
  },
  create(scope: SkillScope, kind: SkillKind, name: string, body = ""): Promise<SkillItem> {
    return request("/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), kind, name, body }),
    });
  },
  rename(scope: SkillScope, path: string, newName: string): Promise<{ newPath: string }> {
    return request("/skills/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), path, newName }),
    });
  },
  delete(scope: SkillScope, path: string): Promise<void> {
    return request(`/skills?${scopeQuery(scope)}&path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
  },
};
```

- [ ] **Step 3: Commit** (no tests yet — pure types + thin client)

```bash
git add frontend/src/features/skills/types.ts frontend/src/features/skills/skills-api.ts
git commit -m "feat(skills): frontend types and api client"
```

---

## Task 13: Frontend — `use-skills` Hook (TDD)

**Files:**
- Create: `frontend/src/features/skills/use-skills.ts`
- Test: `frontend/src/features/skills/use-skills.test.ts`

- [ ] **Step 1: Failing test**

```ts
// frontend/src/features/skills/use-skills.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSkills } from "./use-skills";
import { skillsApi } from "./skills-api";
import type { SkillItem, SkillContent } from "./types";

vi.mock("./skills-api", () => ({
  skillsApi: {
    list: vi.fn(),
    readContent: vi.fn(),
    writeContent: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
}));

const mocked = skillsApi as unknown as {
  list: ReturnType<typeof vi.fn>;
  readContent: ReturnType<typeof vi.fn>;
  writeContent: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const item: SkillItem = {
  id: "user:skill:/x/SKILL.md",
  kind: "skill",
  name: "alpha",
  description: "",
  source: "user",
  readOnly: false,
  path: "/x/SKILL.md",
};

const content: SkillContent = {
  path: "/x/SKILL.md",
  body: "body",
  frontmatter: { name: "alpha" },
};

beforeEach(() => {
  mocked.list.mockResolvedValue({ items: [item] });
  mocked.readContent.mockResolvedValue(content);
  mocked.writeContent.mockImplementation(async (_s, _p, c) => ({
    path: "/x/SKILL.md",
    body: c.split("---\n").slice(2).join("---\n"),
    frontmatter: { name: "alpha" },
  }));
});

afterEach(() => vi.clearAllMocks());

describe("useSkills", () => {
  it("loads list on mount", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mocked.list).toHaveBeenCalledWith({ kind: "global" });
  });

  it("selecting an item loads content", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.select(item);
    });
    expect(result.current.selected?.path).toBe("/x/SKILL.md");
    expect(result.current.draftBody).toBe("body");
    expect(result.current.isDirty).toBe(false);
  });

  it("editing sets dirty and save clears it", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.select(item);
    });
    act(() => result.current.setDraftBody("new body"));
    expect(result.current.isDirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.isDirty).toBe(false);
    expect(mocked.writeContent).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd frontend && yarn test use-skills
```

- [ ] **Step 3: Implement**

```ts
// frontend/src/features/skills/use-skills.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { skillsApi } from "./skills-api";
import type { SkillContent, SkillItem, SkillKind, SkillScope } from "./types";

export function useSkills(scope: SkillScope) {
  const [items, setItems] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SkillItem | null>(null);
  const [loadedContent, setLoadedContent] = useState<SkillContent | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftFrontmatter, setDraftFrontmatter] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skillsApi.list(scope);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback(async (item: SkillItem) => {
    setSelected(item);
    const c = await skillsApi.readContent(scope, item.path);
    setLoadedContent(c);
    setDraftBody(c.body);
    setDraftFrontmatter(c.frontmatter);
  }, [scope]);

  const isDirty = useMemo(() => {
    if (!loadedContent) return false;
    if (draftBody !== loadedContent.body) return true;
    const keys = new Set([
      ...Object.keys(loadedContent.frontmatter),
      ...Object.keys(draftFrontmatter),
    ]);
    for (const k of keys) {
      if ((loadedContent.frontmatter[k] ?? "") !== (draftFrontmatter[k] ?? "")) return true;
    }
    return false;
  }, [loadedContent, draftBody, draftFrontmatter]);

  const save = useCallback(async () => {
    if (!selected || !loadedContent) return;
    const assembled = assemble(draftFrontmatter, draftBody);
    const c = await skillsApi.writeContent(scope, selected.path, assembled);
    setLoadedContent(c);
    setDraftBody(c.body);
    setDraftFrontmatter(c.frontmatter);
  }, [scope, selected, loadedContent, draftFrontmatter, draftBody]);

  const revert = useCallback(() => {
    if (!loadedContent) return;
    setDraftBody(loadedContent.body);
    setDraftFrontmatter(loadedContent.frontmatter);
  }, [loadedContent]);

  const create = useCallback(async (kind: SkillKind, name: string) => {
    const item = await skillsApi.create(scope, kind, name);
    setItems((prev) => [...prev, item]);
    await select(item);
    return item;
  }, [scope, select]);

  const rename = useCallback(async (item: SkillItem, newName: string) => {
    const { newPath } = await skillsApi.rename(scope, item.path, newName);
    await refresh();
    const next = items.find((i) => i.path === newPath) ?? null;
    if (next) setSelected(next);
    return newPath;
  }, [scope, refresh, items]);

  const remove = useCallback(async (item: SkillItem) => {
    await skillsApi.delete(scope, item.path);
    setItems((prev) => prev.filter((i) => i.path !== item.path));
    if (selected?.path === item.path) {
      setSelected(null);
      setLoadedContent(null);
      setDraftBody("");
      setDraftFrontmatter({});
    }
  }, [scope, selected]);

  return {
    items,
    loading,
    selected,
    loadedContent,
    draftBody,
    draftFrontmatter,
    isDirty,
    refresh,
    select,
    setDraftBody,
    setDraftFrontmatter,
    save,
    revert,
    create,
    rename,
    remove,
  };
}

function assemble(fm: Record<string, string>, body: string): string {
  const keys = Object.keys(fm).filter((k) => fm[k] !== undefined);
  if (keys.length === 0) return body;
  keys.sort();
  const lines = keys.map((k) => `${k}: ${fm[k]}`).join("\n");
  return `---\n${lines}\n---\n${body}`;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/use-skills.ts frontend/src/features/skills/use-skills.test.ts
git commit -m "feat(skills): use-skills hook with dirty tracking"
```

---

## Task 14: Frontend — SkillsList Component

**Files:**
- Create: `SkillsList.tsx`, `SkillsList.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// frontend/src/features/skills/SkillsList.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillsList } from "./SkillsList";
import type { SkillItem } from "./types";

const items: SkillItem[] = [
  { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a" },
  { id: "2", kind: "skill", name: "beta", description: "", source: "plugin", pluginName: "superpowers", readOnly: true, path: "/b" },
];

describe("SkillsList", () => {
  it("groups user and plugin items and calls onSelect", () => {
    const onSelect = vi.fn();
    render(
      <SkillsList
        items={items}
        kind="skill"
        selectedPath={null}
        onSelect={onSelect}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Plugin: superpowers")).toBeInTheDocument();

    fireEvent.click(screen.getByText("alpha"));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("filters by query", () => {
    render(
      <SkillsList
        items={items}
        kind="skill"
        selectedPath={null}
        onSelect={() => {}}
        query="bet"
        onQueryChange={() => {}}
      />,
    );
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/SkillsList.tsx
import { LockIcon } from "lucide-react";
import type { SkillItem, SkillKind } from "./types";

interface Props {
  items: SkillItem[];
  kind: SkillKind;
  selectedPath: string | null;
  onSelect: (item: SkillItem) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SkillsList({ items, kind, selectedPath, onSelect, query, onQueryChange }: Props) {
  const filtered = items
    .filter((i) => i.kind === kind)
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  const groups = new Map<string, SkillItem[]>();
  for (const item of filtered) {
    const label = item.source === "user" ? "User" : `Plugin: ${item.pluginName ?? "unknown"}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return (
    <div className="flex h-full w-[280px] flex-col border-r border-border-card">
      <div className="p-3">
        <input
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {[...groups.entries()].map(([label, groupItems]) => (
          <div key={label} className="mb-4">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-muted">
              {label}
            </div>
            {groupItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                data-active={item.path === selectedPath ? "true" : "false"}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text-secondary transition data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary hover:text-text-primary"
              >
                {item.readOnly && <LockIcon width={12} height={12} className="shrink-0 text-text-muted" />}
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/SkillsList.tsx frontend/src/features/skills/SkillsList.test.tsx
git commit -m "feat(skills): SkillsList with grouping and search"
```

---

## Task 15: Frontend — FrontmatterForm

**Files:**
- Create: `FrontmatterForm.tsx`, `FrontmatterForm.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// frontend/src/features/skills/FrontmatterForm.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrontmatterForm } from "./FrontmatterForm";

describe("FrontmatterForm", () => {
  it("edits name and description", () => {
    const onChange = vi.fn();
    render(
      <FrontmatterForm
        value={{ name: "a", description: "b" }}
        onChange={onChange}
        readOnly={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "foo" } });
    expect(onChange).toHaveBeenCalledWith({ name: "foo", description: "b" });
  });

  it("disables inputs when readOnly", () => {
    render(
      <FrontmatterForm
        value={{ name: "a", description: "b" }}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(screen.getByLabelText("name")).toBeDisabled();
    expect(screen.getByLabelText("description")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/FrontmatterForm.tsx
interface Props {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  readOnly: boolean;
}

export function FrontmatterForm({ value, onChange, readOnly }: Props) {
  const update = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-text-muted">
        name
        <input
          aria-label="name"
          value={value.name ?? ""}
          disabled={readOnly}
          onChange={(e) => update("name", e.target.value)}
          className="rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-text-muted">
        description
        <input
          aria-label="description"
          value={value.description ?? ""}
          disabled={readOnly}
          onChange={(e) => update("description", e.target.value)}
          className="rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case text-text-primary"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/FrontmatterForm.tsx frontend/src/features/skills/FrontmatterForm.test.tsx
git commit -m "feat(skills): FrontmatterForm component"
```

---

## Task 16: Frontend — SkillMarkdownEditor (Milkdown + Raw Toggle)

**Files:**
- Create: `SkillMarkdownEditor.tsx`, `SkillMarkdownEditor.test.tsx`

- [ ] **Step 1: Failing test** — focus on behavior, not Milkdown internals. Start in raw mode (default false), test raw round-trip + readOnly.

```tsx
// frontend/src/features/skills/SkillMarkdownEditor.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillMarkdownEditor } from "./SkillMarkdownEditor";

describe("SkillMarkdownEditor", () => {
  it("raw toggle shows a textarea that edits the value", () => {
    const onChange = vi.fn();
    render(<SkillMarkdownEditor value="hello" onChange={onChange} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: /raw/i }));
    const textarea = screen.getByLabelText("raw markdown") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    fireEvent.change(textarea, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalledWith("world");
  });

  it("readOnly disables raw textarea", () => {
    render(<SkillMarkdownEditor value="hello" onChange={() => {}} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: /raw/i }));
    expect(screen.getByLabelText("raw markdown")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Milkdown setup uses lazy init. Keep rendered mode in a lightweight wrapper; raw mode is a plain textarea.

```tsx
// frontend/src/features/skills/SkillMarkdownEditor.tsx
import { useState, useEffect, useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}

export function SkillMarkdownEditor({ value, onChange, readOnly }: Props) {
  const [raw, setRaw] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border-card px-3 py-1">
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          className="rounded-md px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          {raw ? "Rendered" : "Raw"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {raw ? (
          <textarea
            aria-label="raw markdown"
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none bg-bg-card p-4 font-mono text-[13px] text-text-primary outline-none"
          />
        ) : (
          <MilkdownView value={value} onChange={onChange} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}

function MilkdownView({ value, onChange, readOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const latestValue = useRef(value);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) return;
    let mounted = true;
    const host = hostRef.current;
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, latestValue.current);
        ctx.set(editorViewOptionsCtx, { editable: () => !readOnly });
        ctx.get(listenerCtx).markdownUpdated((_, md) => {
          if (md !== latestValue.current) {
            latestValue.current = md;
            onChange(md);
          }
        });
      })
      .use(nord)
      .use(commonmark)
      .use(gfm)
      .use(listener);
    editor.create().then(() => {
      if (mounted) editorRef.current = editor;
    });
    return () => {
      mounted = false;
      editor.destroy();
      host.innerHTML = "";
    };
    // re-create when readOnly flips so editable() picks up change
  }, [readOnly, onChange]);

  return <div ref={hostRef} className="milkdown-host p-4" />;
}
```

**Install the listener plugin** (not in earlier task — add now):

```bash
cd frontend && yarn add @milkdown/plugin-listener
```

Stage the package.json/yarn.lock changes with the rest of this task's commit.

- [ ] **Step 4: Run, expect PASS**

Run: `cd frontend && yarn test SkillMarkdownEditor`

Milkdown view isn't exercised by the raw-path tests, so JSDOM limitations around prose-mirror don't block them. Add a `vi.mock("./SkillMarkdownEditor", async (orig) => ...)` shim only if tests import the component tree in a way that triggers Milkdown. The two tests above use raw mode directly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/SkillMarkdownEditor.tsx \
        frontend/src/features/skills/SkillMarkdownEditor.test.tsx \
        frontend/package.json frontend/yarn.lock
git commit -m "feat(skills): Milkdown editor with raw toggle"
```

---

## Task 17: Frontend — SkillEditor (Right Pane)

**Files:**
- Create: `SkillEditor.tsx`, `SkillEditor.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// frontend/src/features/skills/SkillEditor.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillEditor } from "./SkillEditor";
import type { SkillItem } from "./types";

// Milkdown pulled in transitively — stub it.
vi.mock("./SkillMarkdownEditor", () => ({
  SkillMarkdownEditor: ({ value, onChange, readOnly }: any) => (
    <textarea
      aria-label="body"
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const item: SkillItem = {
  id: "1",
  kind: "skill",
  name: "alpha",
  description: "",
  source: "user",
  readOnly: false,
  path: "/a/SKILL.md",
};

describe("SkillEditor", () => {
  it("shows save button disabled when clean, enabled when dirty", () => {
    const onSave = vi.fn();
    render(
      <SkillEditor
        item={item}
        frontmatter={{ name: "alpha" }}
        onFrontmatterChange={() => {}}
        body="hello"
        onBodyChange={() => {}}
        isDirty={false}
        onSave={onSave}
        onRevert={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("plugin item hides delete and shows read-only banner", () => {
    const plugin = { ...item, source: "plugin" as const, readOnly: true, pluginName: "superpowers" };
    render(
      <SkillEditor
        item={plugin}
        frontmatter={{ name: "alpha" }}
        onFrontmatterChange={() => {}}
        body="hello"
        onBodyChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        onRevert={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/SkillEditor.tsx
import type { SkillItem } from "./types";
import { FrontmatterForm } from "./FrontmatterForm";
import { SkillMarkdownEditor } from "./SkillMarkdownEditor";

interface Props {
  item: SkillItem;
  frontmatter: Record<string, string>;
  onFrontmatterChange: (next: Record<string, string>) => void;
  body: string;
  onBodyChange: (next: string) => void;
  isDirty: boolean;
  onSave: () => void;
  onRevert: () => void;
  onDelete: () => void;
}

export function SkillEditor({
  item,
  frontmatter,
  onFrontmatterChange,
  body,
  onBodyChange,
  isDirty,
  onSave,
  onRevert,
  onDelete,
}: Props) {
  const readOnly = item.readOnly;
  return (
    <div className="flex h-full flex-1 flex-col">
      {readOnly && (
        <div className="border-b border-border-card bg-bg-hover px-4 py-2 text-[12px] text-text-secondary">
          Plugin {item.kind} — read-only
        </div>
      )}
      <FrontmatterForm value={frontmatter} onChange={onFrontmatterChange} readOnly={readOnly} />
      <div className="flex-1 overflow-hidden">
        <SkillMarkdownEditor value={body} onChange={onBodyChange} readOnly={readOnly} />
      </div>
      <div className="flex items-center justify-between border-t border-border-card px-4 py-2">
        <div className="text-[11px] text-text-muted">{item.path}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRevert}
            disabled={!isDirty || readOnly}
            className="rounded-md px-3 py-1 text-[12px] text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || readOnly}
            className="rounded-md bg-text-primary px-3 py-1 text-[12px] text-bg-page transition disabled:opacity-40"
          >
            Save
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-1 text-[12px] text-red-500 transition hover:bg-bg-hover"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/SkillEditor.tsx frontend/src/features/skills/SkillEditor.test.tsx
git commit -m "feat(skills): SkillEditor right pane"
```

---

## Task 18: Frontend — NewSkillDialog + DeleteSkillConfirm

**Files:**
- Create: `NewSkillDialog.tsx`, `NewSkillDialog.test.tsx`, `DeleteSkillConfirm.tsx`

- [ ] **Step 1: NewSkillDialog failing test**

```tsx
// frontend/src/features/skills/NewSkillDialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewSkillDialog } from "./NewSkillDialog";

describe("NewSkillDialog", () => {
  it("submits selected kind and name", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NewSkillDialog open onClose={() => {}} onCreate={onCreate} defaultKind="skill" />);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "my-skill" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith("skill", "my-skill");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/NewSkillDialog.tsx
import { useState } from "react";
import type { SkillKind } from "./types";

interface Props {
  open: boolean;
  defaultKind: SkillKind;
  onClose: () => void;
  onCreate: (kind: SkillKind, name: string) => Promise<void>;
}

export function NewSkillDialog({ open, defaultKind, onClose, onCreate }: Props) {
  const [kind, setKind] = useState<SkillKind>(defaultKind);
  const [name, setName] = useState("");
  if (!open) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(kind, name.trim());
    setName("");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="w-80 rounded-lg bg-bg-card p-4">
        <div className="mb-2 text-[13px] font-semibold text-text-primary">New {kind}</div>
        <label className="mb-2 block text-[11px] uppercase tracking-wide text-text-muted">
          kind
          <select
            aria-label="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SkillKind)}
            className="mt-1 w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case"
          >
            <option value="skill">skill</option>
            <option value="command">command</option>
          </select>
        </label>
        <label className="mb-3 block text-[11px] uppercase tracking-wide text-text-muted">
          name
          <input
            aria-label="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-[12px]">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-text-primary px-3 py-1 text-[12px] text-bg-page">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: DeleteSkillConfirm (no new test — simple enough, covered by SkillsDialog test later)**

```tsx
// frontend/src/features/skills/DeleteSkillConfirm.tsx
interface Props {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSkillConfirm({ open, name, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-lg bg-bg-card p-4">
        <div className="mb-3 text-[13px] text-text-primary">Delete “{name}”?</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1 text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-3 py-1 text-[12px] text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/skills/NewSkillDialog.tsx \
        frontend/src/features/skills/NewSkillDialog.test.tsx \
        frontend/src/features/skills/DeleteSkillConfirm.tsx
git commit -m "feat(skills): new-skill dialog and delete confirm"
```

---

## Task 19: Frontend — SkillsDialog Shell

**Files:**
- Create: `SkillsDialog.tsx`, `SkillsDialog.test.tsx`, `SkillsDialog.module.css`, `index.ts`

- [ ] **Step 1: Failing test**

```tsx
// frontend/src/features/skills/SkillsDialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SkillsDialog } from "./SkillsDialog";
import { skillsApi } from "./skills-api";

vi.mock("./SkillMarkdownEditor", () => ({
  SkillMarkdownEditor: ({ value, onChange, readOnly }: any) => (
    <textarea
      aria-label="body"
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("./skills-api", () => ({
  skillsApi: {
    list: vi.fn(),
    readContent: vi.fn(),
    writeContent: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
}));

const mocked = skillsApi as any;

describe("SkillsDialog", () => {
  it("lists skills and loads content on click", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: { name: "alpha" } });

    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("hi"));
  });

  it("switching tab filters by kind", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/s/a/SKILL.md" },
        { id: "2", kind: "command", name: "greet", description: "", source: "user", readOnly: false, path: "/c/greet.md" },
      ],
    });
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /commands/i }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("greet")).toBeInTheDocument();
  });

  it("dirty-close shows confirm", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: {} });

    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect(screen.getByLabelText("body")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/SkillsDialog.tsx
import { useState } from "react";
import { X } from "lucide-react";
import type { SkillKind, SkillScope } from "./types";
import { useSkills } from "./use-skills";
import { SkillsList } from "./SkillsList";
import { SkillEditor } from "./SkillEditor";
import { NewSkillDialog } from "./NewSkillDialog";
import { DeleteSkillConfirm } from "./DeleteSkillConfirm";

interface Props {
  open: boolean;
  scope: SkillScope;
  onClose: () => void;
}

export function SkillsDialog({ open, scope, onClose }: Props) {
  const skills = useSkills(scope);
  const [kind, setKind] = useState<SkillKind>("skill");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (!open) return null;

  const attemptClose = () => {
    if (skills.isDirty && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  };

  const attemptKindSwitch = (next: SkillKind) => {
    if (skills.isDirty && !window.confirm("Discard unsaved changes?")) return;
    setKind(next);
  };

  const scopeLabel = scope.kind === "global" ? "Global" : "Project";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[80vh] w-[min(1100px,95vw)] flex-col rounded-lg border border-border-card bg-bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border-card px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="font-mono text-[11px] uppercase tracking-wide text-text-muted">{scopeLabel}</div>
            <div role="tablist" className="flex gap-1">
              <button
                role="tab"
                aria-selected={kind === "skill"}
                onClick={() => attemptKindSwitch("skill")}
                className="rounded-md px-2 py-1 text-[12px] text-text-secondary data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary"
                data-active={kind === "skill"}
              >
                Skills
              </button>
              <button
                role="tab"
                aria-selected={kind === "command"}
                onClick={() => attemptKindSwitch("command")}
                className="rounded-md px-2 py-1 text-[12px] text-text-secondary data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary"
                data-active={kind === "command"}
              >
                Commands
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="rounded-md px-3 py-1 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              + New
            </button>
            <button
              type="button"
              aria-label="close dialog"
              onClick={attemptClose}
              className="rounded-md p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <X width={16} height={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <SkillsList
            items={skills.items}
            kind={kind}
            selectedPath={skills.selected?.path ?? null}
            onSelect={(item) => {
              if (skills.isDirty && !window.confirm("Discard unsaved changes?")) return;
              skills.select(item);
            }}
            query={query}
            onQueryChange={setQuery}
          />
          <div className="flex-1">
            {skills.selected ? (
              <SkillEditor
                item={skills.selected}
                frontmatter={skills.draftFrontmatter}
                onFrontmatterChange={skills.setDraftFrontmatter}
                body={skills.draftBody}
                onBodyChange={skills.setDraftBody}
                isDirty={skills.isDirty}
                onSave={skills.save}
                onRevert={skills.revert}
                onDelete={() => setShowDelete(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
                {skills.loading ? "Loading…" : "Select an item"}
              </div>
            )}
          </div>
        </div>
      </div>
      <NewSkillDialog
        open={showNew}
        defaultKind={kind}
        onClose={() => setShowNew(false)}
        onCreate={async (k, name) => {
          await skills.create(k, name);
          setKind(k);
        }}
      />
      <DeleteSkillConfirm
        open={showDelete}
        name={skills.selected?.name ?? ""}
        onCancel={() => setShowDelete(false)}
        onConfirm={async () => {
          if (skills.selected) await skills.remove(skills.selected);
          setShowDelete(false);
        }}
      />
    </div>
  );
}
```

```ts
// frontend/src/features/skills/index.ts
export { SkillsDialog } from "./SkillsDialog";
export { GlobalSkillsButton } from "./GlobalSkillsButton";
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/SkillsDialog.tsx \
        frontend/src/features/skills/SkillsDialog.test.tsx \
        frontend/src/features/skills/index.ts
git commit -m "feat(skills): SkillsDialog shell"
```

---

## Task 20: Frontend — GlobalSkillsButton + SettingsButton Entry

**Files:**
- Create: `GlobalSkillsButton.tsx`, `GlobalSkillsButton.test.tsx`
- Modify: `frontend/src/features/settings/SettingsButton.tsx`

- [ ] **Step 1: Failing test**

```tsx
// frontend/src/features/skills/GlobalSkillsButton.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalSkillsButton } from "./GlobalSkillsButton";

vi.mock("./SkillsDialog", () => ({
  SkillsDialog: ({ open, scope }: any) =>
    open ? <div data-testid="dialog">{scope.kind}</div> : null,
}));

describe("GlobalSkillsButton", () => {
  it("opens dialog with global scope", () => {
    render(<GlobalSkillsButton />);
    fireEvent.click(screen.getByRole("button", { name: /skills/i }));
    expect(screen.getByTestId("dialog").textContent).toBe("global");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/skills/GlobalSkillsButton.tsx
import { useState } from "react";
import { BookOpenIcon } from "lucide-react";
import { SkillsDialog } from "./SkillsDialog";

export function GlobalSkillsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="skills"
        onClick={() => setOpen(true)}
        className="fixed right-14 top-4 z-40 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
      >
        <BookOpenIcon width={16} height={16} />
      </button>
      <SkillsDialog open={open} scope={{ kind: "global" }} onClose={() => setOpen(false)} />
    </>
  );
}
```

Modify `SettingsButton.tsx` to render `GlobalSkillsButton` sibling:

```tsx
// at top
import { GlobalSkillsButton } from "../skills/GlobalSkillsButton";

// inside the fragment, alongside the existing <button> and <SettingsDialog>
<GlobalSkillsButton />
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/skills/GlobalSkillsButton.tsx \
        frontend/src/features/skills/GlobalSkillsButton.test.tsx \
        frontend/src/features/settings/SettingsButton.tsx
git commit -m "feat(skills): global skills button next to settings"
```

---

## Task 21: Frontend — Per-Project Skills Button

**Files:**
- Modify: `frontend/src/features/project/ProjectSidebar.tsx`
- Modify: `frontend/src/features/project/ProjectSidebar.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// add to ProjectSidebar.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectSidebar } from "./ProjectSidebar";

vi.mock("../skills/SkillsDialog", () => ({
  SkillsDialog: ({ open, scope }: any) =>
    open ? <div data-testid={`dialog-${scope.projectId}`} /> : null,
}));

describe("ProjectSidebar skills button", () => {
  it("opens project-scoped skills dialog", () => {
    render(
      <ProjectSidebar
        projects={[{ id: "p1", title: "One", path: "/p1", colorIdx: 0, createdAt: 0 }]}
        activeId={null}
        onNewProject={() => {}}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /skills for one/i }));
    expect(screen.getByTestId("dialog-p1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

Change `ProjectSidebar.tsx` to render each project row as a `<div>` containing the existing button plus a skills-icon button:

```tsx
import { useState } from "react";
import { BookOpenIcon } from "lucide-react";
import { SkillsDialog } from "../skills/SkillsDialog";
import type { Project } from "../../shared/types/domain";

interface Props {
  projects: Project[];
  activeId: string | null;
  onNewProject: () => void;
  onSelect: (id: string) => void;
}

const COLOR_VARS = [
  "--color-project-1",
  "--color-project-2",
  "--color-project-3",
  "--color-project-4",
  "--color-project-5",
  "--color-project-6",
];

export function ProjectSidebar({ projects, activeId, onNewProject, onSelect }: Props) {
  const [skillsForProjectId, setSkillsForProjectId] = useState<string | null>(null);
  return (
    <aside className="flex w-60 flex-col border-r border-border-card bg-[#f2f0eb]">
      <div className="flex-1 overflow-y-auto py-6">
        {projects.map((p) => {
          const color = `var(${COLOR_VARS[p.colorIdx % 6]})`;
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className="group flex w-full items-center gap-2 pr-2 data-[active=true]:bg-bg-hover"
              data-active={active ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex flex-1 cursor-pointer items-center gap-3 px-5 py-2 text-left font-mono text-[13px] tracking-tight text-text-secondary transition data-[active=true]:text-text-primary hover:text-text-primary"
                data-active={active ? "true" : "false"}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{p.title}</span>
              </button>
              <button
                type="button"
                aria-label={`skills for ${p.title}`}
                onClick={() => setSkillsForProjectId(p.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
              >
                <BookOpenIcon width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border-card p-4">
        <button
          type="button"
          onClick={onNewProject}
          className="w-full cursor-pointer rounded-md px-3 py-2 text-left font-mono text-[12px] text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
        >
          + new project
        </button>
      </div>
      {skillsForProjectId && (
        <SkillsDialog
          open
          scope={{ kind: "project", projectId: skillsForProjectId }}
          onClose={() => setSkillsForProjectId(null)}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd frontend && yarn test ProjectSidebar
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/project/ProjectSidebar.tsx frontend/src/features/project/ProjectSidebar.test.tsx
git commit -m "feat(skills): per-project skills button in sidebar"
```

---

## Task 22: Verification + Smoke

- [ ] **Step 1: Full test suites**

```bash
cd backend && go test ./... && go build ./...
cd ../frontend && yarn test && yarn lint && yarn build
```

All green.

- [ ] **Step 2: Manual smoke (playwright-cli skill)**

1. Start dev server (`yarn dev` in frontend, `go run ./cmd/server` in backend).
2. Click the global skills button in the top-right.
3. Verify list renders `~/.claude/skills/*` and plugin groups.
4. Click a user skill, edit body, click Save, close dialog, re-open, verify persistence.
5. Close dialog, click per-project skills button on a project row — verify scope label says "Project" and list is empty (or contains `<project>/.claude/skills/*`).
6. Create a new skill, type body, save, check file exists under `<project>/.claude/skills/<name>/SKILL.md`.
7. Open a plugin skill — confirm editor is read-only, no Delete button.

- [ ] **Step 3: Commit nothing (verification-only task)**

---

## Self-Review Notes

- **Spec coverage:** Every section of the design has a corresponding task.
  - Architecture → Tasks 1–10 (backend), 11–21 (frontend).
  - Data model → Task 2.
  - API → Tasks 9–10.
  - Frontend components → Tasks 12–21.
  - Editing flow → Tasks 13 + 16–17.
  - Testing plan → every task has backend or frontend tests first.
  - Entry points → Tasks 20, 21.
- **Type consistency:** `SkillItem`, `SkillContent`, `SkillScope`, `SkillKind`, `SkillSource` used identically across tasks; backend types match JSON tags used by frontend.
- **No placeholders** — every step has exact code or exact command.
- **Dependencies added:** Milkdown libs + listener plugin, committed together with Task 16.

## Execution Handoff

Plan complete and saved to `docs/2026-04-14-skills-manager-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session using `executing-plans`.
