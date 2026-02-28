# Sprite Forge - Architecture

## Overview

Sprite Forge is a single-page web application for extracting sprite frames from video files. It runs as a Dockerized Flask app with a vanilla JS frontend and uses FFmpeg for video processing, Pillow/NumPy/SciPy for image manipulation, and rembg (u2net) for AI background removal.

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
│   │   └── export.py       # GET /api/frames/<session>/<sub>/<file>, GET /api/download/<session>
│   ├── services/
│   │   ├── video.py        # FFmpeg wrapper: probe_video(), extract_frames()
│   │   └── image.py        # apply_transparency(), apply_rembg()
│   └── static/
│       ├── index.html      # Single HTML page with 4 wizard steps
│       ├── css/style.css   # Dark theme, all component styles
│       └── js/
│           ├── app.js      # Global state object, step navigation (showStep/completeStep)
│           ├── upload.js   # Drag-drop upload, XHR progress, video preview
│           ├── extract.js  # Crop overlay, custom video controls, range slider, frame extraction
│           ├── preview.js  # Canvas animation preview with filmstrip
│           └── transparency.js  # Transparency tools, eraser, flood fill, zoom, preview bg
```

## Application Flow

### Step 1: Upload
- User uploads a video via drag-drop or file picker
- `POST /api/upload` saves the file to `/app/uploads/<uuid>.<ext>`
- Server runs `ffprobe` to extract metadata (duration, resolution, fps)
- Frontend stores `videoId` in global `state` and sets video sources for both the preview and extract players

### Step 2: Extract
- User configures: time range (start/end), crop region (draggable overlay on video), output resolution, frame count
- Crop overlay maps CSS pixels to video pixels using `videoWidth/clientWidth` ratio
- `POST /api/extract` calls `extract_frames()` which runs FFmpeg:
  ```
  ffmpeg -ss {start} -to {end} -i {video} -vf "fps={fps},crop={w}:{h}:{x}:{y},scale={outW}:{outH}" frame_%04d.png
  ```
- Frames saved to `/app/output/<session_id>/original/`
- Frontend receives frame URLs and stores `sessionId` + `frames[]` in state

### Step 3: Preview
- Loads extracted frames into `<canvas>` animation loop
- Configurable delay, filmstrip thumbnail strip
- Play/pause controls, frame indicator

### Step 4: Transparency
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

## Docker Setup

- **Base image**: `python:3.12-slim` with `ffmpeg` from apt
- **Model pre-download**: u2net.onnx (~176MB) is downloaded at build time to `/root/.u2net/`
- **Volumes**: `uploads` and `output` are named Docker volumes
- **Live reload**: `app/` is bind-mounted so code changes apply immediately in dev
- **Port**: 5000

## Key Design Decisions

- **No frontend framework**: Vanilla JS keeps the app simple and dependency-free on the client side
- **IIFE per module**: Each JS file is wrapped in an IIFE to avoid global scope pollution, sharing state through the single `state` object
- **Server-side processing**: All heavy image/video processing happens server-side (FFmpeg, Pillow, rembg). The client handles only preview rendering and manual pixel editing
- **Client-side eraser**: Manual touch-up edits pixels directly in canvas ImageData for instant feedback, then persists to server via `/api/save-frame`
- **Edge-connected transparency**: SciPy flood-fill labeling solves the problem of removing background color without destroying same-colored interior pixels (e.g., white eyes on a white background)
