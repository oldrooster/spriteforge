# Sprite Library - Implementation Plan

## Overview

A new "Sprite Library" tool in the sidebar that serves as a persistent catalog for organizing sprites and their animation loops. It integrates with Video to Frames (as input/output) and Resize Images (as an image source), making it a central hub for sprite asset management.

## Concepts

### Sprite
A named collection of related image resources. Each sprite has:
- **Name** (e.g. "Knight", "Fireball", "Coin")
- **Thumbnail** (auto-generated from first frame of first loop)
- **Source resources**: uploaded videos and/or images associated with this sprite
- **Loops**: one or more named animation loops

### Loop
A named sequence of image frames that form one animation cycle:
- **Name** (e.g. "Walk Right", "Idle", "Attack")
- **Frames**: ordered list of PNG images
- **Metadata**: frame count, dimensions, delay

## UI Design

### Sidebar Entry
```
[📚] Sprite Library   ← new sidebar item
```

### Sprite Library Panel

```
┌─ Sprite Library ──────────────────────────────────────────────┐
│                                                                │
│  [+ New Sprite]                              [Search: ______] │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │  thumb   │  │  thumb   │  │  thumb   │                    │
│  │          │  │          │  │          │                    │
│  │ Knight   │  │ Fireball │  │ Coin     │                    │
│  │ 3 loops  │  │ 1 loop   │  │ 2 loops  │                    │
│  └──────────┘  └──────────┘  └──────────┘                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Sprite Detail View (click a sprite card)

```
┌─ Knight ──────────────────────────────────────────────────────┐
│  [← Back to Library]              [Rename] [Delete Sprite]    │
│                                                                │
│  Resources                                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ knight_spritesheet.mp4   [Open in Video to Frames]     │   │
│  │ knight_ref.png           [Preview]  [Remove]           │   │
│  │ [+ Upload Resource]                                     │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Loops                                                         │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Walk Right (8 frames, 128x128)     [▶ Preview] [Edit]  │   │
│  │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐                     │   │
│  │ │f1││f2││f3││f4││f5││f6││f7││f8│  filmstrip           │   │
│  │ └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘                     │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │ Idle (4 frames, 128x128)           [▶ Preview] [Edit]  │   │
│  │ ┌──┐┌──┐┌──┐┌──┐                                      │   │
│  │ │f1││f2││f3││f4│                                       │   │
│  │ └──┘└──┘└──┘└──┘                                      │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │ [+ New Loop]  [+ Import Frames]                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [Download All Loops as ZIP]                                   │
└────────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1a. Sprite creation + resource upload
- "New Sprite" button opens a dialog: name + optional initial resource upload (video or images)
- Resources are stored server-side under `/app/library/<sprite_id>/resources/`
- Sprite detail view shows all resources with options to preview, remove, or open in other tools

### 1b. Loops as frame collections
- Each loop has a name and ordered list of frame PNGs
- Frames stored under `/app/library/<sprite_id>/loops/<loop_id>/`
- Inline filmstrip preview in the detail view
- Click "Preview" to open a modal with animated canvas playback

### 1c. Video to Frames → Select from Sprite Library
- On the Upload step (Step 1), add a secondary option: "Select from Sprite Library"
- Opens a modal listing all sprites that have video resources
- User picks a video → it populates the upload step as if they'd uploaded that file
- The video already exists on disk, so no re-upload needed — just set `state.videoId` from library

### 1d. Video to Frames → Save loop back to Sprite Library
- After Step 4 (Transparency), add a "Save to Sprite Library" button alongside "Download ZIP"
- Opens a dialog: select existing sprite (or create new) + name the loop
- Server copies frames from `/app/output/<session>/transparent/` (or `original/`) to `/app/library/<sprite_id>/loops/<loop_id>/`
- Confirmation shows the saved loop with filmstrip

### 2. Resize Images → Select loops as input
- In Resize Images, add a secondary option alongside the file dropzone: "Import from Sprite Library"
- Opens a modal listing all sprites with their loops
- User selects one or more loops → frames are loaded as the resize input files
- After resize, optionally save back to the sprite library as a new loop

## Data Model

### Server-side storage
```
/app/library/
├── sprites.json           # Master index: [{id, name, created, thumbnail}]
└── <sprite_id>/
    ├── sprite.json        # Sprite metadata + loop list
    ├── resources/
    │   ├── <uuid>.mp4
    │   └── <uuid>.png
    └── loops/
        ├── <loop_id>/
        │   ├── loop.json  # {name, frame_count, width, height, delay}
        │   ├── frame_0001.png
        │   ├── frame_0002.png
        │   └── ...
        └── <loop_id>/
            └── ...
```

