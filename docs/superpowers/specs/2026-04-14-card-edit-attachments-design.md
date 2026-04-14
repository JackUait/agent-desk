# Card edit + attachments + agent dirty-flag notification

**Status:** draft
**Date:** 2026-04-14
**Area:** frontend (card feature) + backend (card/attachment/mcp/agent)

## Goal

Let the user edit a card's title and description and attach arbitrary files to it. When — and only when — the user (not the agent) changes any of those, the next agent turn for that card receives a structured note listing what changed so it can react.

## Non-goals

- Real-time collaborative editing / conflict resolution. Last write wins.
- Version history for edits or attachments.
- Previewing images/PDFs inline. V1 shows filenames with download links only.
- Automatic full-content injection on every turn. Agent fetches attachment bodies on demand via MCP.
- Surfacing agent-originated title/description edits in the dirty stream. Only user edits count.

## UX

Decision: **auto-save + dropzone** (option C from brainstorm). No explicit Edit/Save buttons.

Card modal left pane:

- **Title** is a single-line editable field styled to match the current `<h3>`. 500 ms debounced auto-save on the last keystroke. Blur also saves immediately.
- **Description** is an editable textarea. Shows rendered markdown when unfocused, raw text in a textarea when focused. Same 500 ms debounce + blur-to-save.
- **Attachment list** sits below the description. Persistent dashed dropzone. Clicking opens the system file picker. Each attachment renders as a row with filename, size, MIME type, and a `×` remove button. Clicking the filename downloads.
- **Errors** (size/count cap, filename collision, path traversal attempt) surface as a transient toast.

## Architecture

Three independent surfaces feed one feature. Each can be developed and tested in parallel.

### 1. Card editing (mostly wiring)

The backend `PATCH /api/cards/{id}` endpoint already exists and supports `title` and `description`. What's missing:

- Frontend `api.updateCard(id, fields)` in `shared/api/client.ts`.
- `use-projects.ts#updateCard` routes through the new client call instead of only mutating local state.
- `EditableTitle` and `EditableDescription` components with debounced auto-save.

### 2. Attachments

New domain package `backend/internal/attachment`.

**On-disk layout:**

```
~/.agent-desk/cards/{cardId}/attachments/
  manifest.json         # [{name, size, mimeType, uploadedAt}, ...]
  spec.pdf
  wireframe.png
  ...
```

Manifest is the source of truth for what the card "has"; files on disk without manifest entries are ignored. Manifest writes are atomic (write to `manifest.json.tmp` + `rename`).

**Limits (hard-coded for v1):**

- 20 files per card
- 10 MB per file
- 50 MB total per card
- Filename must not contain `/`, `\`, `..`, or null bytes. Leading dots allowed.
- No filename collisions — upload fails with 409; user must rename.

**REST routes:**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cards/{id}/attachments` | Multipart upload. 201 on success with the new `Attachment` entry. 413/409/400 on limit violations. |
| `GET` | `/api/cards/{id}/attachments/{name}` | Download. Sets `Content-Type` from the manifest. |
| `DELETE` | `/api/cards/{id}/attachments/{name}` | Remove from disk and manifest. 404 if missing. |

Each successful mutation triggers a WebSocket `card_update` frame so all listeners see the new attachment list.

**Types:**

```go
type Attachment struct {
    Name       string `json:"name"`
    Size       int64  `json:"size"`
    MIMEType   string `json:"mimeType"`
    UploadedAt int64  `json:"uploadedAt"`
}
```

`Card.Attachments []Attachment` is added to `internal/card/card.go` and serialized in the existing card JSON.

### 3. Dirty-flag notification

New state on the card service (transient, not stored on disk — lives on `Card.DirtyFlags []string` in memory but is cleared after `DrainDirty` and never included in any persisted snapshot).

**Source-aware mutation paths.** `card.Service.UpdateFields` gains an unexported companion `updateFieldsWithSource(id, fields, source)` where `source ∈ {user, agent}`. The existing public signature stays `user` by default. All MCP mutator paths (`mutator.go`, `handlers.go`) explicitly route through `source=agent`. Attachment handler mutations always mark dirty. REST `PATCH /api/cards/{id}` always marks dirty.

**Dirty flags set:**

- `"title"` — user edited title
- `"description"` — user edited description
- `"attachments"` — user uploaded or deleted an attachment (one flag covers any mix)

**Drain semantics.** `card.Service.DrainDirty(cardID) ([]string, AttachmentDiff)` returns the flag set and an attachment-diff struct capturing added/removed filenames since the last drain. Second and subsequent reads return empty until the user mutates again.

**Where drain happens.** The chat send pipeline in `backend/internal/card/handler.go` (or wherever `manager.Send` is invoked from — TBD during implementation) calls `DrainDirty` right before building `SendRequest.Message`. If the result is non-empty, the user's message is wrapped:

```
<card-edits-since-last-turn>
- Description changed
- Title changed
- Attached: spec.pdf (21.4 KB, image/png)
- Attached: wireframe.svg (3.2 KB, image/svg+xml)
- Removed: outdated-notes.txt
</card-edits-since-last-turn>

<user-message>
...whatever the user actually typed...
</user-message>
```

When nothing is dirty, the user's message is passed through unchanged.

### 4. MCP attachment tools

