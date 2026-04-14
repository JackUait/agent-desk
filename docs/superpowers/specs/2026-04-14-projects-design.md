# Projects — Design

Status: approved
Date: 2026-04-14

## Goal

Let the user have several projects in Agent Desk. Each project is a real
folder on disk (a git repo). All projects render on a single scrolling page,
with a left sidebar that acts as a jump index. Each project gets its own
4-column kanban board; each card belongs to exactly one project.

## Requirements

- Projects are backed by real folders. Creating a project opens a native OS
  folder picker (macOS, Linux, Windows).
- If the picked folder is not a git repo, Agent Desk runs `git init` in it.
- Projects have: title (derived from the folder basename, editable later),
  absolute path (immutable), accent color (auto-assigned from a 6-color
  rotating palette), created-at timestamp.
- All projects render on one scrolling page, each as a full kanban board.
  Boards size to their natural height and stack vertically.
- Sidebar lists every project. Clicking an entry smooth-scrolls the main
  area to that project's board. The active project is highlighted based on
  scroll position.
- Each project's board has its own scoped "+ New Card" button.
- "+ New Project" lives at the bottom of the sidebar.
- Empty state (no projects yet): centered CTA prompting the user to pick a
  folder. No sidebar entries, no cards.
- Rename a project: double-click its title inline.
- Delete a project: opens a confirmation dialog where the user must type
  the project's exact title to enable the Delete button. Delete removes the
  project record, all its cards, and cleans up any worktrees it created. It
  does NOT delete the user's folder contents or any `.git` directory.
- Existing cards in memory are wiped on first boot of the new code (fresh
  start).

## Non-Goals

- Multi-user, sharing, or permissions.
- Persisting projects across server restarts (in-memory matches existing
  card store).
- Windows native picker polish (best-effort PowerShell dialog is enough).
- Importing existing cards into a "Default" project.
- Drag-and-drop between projects.

## Architecture — Backend

### New `internal/project` package

```go
type Project struct {
    ID        string `json:"id"`
    Title     string `json:"title"`     // mutable; defaults to filepath.Base(Path)
    Path      string `json:"path"`      // absolute; immutable
    ColorIdx  int    `json:"colorIdx"`  // 0..5; auto-assigned round-robin
    CreatedAt int64  `json:"createdAt"`
}
```

`Store` (in-memory, mirrors `card.Store` patterns):

- `Create(path string) (Project, error)` — validates path exists; runs
  `git rev-parse --git-dir`; if that fails, runs `git init`; assigns next
  color index; returns the created project.
- `Get(id string) (Project, bool)`
- `List() []Project` — sorted by `CreatedAt` ascending.
- `UpdateTitle(id, title string) bool`
- `Delete(id string) bool`
- `NextColorIdx() int` — returns `len(projects) % 6`.

### Handler (`/api/projects`)

- `GET /api/projects` — list.
- `POST /api/projects` — body `{path}`; returns created project.
- `PATCH /api/projects/:id` — body `{title}`; renames.
- `DELETE /api/projects/:id` — cascade deletes cards + worktrees, returns
  204.
- `POST /api/projects/pick-folder` — opens native OS folder picker, returns
  `{path}` or `{cancelled: true}`.
- `GET /api/projects/:id/board` — returns the 4-column structure scoped to
  that project (replaces the current `GET /api/board`).

### Native folder picker (`internal/project/picker.go`)

Platform dispatch via `runtime.GOOS`:

- **darwin**: `osascript -e 'POSIX path of (choose folder)'`
- **linux**: `zenity --file-selection --directory`; if `zenity` is missing,
  fall back to `kdialog --getexistingdirectory ~`.
- **windows**: PowerShell:
  `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath`

Each returns the selected path or an empty string on cancel. The handler
maps empty → `{cancelled: true}`, non-empty → `{path}`. Exec errors become
500 with a message the frontend surfaces in-line.

### Card changes

- `card.Card` gains `ProjectID string` (required at creation).
- `card.Store.List(projectID string) []Card` — filters by project.
- `card.Store.ListAll() []Card` — unfiltered, for cascade delete iteration.
- `card.Store.DeleteByProject(projectID string) int` — removes every card
  with that project id; returns count.
- `POST /api/cards` requires `projectId` in the request body; handler
  returns 400 if absent or if the project does not exist.
- `GET /api/cards?projectId=xxx` — listing is always project-scoped; a
  request without `projectId` returns 400.

### Worktree refactor

`worktree.Service` stays as-is (good boundary). New `worktree.Manager`:

```go
type Manager struct {
    mu       sync.RWMutex
    services map[string]*Service // keyed by project id
}

func (m *Manager) For(project project.Project) *Service
func (m *Manager) Remove(projectID string) error
```

`Manager.For` builds a `*Service` lazily with:

- `repoDir = project.Path`
- `worktreeBase = filepath.Join(filepath.Dir(project.Path), filepath.Base(project.Path)+"-agent-worktrees")`

`Manager.Remove` drops the entry and best-effort deletes the worktree base
dir.

`agent.Manager` (existing) takes the `*worktree.Manager` instead of a pinned
`*worktree.Service` and looks up per-card via the card's `ProjectID`.

`cmd/server/main.go` stops hardcoding a single repo dir. It initializes a
`*worktree.Manager` with no projects, and the project store decides per
call which repo to target.

### Deletion cascade

`DELETE /api/projects/:id`:

1. Load the project; 404 if missing.
2. Call `card.Store.DeleteByProject(id)` — any in-flight agent sessions for
   those cards are stopped via `agent.Manager.StopCard(cardID)`.
3. Call `worktree.Manager.Remove(id)` — best-effort, errors logged.
4. Call `project.Store.Delete(id)`.
5. 204.

## Architecture — Frontend

### New feature folder: `frontend/src/features/project/`

- **`use-projects.ts`** — owns `{projects, cardsByProject, boardsByProject, selectedCardId, activeProjectId}`. Single source of truth; replaces `use-board.ts` entirely. Exposes `createProject(path)`, `renameProject`, `deleteProject`, `pickFolder`, `createCardInProject(projectId, title)`, `selectCard`, `updateCard`, `moveCardToColumn`.
- **`ProjectsPage.tsx`** — top-level layout: sidebar + scrollable main area. Replaces `BoardPage.tsx`.
- **`ProjectSidebar.tsx`** — fixed-width column; renders a `ProjectSidebarEntry` per project and a `NewProjectButton` footer.
- **`ProjectSidebarEntry.tsx`** — color dot + monospace title. Active state derived from `activeProjectId`. Click → `scrollIntoView` on the matching `<ProjectBoard>`.
- **`ProjectBoard.tsx`** — renders one project's kanban. Leads with the project header (color rule + big display title + metadata row + rename affordance) and then the 4-column layout (reuses existing `<Column>`).
- **`ProjectHeader.tsx`** — title typography, inline rename, trailing pencil hover icon, card-count + created-at metadata.
- **`NewProjectButton.tsx`** — sidebar footer. Click → `api.pickFolder()` → on path returned, `api.createProject(path)` → scroll the new board into view.
- **`DeleteProjectDialog.tsx`** — shadcn Dialog. Input field disabled Delete button until `value === project.title` exactly. Subtle red outline while `value.length > 0 && value !== project.title`.
- **`EmptyState.tsx`** — centered 480px CTA. One button triggers the folder picker → project create flow.

### Page structure

```tsx
<div className="flex h-screen">
  <ProjectSidebar projects activeId />
  <main ref={scrollRef} className="flex-1 overflow-y-auto">
    {projects.length === 0 ? (
      <EmptyState onPickFolder={...} />
    ) : (
      projects.map(p => (
        <ProjectBoard key={p.id} id={p.id} project={p} />
      ))
    )}
  </main>
</div>
```

Each `<ProjectBoard>` renders with `id={p.id}` on its root so the sidebar
can target it via `document.getElementById(id).scrollIntoView(...)`.

### State shape (`use-projects.ts`)

```ts
{
  projects: Project[],
  cardsByProject: Record<string, Record<string, Card>>,
  boardsByProject: Record<string, Board>,
  selectedCardId: string | null,
  activeProjectId: string | null,
}
```

`useCardSocket` stays as-is (it keys on `cardId`). The card modal is still a
single global overlay.

### Active project tracking

`ProjectsPage` sets up an `IntersectionObserver` with
`rootMargin: "-40% 0px -55% 0px"`. Each `<ProjectBoard>` registers its root
element. The observer callback picks the entry with the highest
`intersectionRatio` and updates `activeProjectId`.

### API client additions (`shared/api/client.ts`)

```ts
api.listProjects(): Promise<Project[]>
api.createProject(path: string): Promise<Project>
api.renameProject(id: string, title: string): Promise<Project>
api.deleteProject(id: string): Promise<void>
api.pickFolder(): Promise<{path: string} | {cancelled: true}>
api.getBoard(projectId: string): Promise<Board>
api.listCards(projectId: string): Promise<Card[]>
api.createCard(projectId: string, title: string): Promise<Card>
```

### Routing

