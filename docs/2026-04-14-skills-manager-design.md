# Skills & Commands Manager — Design

## Purpose

Let the user view, edit, create, rename, and delete Claude Code **skills** and **commands** at two scopes:

- **Global** — `~/.claude/skills/`, `~/.claude/commands/`, plus plugin-provided skills/commands in `~/.claude/plugins/cache/**` (read-only).
- **Project** — `<project.path>/.claude/skills/`, `<project.path>/.claude/commands/`, plus any project-local plugin caches (read-only).

Opened via two buttons inside agent-desk:

- A global button next to the existing `SettingsButton`.
- A per-project button in each project's sidebar row, next to rename/delete.

Both open the same `SkillsDialog` component, differing only in the `scope` prop.

## Non-Goals

- No authentication, no sync across machines.
- No plugin installation or upgrade.
- No linting/validation beyond frontmatter parsing.
- No rich-text features beyond Markdown (no tables of contents, no exports).

## Architecture

New self-contained feature on both sides:

- **Backend:** `backend/internal/skills/` — handler, service interface, repository interface (per project conventions). Uses stdlib `os`/`filepath`. No ORM.
- **Frontend:** `frontend/src/features/skills/` — flat feature dir with colocated tests, CSS Modules, barrel `index.ts`.

Data flows: UI → `skills-api.ts` → `/api/skills*` → Go handler → filesystem. No background sync; explicit save.

## Data Model

```ts
type SkillScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

interface SkillItem {
  id: string;                          // stable key: scope + kind + relative path
  kind: "skill" | "command";
  name: string;                        // frontmatter.name ?? basename
  description: string;                 // frontmatter.description ?? ""
  source: "user" | "plugin";
  pluginName?: string;                 // e.g. "superpowers", "caveman"
  readOnly: boolean;                   // true iff source === "plugin"
  path: string;                        // absolute file path on disk
}

interface SkillContent {
  path: string;
  body: string;                        // full file including frontmatter
  frontmatter: Record<string, string>; // parsed YAML map
}
```

### File layout conventions

- **Skill** = directory containing `SKILL.md`. Identity is the directory name. Rename = `os.Rename` the directory.
- **Command** = single `<name>.md` file under `commands/`. Rename = rename the file.
- Plugin items discovered by walking `~/.claude/plugins/cache/<plugin>/<version>/skills/**/SKILL.md` and `.../commands/*.md`. `pluginName` derived from the path segment right after `cache/`.

## Backend API

All routes return JSON via `pkg/httputil.JSON`.

```
GET    /api/skills?scope=global
GET    /api/skills?scope=project&projectId=<id>
         → { items: SkillItem[] }   // metadata only, no body

GET    /api/skills/content?path=<abs>
         → SkillContent

PUT    /api/skills/content
         body: { path: string, body: string }   // body includes frontmatter
         → SkillContent                         // re-parsed

POST   /api/skills
         body: { scope, kind, name, body? }
         → SkillItem

POST   /api/skills/rename
         body: { path: string, newName: string }
         → { newPath: string }

DELETE /api/skills?path=<abs>
         → 204
```

### Path safety

Every mutating handler resolves the incoming `path` with `filepath.Clean` + `filepath.Abs` and verifies it is contained within one of the scope's writable roots:

- global writable: `~/.claude/skills`, `~/.claude/commands`
- project writable: `<project.path>/.claude/skills`, `<project.path>/.claude/commands`

Reads additionally allow the plugin-cache roots (read-only). Any `../` traversal or path outside the allow-list returns `403`. Writes targeting a plugin-cache path return `403` regardless of what the client sent.

### Frontmatter

Minimal parser: detect leading `---\n...\n---\n`, split lines, `key: value` pairs. No nested YAML (skills only use flat frontmatter in practice). If absent, `frontmatter` is `{}` and body is the entire file.

## Frontend

### Feature directory

```
frontend/src/features/skills/
  SkillsDialog.tsx
  SkillsDialog.test.tsx
  SkillsList.tsx
  SkillsList.test.tsx
  SkillEditor.tsx
  SkillEditor.test.tsx
  SkillMarkdownEditor.tsx        // Milkdown wrapper + raw toggle
  SkillMarkdownEditor.test.tsx
  FrontmatterForm.tsx
  FrontmatterForm.test.tsx
  NewSkillDialog.tsx
  NewSkillDialog.test.tsx
  DeleteSkillConfirm.tsx
  use-skills.ts
  use-skills.test.ts
  skills-api.ts
  SkillsDialog.module.css
  index.ts
```

