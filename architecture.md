# SpriteForge - Architecture

## Overview

SpriteForge is a single-page web application for game sprite creation and management. It runs as a Dockerized Flask app with a vanilla JS frontend. The app uses hash-based routing to navigate between a project home (asset grid), asset detail pages, and individual tool panels. Server-side processing uses FFmpeg for video, Pillow/NumPy/SciPy for image manipulation, rembg (u2net) for AI background removal, and Google GenAI (AI Studio or Vertex AI) for AI sprite generation and video animation.

## UI Layout

```
┌─ HEADER ── [ Search ] [ + New Asset ] [ Generate ] [ ⚙ ] ────┐
├───────────────────────────────────────────────────────────────┤
│  CONTENT AREA (single active panel at a time)                 │
│                                                               │
│  #/              → Project Home (asset grid + category tabs)  │
│  #/asset/<id>    → Asset Detail (views, resources, tools)     │
│  #/asset/<id>/tool/<name> → Tool panel (with asset context)   │
│  #/tool/<name>   → Standalone tool (no asset context)         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

The header contains a search box, "+ New Asset" button, "Generate" shortcut (opens standalone AI Generate), and a gear icon (project settings modal with General and Prompt Library tabs). Only one panel is `.active` at a time.

## Directory Structure

```
spriteforge/
├── Dockerfile              # Python 3.12-slim + FFmpeg, pre-downloads u2net.onnx model
├── docker-compose.yml      # Dev setup with volume mounts, env vars, Vertex AI config
├── requirements.txt        # Python dependencies
├── vertex-secret.json      # GCP service account key (gitignored)
├── .env                    # API keys and GCP config (gitignored)
├── build-plan.md           # Phased implementation plan
├── app/
│   ├── main.py             # Flask app entry point, config, blueprint registration
│   ├── routes/
│   │   ├── upload.py       # POST /api/upload, GET /api/video/<id>
│   │   ├── extract.py      # POST /api/extract, /api/transparency, /api/rembg, /api/save-frame
│   │   ├── export.py       # GET /api/frames/<session>/<sub>/<file>, GET /api/download/<session>
│   │   ├── resize.py       # POST /api/resize, GET /api/download-resized/<session>
│   │   ├── image_transparent.py  # POST /api/upload-image, GET /api/download-image/<session>
│   │   ├── library.py      # CRUD for projects, assets, views, resources (/api/projects/*, /api/assets/*)
│   │   ├── crop.py         # POST /api/crop, GET /api/download-crop/<session>
│   │   ├── ai_generate.py  # AI image generation + prompt library CRUD (/api/ai-generate/*)
│   │   └── ai_animate.py   # AI video generation with Veo (/api/ai-animate/*)
│   ├── services/
│   │   ├── video.py        # FFmpeg wrapper: probe_video(), extract_frames()
│   │   └── image.py        # apply_transparency(), apply_rembg()
│   └── static/
│       ├── index.html      # Single HTML page with all panels
│       ├── css/style.css   # Dark theme, all component styles
│       └── js/
│           ├── app.js           # Global state, hash router (navigate, parseRoute, applyRoute)
│           ├── project-home.js  # Asset grid with category tabs, search, create asset modal
│           ├── project-settings.js  # Settings modal with General + Prompt Library tabs
│           ├── asset-detail.js  # Asset detail view with resource strip, views, tool buttons
│           ├── upload.js        # Drag-drop upload, XHR progress, video preview
│           ├── extract.js       # Crop overlay, custom video controls, range slider, frame extraction
│           ├── preview.js       # Canvas animation preview with filmstrip
│           ├── transparency.js  # Transparency tools, eraser, flood fill, zoom, preview bg
│           ├── resize.js        # Batch image resize with aspect lock, smart download
│           ├── image-transparency.js  # Single image transparency tool
│           ├── crop.js          # Image crop with zoom/pan, aspect ratios, unified Download/Save
│           ├── markup.js        # Image annotation/markup tool
│           ├── ai-generate.js   # AI sprite generation, prompt dropdown, save to library
│           ├── ai-animate.js    # AI animation, prompt dropdown, save video
│           └── library-modal.js # Shared modal for library selection/save dialogs
```

## Navigation Architecture

The app uses a hash-based router defined in `app.js`:

| Route Pattern | View | Description |
|---------------|------|-------------|
| `#/` | `home` | Project home — asset grid with category tabs and search |
| `#/asset/<id>` | `asset` | Asset detail — hero image, resource strip, views, tool buttons |
| `#/asset/<id>/tool/<name>` | `tool` | Tool panel with asset context (e.g. crop an asset's image) |
| `#/tool/<name>` | `tool` | Standalone tool without asset (e.g. standalone AI Generate) |

**Route → Panel mapping** (`toolPanelMap` in `app.js`):
- `video-to-frames` → `tool-video-to-frames`
- `resize-images` → `tool-resize-images`
- `crop-image` → `tool-crop-image`
- `make-transparent` → `tool-make-transparent`
- `ai-generate` → `tool-ai-generate`
- `ai-animate` → `tool-ai-animate`
- `markup` → `tool-markup`

`applyRoute()` hides all panels then activates the matching one. Each tool's JS file uses a `MutationObserver` on its panel's `class` attribute to detect activation and initialize/load data.

Navigation history is managed manually via `routeHistory[]`, `navigate(hash)` pushes the current hash before changing, and `navigateBack()` pops the last entry.

## Data Model

### Projects
- Single default project (`projects/default/project.json`)
- Fields: `name`, `art_style` (template variable for prompts), `default_resolution`, `asset_count`

### Assets
- Each asset has a directory: `library/assets/<asset_id>/`
- `asset.json`: `id`, `name`, `category`, `tags[]`, `view_count`, `created_at`, `updated_at`
- Assets belong to a project via `projects/<project_id>/assets.json` index

### Views (formerly "loops")
- Frame sequences within an asset: `library/assets/<asset_id>/views/<view_id>/`
- Contains numbered frame PNGs (`frame_0001.png`, etc.)
- Metadata: `name`, `frame_count`, `delay`

### Resources
- Uploaded files (images, videos) associated with an asset
- Stored in `library/assets/<asset_id>/resources/`
- Can be sent to tools (e.g. "Open in AI Animate" from context menu)

### Prompts
- Stored in `library/projects/default/prompts.json`
- Fields: `id`, `name`, `prompt`, `category` (characters/backgrounds/objects/ui/sounds), `gen_type` (image/video/both), `builtin`
- Default built-in prompts provided; users can add/edit/delete via Settings → Prompt Library
- AI Generate filters to `gen_type` = image or both; AI Animate filters to video or both

## AI Backend Architecture

The app supports two Google AI backends, selected automatically based on environment variables:

- **AI Studio** (default): Uses `genai.Client(api_key=...)`. Simpler setup, fewer models.
- **Vertex AI**: Uses `genai.Client(vertexai=True, project=..., location=...)`. Activated when `GOOGLE_CLOUD_PROJECT` is set. Provides access to Veo 3.x video models and uses service account authentication.

Backend detection is done by `_is_vertex()` which checks for `GOOGLE_CLOUD_PROJECT`. Both `ai_generate.py` and `ai_animate.py` maintain separate model lists per backend (`MODELS_AI_STUDIO` / `MODELS_VERTEX_AI`) and return the appropriate list from their `/models` endpoint.

### Vertex AI Specifics

- **Global endpoint routing**: Gemini 3.x preview models require `location='global'` instead of a regional endpoint. The `_get_client()` function in `ai_generate.py` checks the model name against `_GLOBAL_MODELS` and switches location accordingly.
- **Video generation REST API**: The `google-genai` SDK's `generate_videos()` method only works with AI Studio. For Vertex AI, `ai_animate.py` implements direct REST API calls:
  - `POST .../models/{model}:predictLongRunning` to start generation
  - `POST .../models/{model}:fetchPredictOperation` to poll for completion
  - OAuth2 token obtained via `google.auth.default()` with `cloud-platform` scope
- **Service account**: Mounted read-only from `vertex-secret.json` via Docker volume

### Template Variables in Prompts
- `{{art_style}}` — replaced with the project's art style setting
- `{{asset_name}}` — replaced with the current asset's name (if applicable)

## Tools

### Tool: AI Generate

- Generate sprite images from text prompts using Google Gemini image generation models
- **Models**: Gemini 2.5 Flash Image (default), Gemini 3.1 Flash Image, Gemini 3 Pro Image
- **Reference images**: Upload via file picker, select from library, or paste from clipboard
- **Iterative refinement**: Each generation builds on the conversation history; refine prompts to adjust the output
- **Prompt library dropdown**: Type-ahead search filtered to image/both prompts; on selection replaces or appends to current prompt
- **Save Current Prompt**: Save the current prompt textarea contents to the prompt library
- **Standalone mode**: Accessible from project home via "Generate" button (no asset context required)
- **Save to library**: Save generated images directly to an asset as a new view
- Session state tracked in `output/<session_id>/ai_generate/history.json`

### Tool: AI Animate

- Generate animation videos from sprite images using Veo video generation models
- **Models**: Veo 2.0 (AI Studio + Vertex), Veo 3.0/3.1 and fast variants (Vertex AI only)
- **Source**: Select a sprite and frame from the library as the animation source
- **Duration**: Configurable via dropdown (4s, 5s, 6s, 8s)
- **Audio**: Toggle to generate video with or without audio (off by default)
- **Prompt library dropdown**: Type-ahead search filtered to video/both prompts; replace/append behavior
- **Background processing**: Video generation runs in a daemon thread; frontend polls `/status/<session_id>` every 5 seconds
- **Save video to library**: Save the generated MP4 directly to the asset's video collection
- AI Studio uses the SDK `generate_videos()` method; Vertex AI uses the REST API with long-running operation polling

### Tool: Video to Frames (4-step wizard)

#### Step 1: Upload
- User uploads a video via drag-drop or file picker
- `POST /api/upload` saves the file to `/app/uploads/<uuid>.<ext>`
- Server runs `ffprobe` to extract metadata (duration, resolution, fps)
- Frontend stores `videoId` in global `state` and sets video sources for both the preview and extract players

#### Step 2: Extract
- User configures: time range (start/end), crop region (draggable overlay on video), output resolution, frame count
- Crop overlay maps CSS pixels to video pixels using `videoWidth/clientWidth` ratio
- `POST /api/extract` calls `extract_frames()` which runs FFmpeg:
  ```
  ffmpeg -ss {start} -to {end} -i {video} -vf "fps={fps},crop={w}:{h}:{x}:{y},scale={outW}:{outH}" frame_%04d.png
  ```
- Frames saved to `/app/output/<session_id>/original/`
- Frontend receives frame URLs and stores `sessionId` + `frames[]` in state

#### Step 3: Preview
- Loads extracted frames into `<canvas>` animation loop
- Configurable delay, filmstrip thumbnail strip
- Play/pause controls, frame indicator

#### Step 4: Transparency
- **Color Removal**: Pick color via eyedropper or color picker, set tolerance
  - `POST /api/transparency` runs `apply_transparency()` on each frame
  - Uses NumPy for color distance calculation
  - "Edges only" mode uses `scipy.ndimage.label()` to flood-fill from edges only (preserves interior same-color pixels like white eyes)
  - Anti-aliased edges via gradient alpha in the tolerance boundary
- **AI Removal**: `POST /api/rembg` runs `rembg.remove()` (u2net neural network) on each frame
- **Manual Touch-up**:
  - Brush mode: paint to erase (left-click) or restore (right-click) pixels
  - Flood fill mode: click to erase all connected similar-color pixels (with tolerance)
  - Zoom: buttons or Ctrl+scroll to zoom up to 8x for fine detail work
  - Edits saved per-frame via `POST /api/save-frame` (FormData with PNG blob)
- Transparent frames saved to `/app/output/<session_id>/transparent/`
- Preview background: checkerboard, solid colors, or custom color picker
- Download ZIP serves transparent frames if they exist, otherwise originals

### Tool: Make Transparent (single image)

- Standalone tool for making a single image transparent (no video required)
- Drag-drop or file picker uploads image via `POST /api/upload-image`
- Creates a session with one frame, reuses the same backend endpoints
- Same canvas tools as Video to Frames Step 4: eyedropper, color picker, tolerance, edges only, brush eraser, flood fill
- Zoom from 10% to 8x with controls in bottom-right under canvas
- Unified Download and Save buttons side-by-side
- Download single PNG via `GET /api/download-image/<session_id>`

### Tool: Crop

- Upload or drag-drop an image, draw a crop selection on a zoomable/pannable canvas
- **Zoom**: Mouse wheel zoom, +/- buttons, Fit button; pan by scrolling when zoomed
- **Aspect ratios**: Free, 1:1, 4:3, 16:9, 3:2, "All" (selects entire image)
- **Two-way sync**: Dragging the selection updates X/Y/W/H inputs in real time and vice versa
- **Crop preview**: Live preview panel shows the cropped region
- **Unified actions**: Download and Save buttons side-by-side (no separate "Crop" button)
- `POST /api/crop` sends the image with x, y, w, h parameters; server crops with Pillow
- Can load images from library when navigated with asset context

### Tool: Resize Images

- Drag-drop or file picker for batch image upload (PNG, JPG, WebP, GIF)
- Dropzone hides after file selection; thumbnails shown horizontally with "+ Add / Change" button
- Two resize modes:
  - **Dimensions**: Set width/height with optional aspect ratio lock
  - **Percentage**: Scale slider (1-800%)
- **Mirror/Flip**: Horizontal and vertical flip options
- Interpolation options: Nearest Neighbor, Bilinear, Bicubic, Lanczos
- **Stacked preview**: Original and resized images shown vertically
- **Smart download**: Single image → PNG, multiple images → ZIP
- **Unified actions**: Download and Save buttons side-by-side (no separate "Resize" button)
- `POST /api/resize` sends images + params, server uses Pillow `Image.resize()` + `Image.transpose()`

### Tool: Markup

- Annotate images with drawing tools
- Canvas-based with tool selection sidebar

## Global State (`app.js`)

```js
const state = {
    currentStep: 0,        // Active wizard step index (0-3)
    videoId: null,          // UUID of uploaded video
    sessionId: null,        // UUID of extraction session
    videoMeta: null,        // {duration, width, height, fps}
    frames: [],             // Array of original frame URLs
    transparentFrames: null,// Array of transparent frame URLs (or null)
    animationDelay: 100,    // Preview animation delay in ms
    currentAssetId: null,   // Currently viewed asset ID (from route)
    currentRoute: null,     // Parsed route object {view, assetId?, tool?}
};
```

Each JS file is an IIFE that reads DOM elements and attaches event listeners. They communicate through the shared `state` object and `MutationObserver` on panel `class` changes to detect when a panel becomes active.

## API Endpoints

### Projects & Assets (library.py)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| GET | `/api/projects/<id>` | Get project settings |
| PUT | `/api/projects/<id>` | Update project settings |
| GET | `/api/projects/<id>/assets` | List assets in project |
| POST | `/api/projects/<id>/assets` | Create new asset |
| GET | `/api/assets/<id>` | Get asset detail |
| PUT | `/api/assets/<id>` | Update asset (name, category, tags) |
| DELETE | `/api/assets/<id>` | Delete asset and all data |
| GET | `/api/assets/<id>/thumbnail` | Serve auto-generated thumbnail |
| POST | `/api/assets/<id>/resources` | Upload resource (image/video) |
| GET | `/api/assets/<id>/resources/<rid>/file` | Serve resource file |
| PUT | `/api/assets/<id>/resources/<rid>` | Rename resource |
| PUT | `/api/assets/<id>/resources/<rid>/file` | Overwrite resource file |
| POST | `/api/assets/<id>/resources/<rid>/duplicate` | Duplicate resource |
| DELETE | `/api/assets/<id>/resources/<rid>` | Delete resource |
| POST | `/api/assets/<id>/views` | Create view (upload frames) |
| GET | `/api/assets/<id>/views/<vid>` | Get view metadata |
| PUT | `/api/assets/<id>/views/<vid>` | Update view (rename, delay) |
| DELETE | `/api/assets/<id>/views/<vid>` | Delete view |
| GET | `/api/assets/<id>/views/<vid>/frames/<file>` | Serve frame PNG |
| PUT | `/api/assets/<id>/views/<vid>/frames/<file>` | Overwrite frame |
| GET | `/api/assets/<id>/views/<vid>/download` | Download view as ZIP |
| GET | `/api/assets/<id>/download` | Download all views as ZIP |

### AI Generate (ai_generate.py)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai-generate/models` | List image generation models |
| POST | `/api/ai-generate` | Generate image from prompt (multipart or JSON) |
| POST | `/api/ai-generate/refine` | Refine previous generation |
| GET | `/api/ai-generate/image/<session>/<file>` | Serve generated image |
| GET | `/api/ai-generate/prompts` | List prompt library |
| POST | `/api/ai-generate/prompts` | Create prompt (name, prompt, category, gen_type) |
| PUT | `/api/ai-generate/prompts/<id>` | Update prompt |
| DELETE | `/api/ai-generate/prompts/<id>` | Delete prompt |
| POST | `/api/ai-generate/prompts/reset` | Reset to default prompts |

### AI Animate (ai_animate.py)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai-animate/models` | List video generation models |
| POST | `/api/ai-animate` | Start video generation (async) |
| GET | `/api/ai-animate/status/<session>` | Poll generation status |
| GET | `/api/ai-animate/video/<session>/<file>` | Serve generated video |
| POST | `/api/ai-animate/save-video-to-library` | Save video to asset |
| POST | `/api/ai-animate/save-to-library` | Extract frames from video and save as view |
| GET | `/api/ai-animate/library-video/<asset>/<video>` | Serve saved library video |

### Video Processing

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload video file (multipart) |
| GET | `/api/video/<video_id>` | Stream uploaded video |
| POST | `/api/extract` | Extract frames from video |
| POST | `/api/transparency` | Apply color-based transparency |
| POST | `/api/rembg` | Apply AI background removal |
| POST | `/api/save-frame` | Save manually edited frame |
| GET | `/api/frames/<session>/<sub>/<file>` | Serve individual frame PNG |
| GET | `/api/download/<session>` | Download frames as ZIP |

### Image Tools

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/resize` | Resize batch of images (multipart) |
| GET | `/api/download-resized/<session>` | Download resized images (PNG or ZIP) |
| POST | `/api/upload-image` | Upload single image for transparency tool |
| GET | `/api/download-image/<session>` | Download transparent PNG |
| POST | `/api/crop` | Crop an image (multipart) |
| GET | `/api/crop-preview/<session>` | Preview cropped image |
| GET | `/api/download-crop/<session>` | Download cropped image |

## Docker Setup

- **Base image**: `python:3.12-slim` with `ffmpeg` from apt
- **Model pre-download**: u2net.onnx (~176MB) is downloaded at build time to `/root/.u2net/`
- **Volumes**: `uploads`, `output`, and `library` are named Docker volumes; `vertex-secret.json` is bind-mounted read-only
- **Live reload**: `app/` is bind-mounted so code changes apply immediately in dev
- **Port**: 5000

## Key Design Decisions

- **No frontend framework**: Vanilla JS keeps the app simple and dependency-free on the client side
- **IIFE per module**: Each JS file is wrapped in an IIFE to avoid global scope pollution, sharing state through the single `state` object
- **Hash-based routing**: `app.js` provides `navigate()`, `navigateBack()`, `parseRoute()`, and `applyRoute()` for SPA navigation. No external router library needed
- **MutationObserver activation**: Each tool module observes its panel's `class` attribute for the `active` class to know when to initialize, load data, or consume pending resources
- **Asset-centric organization**: All content is organized under assets, which have views (frame sequences) and resources (uploaded files). Tools operate on asset data or standalone
- **Unified action buttons**: All tools use consistent Download + Save side-by-side buttons instead of separate process → download workflows
- **Server-side processing**: All heavy image/video processing happens server-side (FFmpeg, Pillow, rembg). The client handles only preview rendering and manual pixel editing
- **Client-side eraser**: Manual touch-up edits pixels directly in canvas ImageData for instant feedback, then persists to server via `/api/save-frame`
- **Edge-connected transparency**: SciPy flood-fill labeling solves the problem of removing background color without destroying same-colored interior pixels (e.g., white eyes on a white background)
- **Dual AI backend**: Supports both AI Studio (simple API key) and Vertex AI (service account + REST API) to give flexibility based on available credits and model access
- **Async video generation**: AI Animate runs video generation in background threads with status polling, since Veo generation can take minutes
- **JSON file storage**: No database required; all data (projects, assets, prompts, status) stored as JSON files on disk within Docker volumes
- **Prompt library**: Centralized prompt storage with category and generation type fields, shared across AI tools via filterable dropdowns with replace/append selection behavior
