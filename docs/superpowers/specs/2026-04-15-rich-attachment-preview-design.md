# Rich Attachment Preview

## Goal

Replace the plain text attachment list inside cards with a thumbnail grid that lets users see and open files in-place. Click a tile to launch a lightbox modal with a viewer matched to the file's mime type.

## Why

Attachments today render as a single mono-blue link with `(size, mime)`. Users cannot see what they uploaded without downloading it first, which makes the card feel like a file dumping ground rather than working content. The card UI gets richer everywhere else (labels, progress, blocked banner) — attachments need to keep up.

## Scope

In:
- All file types get a meaningful preview tile (image, video, audio, pdf, text/code, other).
- Click → fullscreen lightbox modal with viewer per type.
- Backend already serves raw bytes with the correct `Content-Type`. No backend changes.
- No new npm dependencies — `base-ui` Dialog already in use, browser handles pdf/video/audio/image natively.

Out:
- No syntax highlighting library (text shown as plain `<pre>`).
- No backend thumbnail generation/resizing.
- No multi-page PDF nav UI beyond what the browser iframe gives.
- No zoom/pan beyond a 1× / fit toggle for images.

## Architecture

Four frontend modules in `frontend/src/features/card/`:

1. **`mimeCategory.ts`** — pure helper. `mimeCategory(mime: string, name?: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'`. Falls back to filename extension when mime is `application/octet-stream`.
2. **`AttachmentTile.tsx`** — single grid tile. Props: `attachment`, `href`, `onOpen`, `onDelete`. Renders thumbnail per category. Hover reveals × delete button. Click body fires `onOpen`.
3. **`AttachmentLightbox.tsx`** — modal viewer built on `components/ui/dialog`. Props: `attachment`, `href`, `open`, `onClose`. Header shows filename, size, mime, download link, close. Body picks viewer by category.
4. **`AttachmentList.tsx`** — refactored. Renders grid of tiles + dropzone band underneath. Holds `openName` state for which tile is open.

`CardContent.tsx` already wires `AttachmentList` — no change.

## Tile previews by category

| Category | Tile thumb | Notes |
|---|---|---|
| image | `<img src={href}>` `object-fit: cover`, `loading="lazy"` | Native browser decoding |
| video | `<video src={href} preload="metadata" muted>` no controls | Browser shows poster |
| audio | speaker icon on tinted bg + mime label | No waveform — keep simple |
| pdf | document glyph + filename, tinted bg | First-page render is too costly without pdf.js |
| text | `<pre>` with first ~200 bytes fetched on mount, mono 10px | Truncate visually with overflow-hidden |
| other | generic file glyph + extension badge | |

## Lightbox viewers by category

| Category | Body |
|---|---|
| image | centered `<img>`, click toggles `object-fit: contain` ↔ `none` (1×) |
| video | `<video controls autoPlay>` |
| audio | `<audio controls>` centered, large speaker glyph above |
| pdf | `<iframe src={href}#view=FitH>` filling body |
| text | fetch full bytes on open, render in scrollable `<pre>` |
| other | large icon + "Download" button (download attribute on link) |

Header for every viewer: filename · formatted size · mime · download link · close (`Esc` and click-outside via base-ui Dialog).

## Tests (TDD — write each test, watch fail, then implement)

### `mimeCategory.test.ts`
- `image/png` → `'image'`
- `image/webp` → `'image'`
- `video/mp4` → `'video'`
- `audio/mpeg` → `'audio'`
- `application/pdf` → `'pdf'`
- `text/plain` → `'text'`
- `text/javascript` → `'text'`
- `application/json` → `'text'`
- `application/octet-stream` + `name="foo.md"` → `'text'`
- `application/octet-stream` + `name="foo.bin"` → `'other'`
- `application/zip` → `'other'`

### `AttachmentTile.test.tsx`
- image attachment → `<img>` with src equal to href
- pdf attachment → no `<img>`, document glyph rendered
- click on tile body → fires `onOpen` with attachment name
- hover reveals delete button with `aria-label="remove <name>"`
- delete button click does not propagate to `onOpen`

### `AttachmentLightbox.test.tsx`
- when `open` and category=image → renders `<img>` with `src=href`
- when `open` and category=pdf → renders `<iframe>` with `src` containing `#view=FitH`
- header shows filename, formatted size, mime
- header download link has `href={href}` and `download` attribute
- close button fires `onClose`
- when `open=false` → nothing rendered

### `AttachmentList.test.tsx` (replace existing)
- renders one tile per attachment
- clicking image tile opens lightbox showing image
- closing lightbox returns to grid
- delete button on tile fires `onDelete(name)`
- dropzone still uploads file via input (existing behavior)
- existing upload + delete tests preserved with new selectors

## Error handling

- Image/video that fails to load → swap to `other` glyph (onError handler).
- Text fetch failure inside lightbox → show error line, no crash.
- Filename rendering uses existing safe truncation; no XSS surface (filenames go through React text nodes only, no `dangerouslySetInnerHTML`).

## Verification (per CLAUDE.md completion checklist)

- `cd frontend && yarn test` — all green
- `cd frontend && yarn build` — succeeds
- `cd frontend && yarn lint` — clean
- Manual: open card with image, pdf, text, binary attachments, click each, verify lightbox.