### `sprites.json` (library index)
```json
[
    {
        "id": "uuid",
        "name": "Knight",
        "created": "2026-03-02T12:00:00Z",
        "thumbnail": "/api/library/uuid/thumbnail"
    }
]
```

### `sprite.json` (per-sprite)
```json
{
    "id": "uuid",
    "name": "Knight",
    "resources": [
        {"id": "uuid", "filename": "knight.mp4", "type": "video", "uploaded": "..."}
    ],
    "loops": [
        {"id": "uuid", "name": "Walk Right", "frame_count": 8, "width": 128, "height": 128, "delay": 100}
    ]
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library` | List all sprites (index) |
| POST | `/api/library` | Create new sprite (name) |
| GET | `/api/library/<sprite_id>` | Get sprite detail (metadata + loops) |
| PUT | `/api/library/<sprite_id>` | Update sprite (rename) |
| DELETE | `/api/library/<sprite_id>` | Delete sprite and all its data |
| GET | `/api/library/<sprite_id>/thumbnail` | Serve sprite thumbnail |
| POST | `/api/library/<sprite_id>/resources` | Upload a resource (video/image) |
| DELETE | `/api/library/<sprite_id>/resources/<resource_id>` | Remove a resource |
| GET | `/api/library/<sprite_id>/resources/<resource_id>` | Serve/stream a resource file |
| POST | `/api/library/<sprite_id>/loops` | Create loop (name + frames as multipart, or from session) |
| GET | `/api/library/<sprite_id>/loops/<loop_id>` | Get loop metadata |
| PUT | `/api/library/<sprite_id>/loops/<loop_id>` | Update loop (rename, reorder frames) |
| DELETE | `/api/library/<sprite_id>/loops/<loop_id>` | Delete a loop |
| GET | `/api/library/<sprite_id>/loops/<loop_id>/frames/<file>` | Serve individual frame |
| GET | `/api/library/<sprite_id>/loops/<loop_id>/download` | Download loop as ZIP |
| GET | `/api/library/<sprite_id>/download` | Download all loops as ZIP |

## File Changes

### New Files
| File | Description |
|------|-------------|
| `app/routes/library.py` | Flask blueprint for all `/api/library` endpoints |
| `app/static/js/sprite-library.js` | Client module: grid view, detail view, modals, filmstrip |
| `app/static/js/library-modal.js` | Shared modal component for sprite/loop selection (used by Video to Frames and Resize) |

### Modified Files
| File | Changes |
|------|---------|
| `app/static/index.html` | New sidebar item + tool panel for Sprite Library; "Select from Library" buttons in Upload step and Resize dropzone; "Save to Library" button in Transparency step |
| `app/static/css/style.css` | Sprite grid cards, detail view, modal overlay, filmstrip in library context |
| `app/static/js/app.js` | No changes (showTool already handles new tool-panel IDs) |
| `app/static/js/upload.js` | Add "Select from Library" button handler — opens modal, on selection sets video source from library resource URL |
| `app/static/js/transparency.js` | Add "Save to Sprite Library" button handler — opens modal to pick sprite + name loop, POSTs to library API |
| `app/static/js/resize.js` | Add "Import from Library" button handler — opens modal to pick loops, loads frames as resize input |
| `app/main.py` | Register `library_bp` blueprint |
| `app/main.py` | Add `LIBRARY_FOLDER` config (`/app/library`) + `os.makedirs` |
| `docker-compose.yml` | Add `library` named volume |
| `Dockerfile` | No changes needed (library dir created at runtime) |

## Implementation Order

1. **Backend first**: `library.py` with CRUD endpoints for sprites, resources, and loops. JSON file-based storage.
2. **Library UI**: `sprite-library.js` with grid view and detail view in a new tool panel.
3. **Modal component**: `library-modal.js` — reusable sprite/loop picker dialog.
4. **Video to Frames integration**: "Select from Library" in upload step, "Save to Library" in transparency step.
5. **Resize integration**: "Import from Library" alongside the dropzone.
6. **Polish**: thumbnail generation, search/filter, confirmation dialogs for destructive actions.

## Design Considerations

- **JSON file storage**: Simple, no database dependency. `sprites.json` is the master index, each sprite has its own `sprite.json`. Reads are fast, writes use atomic file replacement (write to temp + rename).
- **Volume persistence**: Library data stored in a dedicated Docker volume so it survives container rebuilds.
- **No framework needed**: Follows existing vanilla JS IIFE pattern. Modal is a shared module that other tools import via a global function.
- **Frame reuse**: When saving from Video to Frames, frames are **copied** (not moved) so the session output remains downloadable. This avoids data loss if the user wants both.
- **Thumbnail auto-generation**: When creating/updating a loop, the first frame is resized to 128x128 and saved as the sprite thumbnail (if it's the first loop, or explicitly set).
