# Sprite Forge Redesign Spec: Point & Click Adventure Asset Manager

## 1. INFORMATION ARCHITECTURE

### New Navigation Hierarchy

```
┌─ HEADER ─────────────────────────────────────────────────────────────┐
│  [☰] Sprite Forge    Project: "Space Quest Remake" [▼ switch]        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ PROJECT HOME (default view) ──────────────────────────────────┐  │
│  │                                                                │  │
│  │  [Characters]  [Backgrounds]  [Objects]  [UI]  [Sounds]        │  │
│  │   ─── category tabs/filters ───                                │  │
│  │                                                                │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │  │
│  │  │ Roger  │  │ Guard  │  │ Sarien │  │ + New  │               │  │
│  │  │ Wilco  │  │ Droid  │  │Corridor│  │ Asset  │               │  │
│  │  │ 2 views│  │ 1 view │  │ 0 views│  │        │               │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘               │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ ASSET DETAIL (replaces grid when asset clicked) ──────────────┐  │
│  │  [← Back]   "Roger Wilco"  [Character] [tags: protagonist]    │  │
│  │                                                                │  │
│  │  ┌─ HERO IMAGE ──┐  ┌─ ACTIONS ──────────────────────────┐    │  │
│  │  │               │  │ [AI Generate]  [Upload]  [Paste]    │    │  │
│  │  │   thumbnail   │  │ [AI Animate]   [Crop]   [Resize]   │    │  │
│  │  │               │  │ [Make Transparent]                   │    │  │
│  │  └───────────────┘  └────────────────────────────────────┘    │  │
│  │                                                                │  │
│  │  ── SOURCE FILES ──────────────────────────────────────────    │  │
│  │  walk_reference.mp4 [Open in V2F]  concept_art.png [Remove]   │  │
│  │                                                                │  │
│  │  ── VIEWS (AGS Views) ────────────────────────────────────     │  │
│  │  ┌─ walk_south (Loop 0) ──────────────────────────────────┐   │  │
│  │  │ [1][2][3][4][5][6][7][8]  ▶ Preview  | 8 frames 64x64│   │  │
│  │  │ [Edit Frames] [Transparent] [AI Animate] [Export] [✕]  │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  │  ┌─ idle (Loop 1) ───────────────────────────────────────┐    │  │
│  │  │ [1][2][3][4]  ▶ Preview  | 4 frames 64x64            │    │  │
│  │  │ [Edit Frames] [Transparent] [AI Animate] [Export] [✕]  │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  │  [+ New View]  [+ From Video]  [+ AI Generate View]           │  │
│  │                                                                │  │
│  │  ── VIDEOS ────────────────────────────────────────────────    │  │
│  │  walk_south_gen.mp4 [▶ Play] [Extract Frames] [Remove]       │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ TOOL PANEL (slides in over content, has [← Back to Asset]) ──┐  │
│  │  Any tool: V2F wizard, Transparency, Crop, Resize,            │  │
│  │  AI Generate, AI Animate — all launched contextually           │  │
│  │  from an asset. Results save back to the originating asset.    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### User Flow

```
Project Selector
  └→ Project Home (asset grid with category tabs)
       ├→ [+ New Asset] → name, category, tags → Asset Detail
       └→ Click asset card → Asset Detail
            ├→ Hero image area → [AI Generate] → tool panel (saves back to asset)
            ├→ [+ New View] → upload frames / name → view appears
            ├→ [+ From Video] → picks source file → V2F wizard → frames save as view
            ├→ View actions:
            │    ├→ [Edit Frames] → V2F Step 4 style editor (on view's frames)
            │    ├→ [Transparent] → transparency tool (on view's frames)
            │    ├→ [AI Animate] → animation tool (source = view frame 1)
            │    ├→ [Crop] / [Resize] → batch on view's frames
            │    └→ [Export] → download ZIP
            ├→ Source files → [Open in V2F] → wizard → save as new view
            └→ Videos → [Extract Frames] → frame count picker → save as new view
```

### Key UI Change: Sidebar Becomes Minimal

The 7-tool sidebar **goes away**. It's replaced by:
- A **header bar** with project selector and search
- The **asset grid** as the home screen
- **Contextual action buttons** on each asset/view that open tools
- Tools open as **overlay panels** with a "Back to Asset" button instead of as sidebar-driven tabs

The sidebar could optionally remain as a thin project-level nav (Home, Settings, Export All) but it's no longer the primary navigation.

---

## 2. DATA MODEL

### Filesystem Layout

```
library/
├── projects.json                          # Project index
├── projects/
│   └── <project_id>/
│       ├── project.json                   # Project metadata + art style prompt
│       ├── prompts.json                   # Project-scoped prompt library
│       └── assets.json                    # Asset index for this project
├── assets/
│   └── <asset_id>/
│       ├── asset.json                     # Asset metadata (name, category, tags)
│       ├── thumbnail.png
│       ├── resources/                     # Source files (unchanged)
│       │   └── <resource_id>.ext
│       ├── views/                         # Renamed from "loops"
│       │   └── <view_id>/
│       │       ├── view.json              # Was loop.json
│       │       ├── frame_0001.png
│       │       └── ...
│       └── videos/                        # AI-generated videos (unchanged)
│           └── <video_id>.mp4
```

### Concrete Example

**projects.json:**
```json
[
  {
    "id": "proj_a1b2c3",
    "name": "Space Quest Remake",
    "created": "2026-03-11T10:00:00Z",
    "asset_count": 3
  }
]
```

**projects/proj_a1b2c3/project.json:**
```json
{
  "id": "proj_a1b2c3",
  "name": "Space Quest Remake",
  "created": "2026-03-11T10:00:00Z",
  "art_style": "VGA pixel art, 320x200 resolution, 256 color palette, Sierra adventure game style, dithered shading",
  "default_resolution": { "width": 64, "height": 64 },
  "categories": ["characters", "backgrounds", "objects", "ui", "sounds"]
}
```

**projects/proj_a1b2c3/prompts.json:**
```json
[
  {
    "id": "proj-walk-cycle",
    "name": "Walk Cycle (Project Style)",
    "prompt": "A side-view walking pose, {{art_style}}, solid green background (#00FF00), no shadows, {{asset_name}}",
    "builtin": false
  }
]
```

**projects/proj_a1b2c3/assets.json:**
```json
[
  {
    "id": "ast_roger",
    "name": "Roger Wilco",
    "category": "characters",
    "tags": ["protagonist", "human", "janitor"],
    "view_count": 2,
    "resource_count": 1,
    "created": "2026-03-11T10:05:00Z"
  },
  {
    "id": "ast_corridor",
    "name": "Sarien Spaceship Corridor",
    "category": "backgrounds",
    "tags": ["sarien", "interior", "sci-fi"],
    "view_count": 0,
    "resource_count": 1,
    "created": "2026-03-11T11:00:00Z"
  }
]
```

**assets/ast_roger/asset.json:**
```json
{
  "id": "ast_roger",
  "project_id": "proj_a1b2c3",
  "name": "Roger Wilco",
  "category": "characters",
  "tags": ["protagonist", "human", "janitor"],
  "created": "2026-03-11T10:05:00Z",
  "resources": [
    {
      "id": "res_abc123",
      "filename": "roger_concept.png",
      "stored_name": "res_abc123.png",
      "type": "image",
      "uploaded": "2026-03-11T10:06:00Z"
    }
  ],
  "views": [
    {
      "id": "view_walk_s",
      "name": "walk_south",
      "ags_loop": 0,
      "frame_count": 8,
      "width": 64,
      "height": 64,
      "delay": 100
    },
    {
      "id": "view_idle",
      "name": "idle",
      "ags_loop": 1,
      "frame_count": 4,
      "width": 64,
      "height": 64,
      "delay": 150
    }
  ],
  "videos": [
    {
      "id": "vid_xyz789",
      "name": "walk_south_generation",
      "filename": "vid_xyz789.mp4",
      "created": "2026-03-11T10:30:00Z"
    }
  ]
}
```

### Old → New Field Mapping

| Old (sprite.json) | New (asset.json) | Notes |
|---|---|---|
| `id` | `id` | Same UUID |
| `name` | `name` | Same |
| *(none)* | `project_id` | **New** — links asset to project |
| *(none)* | `category` | **New** — characters/backgrounds/objects/ui/sounds |
| *(none)* | `tags` | **New** — freeform string array |
| `resources[]` | `resources[]` | Identical structure |
| `loops[]` | `views[]` | **Renamed**. Same internal structure plus `ags_loop` index |
| `loops[].id` | `views[].id` | Same |
| `loops[].name` | `views[].name` | Same (but encourage AGS-style names like `walk_south`) |
| *(none)* | `views[].ags_loop` | **New** — integer loop index for AGS export |
| `loops[].frame_count` | `views[].frame_count` | Same |
| `loops[].width/height` | `views[].width/height` | Same |
| `loops[].delay` | `views[].delay` | Same |
| `videos[]` | `videos[]` | Identical structure |

### Filesystem Mapping

| Old Path | New Path |
|---|---|
| `library/sprites.json` | `library/projects/<id>/assets.json` |
| `library/<sprite_id>/sprite.json` | `library/assets/<asset_id>/asset.json` |
| `library/<sprite_id>/loops/<loop_id>/` | `library/assets/<asset_id>/views/<view_id>/` |
| `library/<sprite_id>/loops/<id>/loop.json` | `library/assets/<asset_id>/views/<id>/view.json` |
| `library/<sprite_id>/resources/` | `library/assets/<asset_id>/resources/` |
| `library/<sprite_id>/videos/` | `library/assets/<asset_id>/videos/` |
| `library/prompts.json` | `library/projects/<id>/prompts.json` |

---

## 3. TOOL & NAVIGATION MAP

### Sidebar Tools → Contextual Actions

| Old Sidebar Tool | New Location | How It's Launched |
|---|---|---|
| **Sprite Library** | **Project Home** — the default view | No longer a sidebar item; it IS the app |
| **AI Generate** | Asset Detail → "AI Generate" button | Opens with `asset_id` context; saves hero image or frames back to asset |
| **AI Animate** | View actions → "AI Animate" button | Opens with `asset_id` + `view_id` context; source frame pre-selected |
| **Video to Frames** | Asset Detail → "From Video" or Source Files → "Open in V2F" | Opens with `asset_id` context; extracted frames save as a new view |
| **Make Transparent** | View actions → "Transparent" button | Opens with `asset_id` + `view_id` + frame list pre-loaded |
| **Crop** | Asset Detail → "Crop" action on hero image or individual frame | Opens with image pre-loaded; result saves back to asset |
| **Resize** | View actions → "Resize" button | Opens with view's frames pre-loaded; result overwrites view frames |

### Navigation Change

| Old | New |
|---|---|
| `showTool(toolId)` — sidebar toggles tool panels | `navigate(route)` — pushes state: `home`, `asset/<id>`, `tool/<name>` |
| `showStep(index)` — wizard steps | Unchanged within V2F tool panel |
| 7 sidebar items always visible | Project Home is default; tools are transient overlays |
| `activeTool` global | `currentRoute` with history stack (for Back button) |

---

## 4. WHAT STAYS THE SAME

### Backend Routes — Zero Changes Needed

These routes are **session-based** (they operate on temp `output/<session_id>` directories) and don't touch library storage. They can be used as-is:

| Route File | Endpoints | Why Stable |
|---|---|---|
| `upload.py` | `POST /api/upload`, `GET /api/video/<id>` | Stateless session-based video upload |
| `extract.py` | `POST /api/extract`, `POST /api/transparency`, `POST /api/rembg`, `POST /api/save-frame` | All operate on session dirs in `/app/output/` |
| `export.py` | `GET /api/frames/...`, `GET /api/download/<session>` | Serves from session output dirs |
| `resize.py` | `POST /api/resize`, `GET /api/download-resized/<session>` | Session-based processing |
| `image_transparent.py` | `POST /api/upload-image`, `GET /api/download-image/<session>` | Session-based single image |
| `crop.py` | `POST /api/crop`, `GET /api/crop-preview/...`, `GET /api/download-crop/...` | Session-based cropping |
| `ai_generate.py` | `POST /api/ai-generate`, `POST /api/ai-generate/refine`, `GET /api/ai-generate/image/...`, `GET /api/ai-generate/models` | Session-based generation |
| `ai_animate.py` | `POST /api/ai-animate`, `GET /api/ai-animate/status/...`, `GET /api/ai-animate/video/...` | Session-based async generation |

**That's 20+ endpoints across 7 route files that need zero changes.**

### Services — Zero Changes Needed

| File | Why Stable |
|---|---|
| `services/video.py` | Pure FFmpeg wrapper, no library awareness |
| `services/image.py` | Pure Pillow/NumPy/rembg processing, no library awareness |

### JS Modules — Zero Changes Needed (internally)

These IIFE modules need no internal changes. They just need to be **launched differently** (from asset context instead of sidebar):

| File | Why Stable |
|---|---|
| `upload.js` | Self-contained drag-drop + XHR |
| `extract.js` | Self-contained crop overlay + extraction |
| `preview.js` | Self-contained canvas animation |
| `transparency.js` | Self-contained canvas pixel editing |
| `resize.js` | Self-contained batch resize |
| `image-transparency.js` | Self-contained single image transparency |
| `crop.js` | Self-contained crop tool |

### Docker / Infrastructure — Zero Changes

| File | Why Stable |
|---|---|
| `Dockerfile` | No new system deps needed |
| `docker-compose.yml` | Volume mounts and env vars unchanged |
| `requirements.txt` | No new Python packages |

---

## 5. RISK FLAGS

### Key Risks

**1. `ai_animate.py` hardcoded library paths**
The animate endpoint reads source frames from `library/<sprite_id>/loops/<loop_id>/frame_0001.png`. This changes to `library/assets/<asset_id>/views/<view_id>/frame_0001.png`. All `ai_animate.py` routes that touch library paths need updating.

**2. `library.py` is the most heavily modified file**
Every single route uses `_lib_root()` + sprite_id path patterns. All 18+ endpoints need their path logic updated. This is the biggest single file change.

**3. Frontend navigation overhaul**
Replacing the sidebar-driven `showTool()` model with hash routing touches `app.js`, `index.html`, and every JS module that calls `showTool()`. The MutationObserver pattern that existing modules rely on must survive.

**4. `library-modal.js` used by multiple tools**
The shared modal is used by Video to Frames, AI Animate, and Resize to pick sprites/loops. It needs to understand the new asset → view hierarchy.

---

## 6. DECISIONS (locked in)

| Question | Decision |
|---|---|
| Navigation | **Hash routing** (`#/`, `#/asset/<id>`, `#/asset/<id>/tool/<name>`) |
| Multi-project | **Single implicit project** for now; data model supports multi-project for later |
| Backwards compat | **Hard reset** — wipe library volume, fresh start, no migration |
| loops → views | **Full rename** everywhere: routes, JSON keys, filenames, UI |
| Categories | **Fixed enum**: characters, backgrounds, objects, ui, sounds |
| Sounds | **Metadata + file upload** (WAV/MP3 in resources[]), no processing tools |
| Tool panels | **Overlay** — same `.tool-panel.active` pattern, launched from asset context |

See [REFACTOR.md](REFACTOR.md) for the phased implementation plan.