`routes.tsx` replaces the `BoardPage` route with `ProjectsPage` at `/`. The
old `BoardPage.tsx` and `use-board.ts` are deleted (fresh start is already
agreed).

## Visual Design

### Typography

- Display font: **Geist Mono** (already loaded as part of Geist Variable).
- Body font: **Geist Variable** (sans), unchanged.
- Project title: Geist Mono, 56px, tracking `-0.04em`, lowercase, weight 500.
- Sidebar entries: Geist Mono 13px, tracking `-0.01em`.
- Metadata row below title: Geist Variable 12px, `text-muted`.
- Empty-state heading: Geist Variable 36px, lowercase, with period.

### Color palette

Rotating accents (OKLCH, perceptually balanced):

1. `oklch(0.62 0.14 240)` — ink blue
2. `oklch(0.68 0.14 150)` — moss
3. `oklch(0.70 0.16 50)` — ochre
4. `oklch(0.60 0.18 20)` — rust
5. `oklch(0.55 0.13 300)` — aubergine
6. `oklch(0.65 0.08 200)` — slate teal

Added to `global.css` as `--color-project-1` through `--color-project-6`.
Resolved in frontend via `colorIdx` from the backend.

Used for:

- 3px vertical rule immediately left of each project's display title.
- 6px circular dot leading the project's sidebar entry.
- Thin (1px) top border on cards belonging to that project (optional polish; disable if visually noisy).

### Spatial composition

- Sidebar: 240px fixed. Background `#f2f0eb` (one shade darker than page).
  1px right border (`border-card`). Footer sticks to bottom.
- Main scroll area: left padding 96px, right padding 48px, top padding 48px.
- Between project boards: 120px vertical gap with a 1px full-width horizontal rule (`border-card`) at the midpoint.
- Project header: color rule (3px × header-height) sits 24px left of the title. Title baseline and metadata row share generous vertical rhythm (20px gap). Pencil rename icon lives 16px right of the title, opacity 0 → 1 on `group-hover` over 120ms.

### Motion

- Sidebar click → `scrollIntoView({behavior:'smooth', block:'start'})` with 24px top offset via scroll-margin-top.
- Active sidebar fade: color over 180ms.
- New project mount: fade + 8px translate-up over 220ms.
- Delete confirm input outline transition: 120ms.
- No other animations on static elements.

### Empty state

Centered, 480px max width.

```
00 / 00 projects            (Geist Mono 10px, text-muted)

pick a folder.              (Geist 36px, weight 500)

every project in agent desk is a real repo on your disk.
                            (Geist 14px, text-secondary)

[ choose folder → ]         (primary button, Geist Mono 13px)
```

No illustration. No gradient. No sparkle.

### Anti-slop guardrails (explicit non-goals)

- No purple/pink gradients.
- No emoji in UI.
- No sparkle, glow, or blur decorations.
- No soft-shadow floating cards.
- No shimmer skeletons.

## Testing Strategy

### Backend

- `internal/project/store_test.go` — create assigns next color idx;
  `git init` runs when not a repo; rename mutates title; delete removes;
  list is sorted.
- `internal/project/handler_test.go` — all routes happy + error paths;
  folder picker handler mocked via an injected `Picker` interface so the
  test does not spawn a real OS dialog.
- `internal/project/picker_test.go` — platform dispatch is unit-testable by
  stubbing the `exec.Command` factory; cancellation returns empty path.
- `internal/card` — tests updated to pass `ProjectID`. `List(projectID)`
  and `DeleteByProject` get dedicated cases.
- `internal/worktree` — `Manager` test covers `For` lazy build, `Remove`
  teardown.
- Handler tests do not run `git init` against real directories; `Store` is
  constructed with an injected git runner interface.

### Frontend

- `features/project/use-projects.test.ts` — state transitions: create,
  rename, delete, switch active, card within project.
- `features/project/ProjectSidebar.test.tsx` — render, click scrolls,
  active highlight.
- `features/project/ProjectBoard.test.tsx` — renders 4 columns, scoped
  "+ New Card", inline rename submits.
- `features/project/DeleteProjectDialog.test.tsx` — Delete button is
  disabled until typed value equals title; submits on confirm.
- `features/project/EmptyState.test.tsx` — renders when `projects.length ===
  0`; button triggers the picker callback.
- API client tests updated for the new endpoints.

### TDD order

Backend first, because the frontend depends on the new shapes:

1. project store + handler
2. card store refactor for projectId
3. worktree manager refactor
4. frontend api client
5. use-projects hook
6. project components top-down

Every step: red → green → refactor → commit.

## Open questions

None. Proceed to plan.
