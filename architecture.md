# Sprite Forge - Architecture

## Overview

Sprite Forge is a single-page web application with multiple sprite-related tools accessible via a collapsible sidebar. It runs as a Dockerized Flask app with a vanilla JS frontend and uses FFmpeg for video processing, Pillow/NumPy/SciPy for image manipulation, and rembg (u2net) for AI background removal.

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
│        │  ┌─ tool-panel: Make Transparent (hidden) ────────┐  │
│ [«]    │  │  dropzone → canvas + eraser/zoom + download    │  │
│        │  └────────────────────────────────────────────────┘  │
│        │  ┌─ tool-panel: Resize Images (hidden) ───────────┐  │
│        │  │  dropzone + settings + download                │  │
│        │  └────────────────────────────────────────────────┘  │
└────────┴──────────────────────────────────────────────────────┘
```

The sidebar collapses to icon-only mode and auto-collapses on mobile (< 768px). Each tool has its own `.tool-panel`; only one is `.active` at a time. The "Video to Frames" tool contains the original 4-step wizard nested inside it.

## Directory Structure

```
spriteforge/
├── Dockerfile              # Python 3.12-slim + FFmpeg, pre-downloads u2net.onnx model
├── docker-compose.yml      # Dev setup with volume mounts for live reload
├── requirements.txt        # Python dependencies
├── app/
│   ├── main.py             # Flask app entry point, config, blueprint registration
│   ├── routes/
│   │   ├── upload.py       # POST /api/upload, GET /api/video/<id>
│   │   ├── extract.py      # POST /api/extract, /api/transparency, /api/rembg, /api/save-frame
│   │   ├── export.py       # GET /api/frames/<session>/<sub>/<file>, GET /api/download/<session>
│   │   ├── resize.py       # POST /api/resize, GET /api/download-resized/<session>
│   │   └── image_transparent.py  # POST /api/upload-image, GET /api/download-image/<session>
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
│           └── image-transparency.js  # Single image transparency tool
```

## Navigation Architecture

The app uses two levels of navigation:

1. **Tool-level** (`showTool()`): Toggles `.active` on `.tool-panel` and `.sidebar-item` elements. When switching to "Video to Frames", re-calls `showStep()` to re-trigger MutationObservers in existing modules.

2. **Wizard-level** (`showStep()`): Within the Video to Frames tool, toggles `.active` on `.step-section` and `.step-dot` elements. Existing JS modules (upload, extract, preview, transparency) use `MutationObserver` on their step section's class attribute to detect activation — this pattern is preserved by nesting the wizard inside a tool panel without changing element IDs.

## Tools

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

## Docker Setup

- **Base image**: `python:3.12-slim` with `ffmpeg` from apt
- **Model pre-download**: u2net.onnx (~176MB) is downloaded at build time to `/root/.u2net/`
- **Volumes**: `uploads` and `output` are named Docker volumes
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
