# Sprite Forge - Architecture

## Overview

Sprite Forge is a single-page web application with multiple sprite-related tools accessible via a collapsible sidebar. It runs as a Dockerized Flask app with a vanilla JS frontend and uses FFmpeg for video processing, Pillow/NumPy/SciPy for image manipulation, rembg (u2net) for AI background removal, and Google GenAI (AI Studio or Vertex AI) for AI sprite generation and video animation.

## UI Layout

```
┌─ HEADER (sidebar toggle + title) ─────────────────────────────┐
├────────┬──────────────────────────────────────────────────────┤
│ SIDE   │  CONTENT AREA                                        │
│ BAR    │  ┌─ tool-panel: Video to Frames ──────────────────┐  │
│        │  │  wizard-header (step dots 1-4)                 │  │
│ [▶] V  │  │  step-section (4 wizard steps)                 │  │
│ [⤡] R  │  │  wizard-footer (prev/next buttons)            │  │
│ [▦] T  │  └────────────────────────────────────────────────┘  │
│ [📚] L │  ┌─ tool-panel: Make Transparent (hidden) ────────┐  │
│ [✨] G │  │  dropzone → canvas + eraser/zoom + download    │  │
│ [🎬] A │  └────────────────────────────────────────────────┘  │
│ [✂] C  │  ┌─ tool-panel: AI Generate (hidden) ──────────────┐│
│        │  │  prompt + model select + reference image         ││
│ [«]    │  │  iterative refinement + save to library          ││
│        │  └──────────────────────────────────────────────────┘│
│        │  ┌─ tool-panel: AI Animate (hidden) ────────────────┐│
│        │  │  sprite select + prompt + model + duration/audio ││
│        │  │  video preview + save video to library           ││
│        │  └──────────────────────────────────────────────────┘│
└────────┴──────────────────────────────────────────────────────┘
```

The sidebar collapses to icon-only mode and auto-collapses on mobile (< 768px). Each tool has its own `.tool-panel`; only one is `.active` at a time. The "Video to Frames" tool contains the original 4-step wizard nested inside it.

## Directory Structure

```
spriteforge/
├── Dockerfile              # Python 3.12-slim + FFmpeg, pre-downloads u2net.onnx model
├── docker-compose.yml      # Dev setup with volume mounts, env vars, Vertex AI config
├── requirements.txt        # Python dependencies
├── vertex-secret.json      # GCP service account key (gitignored)
├── .env                    # API keys and GCP config (gitignored)
├── app/
│   ├── main.py             # Flask app entry point, config, blueprint registration
│   ├── routes/
│   │   ├── upload.py       # POST /api/upload, GET /api/video/<id>
│   │   ├── extract.py      # POST /api/extract, /api/transparency, /api/rembg, /api/save-frame
│   │   ├── export.py       # GET /api/frames/<session>/<sub>/<file>, GET /api/download/<session>
│   │   ├── resize.py       # POST /api/resize, GET /api/download-resized/<session>
│   │   ├── image_transparent.py  # POST /api/upload-image, GET /api/download-image/<session>
│   │   ├── library.py      # CRUD endpoints for Sprite Library (/api/library/*)
│   │   ├── crop.py         # POST /api/crop, GET /api/download-crop/<session>
│   │   ├── ai_generate.py  # AI image generation with Gemini (/api/ai-generate/*)
│   │   └── ai_animate.py   # AI video generation with Veo (/api/ai-animate/*)
│   ├── services/
│   │   ├── video.py        # FFmpeg wrapper: probe_video(), extract_frames()
│   │   └── image.py        # apply_transparency(), apply_rembg()
│   └── static/
│       ├── index.html      # Single HTML page with sidebar + tool panels
│       ├── css/style.css   # Dark theme, sidebar layout, all component styles
│       └── js/
│           ├── app.js      # Global state, tool navigation (showTool), step navigation (showStep)
│           ├── upload.js   # Drag-drop upload, XHR progress, video preview
│           ├── extract.js  # Crop overlay, custom video controls, range slider, frame extraction
│           ├── preview.js  # Canvas animation preview with filmstrip
│           ├── transparency.js  # Transparency tools, eraser, flood fill, zoom, preview bg
│           ├── resize.js   # Batch image resize with aspect lock, interpolation options
│           ├── image-transparency.js  # Single image transparency tool
│           ├── crop.js     # Image crop tool with visual selection
│           ├── ai-generate.js   # AI sprite generation UI, clipboard paste, save to library
│           ├── ai-animate.js    # AI animation UI, duration/audio controls, save video
│           ├── library-modal.js # Shared modal component for library selection/save dialogs
│           └── sprite-library.js  # Sprite Library grid view, detail view, loop management
```

## Navigation Architecture

The app uses two levels of navigation:

1. **Tool-level** (`showTool()`): Toggles `.active` on `.tool-panel` and `.sidebar-item` elements. When switching to "Video to Frames", re-calls `showStep()` to re-trigger MutationObservers in existing modules.