Two new tools on the existing `mcp__agent_desk__` server:

- `mcp__agent_desk__list_attachments` — no args, returns the card's manifest as JSON text.
- `mcp__agent_desk__read_attachment` — `{filename: string}`. Text MIME types (`text/*`, `application/json`, `application/yaml`, etc.) return the raw content as string. Everything else returns a JSON object `{"encoding":"base64","data":"..."}`. Hard cap 10 MB per read (matches the upload cap).

Both tools respect the same filename sanitation rules as upload. Missing file returns `IsError` with `"attachment not found: <name>"`.

All `mutator.go` / `handlers.go` write paths are audited to pass `source=agent` explicitly so agent self-edits never mark the card dirty.

## Data flow

```
keystroke in EditableTitle
  → 500 ms debounce
  → api.updateCard(id, {title})
  → PATCH /api/cards/{id} (user source)
  → card.Service.UpdateFields → MarkDirty("title")
  → WS card_update
  → local store merge

file dropped in AttachmentList
  → api.uploadAttachment(id, file)
  → POST /api/cards/{id}/attachments
  → attachment.Service writes bytes + manifest
  → card.Service.MarkDirty("attachments")
  → WS card_update

user sends chat message
  → chat handler builds SendRequest
  → DrainDirty(cardID) → flags + diff
  → wrap message with <card-edits-since-last-turn> block if non-empty
  → manager.Send(req)
  → agent may call list_attachments / read_attachment / get_card as needed
```

## API additions

**Frontend `shared/api/client.ts`:**

```ts
updateCard(id: string, fields: Partial<Card>): Promise<Card>
uploadAttachment(id: string, file: File): Promise<Attachment>
deleteAttachment(id: string, name: string): Promise<void>
attachmentUrl(id: string, name: string): string  // synchronous URL builder
```

**Frontend `shared/types/domain.ts`:**

```ts
export interface Attachment {
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: number;
}
// Add `attachments: Attachment[]` to Card.
```

## Error handling

| Condition | Response |
|---|---|
| Upload > 10 MB | 413 with `{error: "attachment too large"}` → toast |
| Per-card file count > 20 | 409 with `{error: "too many attachments"}` → toast |
| Per-card total > 50 MB | 409 with `{error: "attachment quota exceeded"}` → toast |
| Filename contains `/`, `\`, `..`, null byte | 400 → toast |
| Filename collides with existing | 409 → toast ("rename to upload") |
| Download / delete of missing attachment | 404 |
| `read_attachment` of missing file | MCP `IsError` with message |
| Concurrent updateCard races | Last write wins — debounce is the only guard |
| Agent running when user sends another edit | Existing chat-queue holds the new message; flags drain when the queued turn dispatches |

## Testing (TDD, parallel subagents)

Each surface is an independent package/directory and can be owned by its own subagent. Branch: new feature branch layered on `feat/projects`.

1. **`backend/internal/attachment`** — service + handler tests.
   - Upload writes file + manifest entry
   - Upload size cap returns 413
   - Upload count cap returns 409
   - Upload total-size cap returns 409
   - Collision returns 409
   - Traversal filename returns 400
   - List matches manifest
   - Download streams correct bytes + MIME
   - Delete removes file + manifest entry
   - Manifest corruption → rebuilt as empty
2. **`backend/internal/card` dirty-flag extension.**
   - `MarkDirty` stores flags
   - `DrainDirty` returns and clears
   - `UpdateFields(source=user)` marks title/description flags; `source=agent` does not
   - `DrainDirty` on clean card returns empty
   - Attachment mutation path marks `"attachments"`
3. **`backend/internal/mcp` attachment tools + source=agent.**
   - `list_attachments` returns manifest JSON
   - `read_attachment` on text → string
   - `read_attachment` on binary → base64 wrapper
   - `read_attachment` missing → IsError
   - `read_attachment` over-cap → IsError
   - Regression: every mutator entry point passes `source=agent`
4. **`backend/internal/agent` wrapper.**
   - Pure helper: given flags `[]` + empty diff, returns message unchanged
   - Given flags + diff, returns the tagged wrapper block verbatim (snapshot test)
   - Integration on `Send`: dirty card → wrapped message reaches CLI args
5. **Frontend.**
   - `EditableTitle` debounces auto-save (fake timers), blur saves immediately
   - `EditableDescription` renders markdown when unfocused, textarea when focused
   - `AttachmentList` click/drop uploads, renders, × removes
   - Size/count rejection renders toast
   - `api.updateCard` / `uploadAttachment` / `deleteAttachment` contract tests with `fetch` mock
   - `CardContent` integration: edits flow through `updateCard` prop

## Open questions to resolve at review time

- Should `read_attachment` be chunked / streamed for files near the 10 MB cap, or is a single buffer fine? (Default: single buffer. Agent is the only consumer.)
- Should there be an explicit dirty-flag for `title` separate from `description`, or collapse into one `"metadata"` flag? (Default: two flags, keeps the notification precise.)
- Should attachment MIME detection use `mime.DetectContentType` on the first 512 bytes, or trust the multipart header? (Default: detect from content; header is user-controlled.)

## Out of scope / followups

- Drag-to-reorder attachments
- Image/PDF previews
- Copy-paste image into description (clipboard → attachment)
- Per-project attachment quota
- Attachment versioning