### Dialog layout

Large modal (scaled like existing `SettingsDialog` but wider).

- **Header:** scope label, tabs `Skills | Commands`, `New` button.
- **Left pane (280px):** search input, grouped list:
  - `User` group (writable)
  - `Plugin: <name>` groups (read-only, lock icon per row)
- **Right pane (flex):** item name, frontmatter fields, Milkdown editor, footer with **Save**, **Revert**, **Raw** toggle, **Delete** (hidden for plugin items).

### Editing flow

- On open, fetch `SkillContent`. Split `---\n…\n---\n` into `frontmatter` (structured fields) and `body` (Milkdown source).
- **Rendered mode (default):** Milkdown with `@milkdown/preset-commonmark` + `@milkdown/preset-gfm`. Markdown-in / markdown-out via its serializer — no HTML drift.
- **Raw mode:** plain monospaced `<textarea>` showing the full file including frontmatter. Toggling back parses and re-splits; dirty state preserved both ways.
- **Save:** reassemble `---\n<yaml>\n---\n<body>` and `PUT /api/skills/content`. Server returns canonical frontmatter; UI refreshes.
- **Read-only (plugin):** Milkdown `readOnly: true`, textarea `readOnly`, frontmatter fields disabled, Save/Delete hidden. Top banner: "Plugin skill — read-only."

### Dirty state

- `use-skills.ts` tracks loaded body vs current body. Save enabled when dirty.
- Closing the dialog while dirty shows a confirm (same pattern planned for card edit).
- Switching tabs or selecting a different item while dirty also confirms.

### Create / rename / delete

- **New:** `NewSkillDialog` asks kind (skill/command) and name (slug-validated). Scope inherited from parent. Server creates `SKILL.md` with template frontmatter (`name`, `description: ""`), UI selects it.
- **Rename:** inline rename on list row → `POST /api/skills/rename`. Commands keep their `.md` extension automatically — the handler strips/re-adds it.
- **Delete:** `DeleteSkillConfirm` → `DELETE /api/skills`.

### Entry points

- `SettingsButton` gets a sibling `GlobalSkillsButton` that opens `SkillsDialog scope={ kind: "global" }`.
- `ProjectSidebar` adds a small icon button in each project row, opening `SkillsDialog scope={ kind: "project", projectId }`.

## Dependencies

Frontend adds:

- `@milkdown/core`
- `@milkdown/react`
- `@milkdown/preset-commonmark`
- `@milkdown/preset-gfm`
- `@milkdown/theme-nord` (theme will be overridden via CSS Modules to match Linear/Notion look)

Backend adds no new dependencies (stdlib only).

## Testing

Strict TDD — each new function/handler gets a failing test first.

### Backend (Go, `httptest` + temp dirs)

- `list_test.go` — lists user skills/commands under temp HOME; groups plugin items by plugin name; `readOnly` flag correct.
- `content_test.go` — read returns body + parsed frontmatter; write persists and re-parses.
- `create_test.go` — creates skill (dir + `SKILL.md`) and command (file); rejects duplicate name.
- `rename_test.go` — renames dir/file; rejects collision.
- `delete_test.go` — deletes user item; returns 403 on plugin path.
- `path_safety_test.go` — rejects `../` traversal; rejects writes to plugin cache; rejects paths outside scope roots.

Tests use temp `HOME` and temp project paths — never touch the real `~/.claude`.

### Frontend (Vitest + React Testing Library)

- `use-skills.test.ts` — list load, select, dirty flag, save, create, rename, delete; api mocked.
- `SkillsList.test.tsx` — groups User/Plugin, lock icon on plugin rows, search filter.
- `FrontmatterForm.test.tsx` — edit name/description; disabled when plugin.
- `SkillMarkdownEditor.test.tsx` — raw toggle round-trip preserves content; `readOnly` disables input.
- `SkillsDialog.test.tsx` — dirty-close confirm; tab switch Skills↔Commands keeps state; scope label renders correctly.
- `ProjectSidebar.test.tsx` — per-project button opens dialog with `scope.kind === "project"`.
- Sibling test for the global button — opens dialog with `scope.kind === "global"`.

### Manual smoke (playwright-cli skill)

- Open global dialog, create a skill, edit body, save, reload app, verify persistence.
- Open project dialog on a project with no `.claude/skills`, create a skill, verify directory created.
- Open a plugin skill, verify editor is read-only.

## Open Questions

None.

## Out of Scope / Future

- Markdown preview for commands list rows.
- Import/export skills as bundles.
- Versioning / undo beyond per-session dirty revert.