2. **Wizard-level** (`showStep()`): Within the Video to Frames tool, toggles `.active` on `.step-section` and `.step-dot` elements. Existing JS modules (upload, extract, preview, transparency) use `MutationObserver` on their step section's class attribute to detect activation — this pattern is preserved by nesting the wizard inside a tool panel without changing element IDs.

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

## Tools

### Tool: AI Generate

- Generate sprite images from text prompts using Google Gemini image generation models
- **Models**: Gemini 2.5 Flash Image (default), Gemini 3.1 Flash Image, Gemini 3 Pro Image
- **Reference images**: Upload via file picker or paste from clipboard
- **Iterative refinement**: Each generation builds on the conversation history; refine prompts to adjust the output
- **Prompt library**: Built-in sample prompts (pixel art, fantasy warrior, etc.) plus user-created custom prompts stored in `library/prompts.json`
- **Save to library**: Save generated images directly to the Sprite Library
- Session state tracked in `output/<session_id>/ai_generate/history.json`

### Tool: AI Animate

- Generate animation videos from sprite images using Veo video generation models
- **Models**: Veo 2.0 (AI Studio + Vertex), Veo 3.0/3.1 and fast variants (Vertex AI only)
- **Source**: Select a sprite and frame from the Sprite Library as the animation source
- **Duration**: Configurable via dropdown (4s, 5s, 6s, 8s)
- **Audio**: Toggle to generate video with or without audio (off by default)
- **Background processing**: Video generation runs in a daemon thread; frontend polls `/status/<session_id>` every 5 seconds
- **Save video to library**: Save the generated MP4 directly to the sprite's video collection in the library
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
- Creates a session with one frame, reuses the same backend endpoints:
  - `POST /api/transparency` for color-based removal
  - `POST /api/rembg` for AI background removal
  - `POST /api/save-frame` for manual edits
- Same canvas tools as Video to Frames Step 4: eyedropper, color picker, tolerance, edges only, brush eraser, flood fill, zoom, preview background
- Download single PNG via `GET /api/download-image/<session_id>`

### Tool: Crop

- Upload or drag-drop an image, draw a crop selection
- `POST /api/crop` sends the image with x, y, w, h parameters; server crops with Pillow
- Preview and download the cropped result

### Tool: Resize Images

- Drag-drop or file picker for batch image upload (PNG, JPG, WebP, GIF)
- Two resize modes:
  - **Dimensions**: Set width/height with optional aspect ratio lock
  - **Percentage**: Scale slider (1-800%)
- **Mirror/Flip**: Horizontal and vertical flip options (useful for left/right sprite animations)
- Interpolation options: Nearest Neighbor, Bilinear, Bicubic, Lanczos
- `POST /api/resize` sends images + params, server uses Pillow `Image.resize()` + `Image.transpose()`
- Resized images saved to `/app/output/<session_id>/resized/` as PNG
- Download ZIP via `GET /api/download-resized/<session_id>`

### Tool: Sprite Library

- Persistent catalog for organizing sprites, their animation loops, and AI-generated videos
- **Grid view**: Shows all sprites as cards with thumbnail, name, and loop count; searchable
- **Detail view**: Shows a sprite's resources (videos/images), loops (frame sequences), and saved videos
- **Resources**: Upload videos/images associated with a sprite; video resources can be opened directly in Video to Frames
- **Loops**: Named sequences of frames with filmstrip preview and animated playback
  - Create by uploading frames, or save from Video to Frames output
  - Download individual loops or all loops as ZIP
- **Videos**: AI-generated animation videos saved from AI Animate, stored as MP4 in `library/<sprite_id>/videos/`
- **Data storage**: JSON file-based (no database); `/app/library/sprites.json` master index + per-sprite `sprite.json` + frame files
- **Docker volume**: `library` named volume for persistence across container rebuilds
- **Integration points**:
  - Video to Frames Step 1: "Select from Sprite Library" button opens modal to pick video resource
  - Video to Frames Step 4: "Save to Sprite Library" button opens dialog to save frames as a loop
  - AI Generate: "Save to Sprite Library" saves generated images
  - AI Animate: Select source sprite/frame from library; save generated video back to library
  - Resize Images: "Import from Sprite Library" button opens modal to select loop frames as input

## Global State (`app.js`)

```js
const state = {
    currentStep: 0,      // Active wizard step index (0-3)
    videoId: null,        // UUID of uploaded video
    sessionId: null,      // UUID of extraction session
    videoMeta: null,      // {duration, width, height, fps}
    frames: [],           // Array of original frame URLs
    transparentFrames: null, // Array of transparent frame URLs (or null)
    animationDelay: 100,  // Preview animation delay in ms
};
```

