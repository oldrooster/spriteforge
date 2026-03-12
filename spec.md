# Asset Detail Redesign — Spec

## Goal

Redesign the asset detail view so that resources (images, videos, sounds) are
first-class visual objects displayed as a horizontal thumbnail strip at the top
of the page, replacing the old text-list "Resources" section. Each resource gets
a context menu ("...") with type-appropriate tool actions. A new "Mark Up" tool
is introduced for freehand drawing + text annotation on images.

---

## Current State

- Hero thumbnail is auto-generated from the first view's first frame.
- Resources are shown as a text list at the bottom with filename + type badge.
- No resource previews, no context menus, no way to set a custom hero image.
- No duplicate or markup functionality exists.

---

## Layout Change

### Before
```
[Header: Name / Badge / Tags / Rename / Download / Export AGS / Delete]
[Hero Thumbnail (auto from first view)]
[Tools grid]
[Views section]
[Resources section — text list]     ← REMOVE
```

### After
```
[Header: Name / Badge / Tags / Rename / Download / Export AGS / Upload / Delete]
[Resource Strip — horizontal scroll]
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ DEFAULT │ │  Image  │ │  Video  │ │  Image  │ ...
  │ (large) │ │   ...   │ │   ...   │ │   ...   │
  │         │ │ [Image] │ │ [Video] │ │ [Image] │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘
     ↑ hero      each has "..." context menu
[Tools grid]
[Views section]
```

- **No more separate Resources section** — it is replaced by the strip.
- The **first item** in the strip is the "default" resource, rendered ~2x larger
  as the hero. Initially this is the asset thumbnail (from first view).
  "Set as Default" on any image resource promotes it.
- Each resource card shows:
  - A thumbnail preview (image → `<img>`, video → poster frame or `<video>` tag,
    audio → waveform icon placeholder)
  - A type badge overlay ("IMAGE" / "VIDEO" / "AUDIO")
  - A "..." button in the top-right corner → context menu
- The strip scrolls horizontally if it overflows.

---

## Header Changes

Add **"Upload"** button to the header actions bar (next to Rename, Download,
Export AGS, Delete). Clicking it opens the existing file picker
(`uploadResource()` logic) but now accepts multiple files at once.

---

## Context Menu ("..." per resource)

Appears as a small dropdown anchored to the "..." button on each resource card.
Clicking outside or pressing Escape dismisses it.

### For IMAGE resources:
| Action | Behaviour |
|---|---|
| AI Generate | Navigate to `#/asset/<id>/tool/ai-generate` with resource as reference image |
| AI Animate | Navigate to `#/asset/<id>/tool/ai-animate` with resource pre-selected |
| Crop | Navigate to `#/asset/<id>/tool/crop-image` with resource pre-loaded |
| Resize | Navigate to `#/asset/<id>/tool/resize-images` with resource pre-loaded |
| Make Transparent | Navigate to `#/asset/<id>/tool/make-transparent` with resource pre-loaded |
| Mark Up | Navigate to `#/asset/<id>/tool/markup` (new tool) with resource pre-loaded |
| Set as Default | Set this resource as the hero/thumbnail image for the asset |
| Duplicate | Server-side copy → new resource with `filename = "Copy of <original>"` |
| Rename | Inline rename (prompt dialog) |
| Delete | Confirm → delete resource |

### For VIDEO resources:
| Action | Behaviour |
|---|---|
| Video to Frames | Navigate to `#/asset/<id>/tool/video-to-frames` with resource pre-loaded |
| Duplicate | Same as above |
| Rename | Same as above |
| Delete | Same as above |

### For AUDIO resources:
| Action | Behaviour |
|---|---|
| Duplicate | Same as above |
| Rename | Same as above |
| Delete | Same as above |

---

## "Set as Default" — Hero Image

### Data model change (asset.json)
Add optional field:
```json
{
  "thumbnail_resource_id": "<resource_id or null>"
}
```