Each JS file is an IIFE that reads DOM elements and attaches event listeners. They communicate through the shared `state` object and `MutationObserver` on step section `class` changes to detect when a step becomes active.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload video file (multipart) |
| GET | `/api/video/<video_id>` | Stream uploaded video |
| POST | `/api/extract` | Extract frames from video |
| POST | `/api/transparency` | Apply color-based transparency |
| POST | `/api/rembg` | Apply AI background removal |
| POST | `/api/save-frame` | Save manually edited frame (multipart) |
| GET | `/api/frames/<session>/<sub>/<file>` | Serve individual frame PNG |
| GET | `/api/download/<session>` | Download frames as ZIP |
| POST | `/api/resize` | Resize batch of images (multipart) |
| GET | `/api/download-resized/<session>` | Download resized images as ZIP |
| POST | `/api/upload-image` | Upload single image for transparency tool |
| GET | `/api/download-image/<session>` | Download transparent PNG |
| POST | `/api/crop` | Crop an image (multipart) |
| GET | `/api/crop-preview/<session>` | Preview cropped image |
| GET | `/api/download-crop/<session>` | Download cropped image |
| GET | `/api/ai-generate/models` | List available image generation models |
| POST | `/api/ai-generate` | Generate image from prompt (multipart or JSON) |
| POST | `/api/ai-generate/refine` | Refine previous generation with new prompt |
| GET | `/api/ai-generate/image/<session>/<file>` | Serve generated image |
| GET | `/api/ai-generate/prompts` | List prompt library |
| POST | `/api/ai-generate/prompts` | Create custom prompt |
| PUT | `/api/ai-generate/prompts/<id>` | Update custom prompt |
| DELETE | `/api/ai-generate/prompts/<id>` | Delete custom prompt |
| POST | `/api/ai-generate/prompts/reset` | Reset to default prompts |
| GET | `/api/ai-animate/models` | List available video generation models |
| POST | `/api/ai-animate` | Start video generation (async) |
| GET | `/api/ai-animate/status/<session>` | Poll generation status |
| GET | `/api/ai-animate/video/<session>/<file>` | Serve generated video |
| POST | `/api/ai-animate/save-video-to-library` | Save video to sprite library |
| POST | `/api/ai-animate/save-to-library` | Extract frames from video and save as loop |
| GET | `/api/ai-animate/library-video/<sprite>/<video>` | Serve saved library video |
| GET | `/api/library` | List all sprites |
| POST | `/api/library` | Create new sprite |
| GET | `/api/library/<id>` | Get sprite detail (metadata + loops) |
| PUT | `/api/library/<id>` | Rename sprite |
| DELETE | `/api/library/<id>` | Delete sprite and all data |
| GET | `/api/library/<id>/thumbnail` | Serve sprite thumbnail |
| POST | `/api/library/<id>/resources` | Upload resource (video/image) |
| DELETE | `/api/library/<id>/resources/<rid>` | Remove resource |
| GET | `/api/library/<id>/resources/<rid>/file` | Serve resource file |
| POST | `/api/library/<id>/loops` | Create loop (frames or from session) |
| GET | `/api/library/<id>/loops/<lid>` | Get loop metadata |
| PUT | `/api/library/<id>/loops/<lid>` | Rename loop |
| DELETE | `/api/library/<id>/loops/<lid>` | Delete loop |
| GET | `/api/library/<id>/loops/<lid>/frames/<file>` | Serve frame |
| GET | `/api/library/<id>/loops/<lid>/download` | Download loop as ZIP |
| GET | `/api/library/<id>/download` | Download all loops as ZIP |

## Docker Setup

- **Base image**: `python:3.12-slim` with `ffmpeg` from apt
- **Model pre-download**: u2net.onnx (~176MB) is downloaded at build time to `/root/.u2net/`
- **Volumes**: `uploads`, `output`, and `library` are named Docker volumes; `vertex-secret.json` is bind-mounted read-only
- **Live reload**: `app/` is bind-mounted so code changes apply immediately in dev
- **Port**: 5000

## Key Design Decisions

- **No frontend framework**: Vanilla JS keeps the app simple and dependency-free on the client side
- **IIFE per module**: Each JS file is wrapped in an IIFE to avoid global scope pollution, sharing state through the single `state` object
- **Tool panel architecture**: Top-level tools are `.tool-panel` divs toggled by the sidebar. The wizard is nested inside the Video to Frames panel, preserving all existing element IDs and MutationObserver bindings
- **Server-side processing**: All heavy image/video processing happens server-side (FFmpeg, Pillow, rembg). The client handles only preview rendering and manual pixel editing
- **Client-side eraser**: Manual touch-up edits pixels directly in canvas ImageData for instant feedback, then persists to server via `/api/save-frame`
- **Edge-connected transparency**: SciPy flood-fill labeling solves the problem of removing background color without destroying same-colored interior pixels (e.g., white eyes on a white background)
- **Collapsible sidebar**: CSS transition on width with icon-only collapsed state. Auto-collapses on mobile with overlay toggle
- **Dual AI backend**: Supports both AI Studio (simple API key) and Vertex AI (service account + REST API) to give flexibility based on available credits and model access
- **Async video generation**: AI Animate runs video generation in background threads with status polling, since Veo generation can take minutes
- **JSON file storage**: No database required; all data (sprites, prompts, status) stored as JSON files on disk within Docker volumes