### Backend changes (library.py)
- `GET /api/assets/<id>/thumbnail`:
  - If `thumbnail_resource_id` is set AND that resource exists AND is an image:
    generate thumbnail from that resource file instead of the first view frame.
  - Else: fall back to current logic (first view's frame_0001).
- `PUT /api/assets/<id>`: accept `thumbnail_resource_id` in the update body.
  Regenerate thumbnail when changed.

### Frontend
- "Set as Default" in context menu → `PUT /api/assets/<id>` with
  `{ thumbnail_resource_id: resource.id }` → re-render.
- The default resource card gets a visible highlight (thicker border or
  small star/crown badge).

---

## "Duplicate" — Copy Resource

### Backend (library.py)
New endpoint: `POST /api/assets/<asset_id>/resources/<resource_id>/duplicate`
- Reads the existing resource record from asset.json.
- Copies the physical file with a new UUID: `<new_id><ext>`.
- Creates new metadata: `{ id: new_id, filename: "Copy of <original>",
  stored_name: ..., type: same, uploaded: now }`.
- Appends to `asset.resources`, writes asset.json.
- Returns the new resource record.

### Frontend
- Context menu "Duplicate" → POST → re-render strip.

---

## "Rename" — Resource Rename

### Backend (library.py)
New endpoint: `PUT /api/assets/<asset_id>/resources/<resource_id>`
- Accepts `{ "filename": "new name" }`.
- Updates `resource.filename` in asset.json (display name only, `stored_name`
  unchanged).
- Returns updated resource record.

### Frontend
- Context menu "Rename" → `prompt('Rename:', resource.filename)` → PUT → re-render.

---

## "Mark Up" Tool (New)

A new tool panel for freehand drawing and text overlay on an image resource.

### Purpose
Annotate images with drawings and text labels for use as precise references
in AI generation prompts (e.g., circle a region and label it "add hat here").

### UI (tool-markup panel in index.html)
```
[Back button] [Panel title: "Mark Up"]
┌──────────────────────────────────┐  ┌──────────────┐
│                                  │  │ Tool palette  │
│        Canvas                    │  │ ─────────────│
│   (image + drawings)             │  │ [Brush]       │
│                                  │  │ Color: [■]    │
│                                  │  │ Size: [──●──] │
│                                  │  │ [Text]        │
│                                  │  │ Font size: 16 │
│                                  │  │ ─────────────│
│                                  │  │ [Undo] [Redo] │
│                                  │  │ [Clear All]   │
│                                  │  │ ─────────────│
│                                  │  │ [Save as New] │
│                                  │  │ [Overwrite]   │
│                                  │  │ [Download]    │
└──────────────────────────────────┘  └──────────────┘
```

### Behaviour
- **Brush tool**: Freehand drawing. Configurable color (color picker) and
  stroke width (slider, 1–20px).
- **Text tool**: Click canvas to place text. A small input field appears;
  type text, press Enter to commit. Configurable font size (8–48px) and color.
- **Undo / Redo**: Maintain a stack of drawing actions. Each brush stroke or
  text placement is one action.
- **Clear All**: Remove all annotations, back to original image.
- **Save as New Resource**: Flatten canvas → upload as new resource on the
  asset. Filename = `<original>_markup.png`.
- **Overwrite**: Flatten canvas → overwrite the original resource file.
- **Download**: Flatten canvas → download as PNG.

### Backend
- No new backend endpoints needed for the tool itself — it works entirely
  client-side on a `<canvas>`.
- "Save as New" uses `POST /api/assets/<id>/resources` (upload a blob).
- "Overwrite" uses the existing resource file overwrite pattern (or a new
  `PUT /api/assets/<id>/resources/<rid>/file` endpoint to replace the file
  in place while keeping the same resource ID and metadata).

### New backend endpoint:
`PUT /api/assets/<asset_id>/resources/<resource_id>/file`
- Accepts multipart form with `file` field.
- Replaces the stored file on disk (same `stored_name`).
- Returns `{ ok: true }`.

### Files to create/modify:
- `app/static/index.html` — add `#tool-markup` panel HTML
- `app/static/js/markup.js` — new IIFE, canvas drawing logic
- `app/static/css/style.css` — markup tool styles
- `app/routes/library.py` — resource file overwrite endpoint

---

## Pre-loading Tools from Context Menu

When the user selects a tool from a resource's context menu, the tool should
open with that resource already loaded. This requires passing context through
the navigation.

### Approach
Use `state.pendingToolResource` as a transient value:
```javascript
// In asset-detail.js context menu handler:
state.pendingToolResource = {
    asset_id: asset.id,
    resource_id: resource.id,
    resource_url: '/api/assets/' + asset.id + '/resources/' + resource.id + '/file',
    filename: resource.filename,
    type: resource.type,
};
navigate('#/asset/' + asset.id + '/tool/' + toolRoute);
```

Each tool panel's activation observer checks `state.pendingToolResource` on
load. If present, it fetches the resource as a blob/File and feeds it into
the tool's existing load-from-library flow, then clears
`state.pendingToolResource`.

Tools that need this wiring:
- `ai-generate.js` — set as reference image
- `ai-animate.js` — set as source sprite
- `crop.js` — load as source image
- `resize.js` — load as source image(s)
- `image-transparency.js` — load as source image
- `upload.js` (V2F) — load as source video
- `markup.js` — load as source image (new tool)

---

## Implementation Phases

### Phase A: Backend additions
1. `PUT /api/assets/<id>/resources/<rid>` — rename resource
2. `POST /api/assets/<id>/resources/<rid>/duplicate` — duplicate resource
3. `PUT /api/assets/<id>/resources/<rid>/file` — overwrite resource file
4. `PUT /api/assets/<id>` — accept `thumbnail_resource_id`, regenerate thumb
5. `GET /api/assets/<id>/thumbnail` — respect `thumbnail_resource_id`

### Phase B: Asset detail UI rewrite
1. Remove `renderResource()` section and `uploadResource()` button placement
2. Build resource strip (horizontal scroll container with thumbnail cards)
3. Add "Upload" button to header actions bar (multi-file)
4. Build context menu component (positioned dropdown)
5. Wire all context menu actions (navigate, duplicate, rename, delete,
   set as default)
6. Add CSS for resource strip, cards, context menu, type badges, hero highlight

### Phase C: Tool pre-loading
1. Add `state.pendingToolResource` pattern
2. Wire each tool's activation observer to check and consume it
3. Test each tool: AI Generate, AI Animate, Crop, Resize, Make Transparent,
   V2F

### Phase D: Mark Up tool
1. Add `#tool-markup` HTML panel to index.html
2. Create `markup.js` — canvas, brush tool, text tool, undo/redo
3. Wire "Save as New", "Overwrite", "Download"
4. Add route in app.js router for `#/asset/<id>/tool/markup`
5. CSS for markup tool panel

---

## Open Questions (resolved)

| Question | Decision |
|---|---|
| Hero layout | First in strip, rendered larger |
| Tool launch from context menu | Navigate to existing tool panel |
| Mark Up scope for v1 | Draw + Text only (with undo/redo) |
| Context menu extras | Include Delete and Rename in the menu |
