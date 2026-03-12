# SpriteForge

An AI-powered sprite creation toolkit for game developers. Generate sprites with AI, animate them with video generation, extract frames from video, apply transparency, crop, resize, and export PNGs ready for your game engine.

## Features

- **Project & Asset Library** - Organize sprites into assets with categories (Characters, Backgrounds, Objects, UI, Sounds), tags, and multiple views per asset
- **AI Sprite Generation** - Generate sprite images from text prompts using Google Gemini, with iterative refinement, reference image support (upload, library, or clipboard paste), and save to library
- **AI Animation** - Animate sprites from your library using Veo video generation, with configurable duration (4-8s), audio toggle, prompt library, and save videos to library
- **Prompt Library** - Centralized prompt management in project settings with name, category, and generation type (Image/Video/Both); filterable type-ahead dropdown integrated into both AI tools; save prompts directly from the prompt textarea
- **Video to Frames** - Upload MP4, WebM, MOV, AVI, or MKV video files via drag-and-drop, crop a region, and extract animation frames
- **Animation Preview** - Preview extracted frames as an animation with adjustable speed and filmstrip view
- **Background Transparency**
  - Color-based removal with tolerance and edge-only mode (preserves interior pixels like eyes)
  - AI-powered background removal using rembg (u2net)
  - Manual brush eraser and flood fill for touch-up corrections
  - Zoom from 10% to 8x for fine detail work
- **Crop Tool** - Crop individual images with visual selection, zoom/pan support, aspect ratio presets (including "All" for full image), and unified Download/Save buttons
- **Resize Images** - Batch resize with aspect lock, percentage scaling, mirror/flip, interpolation options, stacked preview, and smart PNG/ZIP download
- **Markup Tool** - Annotate images with drawing tools
- **Configurable Preview** - Switch preview background between checkerboard, solid colors, or custom color
- **Export** - Download frames as ZIP or single PNG depending on context

## Quick Start

```bash
docker-compose up --build
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

> The first build downloads the u2net AI model (~176MB) and may take a few minutes. Subsequent builds use the cached layer.

## AI Backend Setup

The AI Generate and AI Animate features support two backends: **Google AI Studio** (API key) and **Google Cloud Vertex AI** (service account). You can configure either or both.

### Option A: Google AI Studio (simpler)

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key
2. Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your-api-key-here
```

### Option B: Google Cloud Vertex AI

Vertex AI gives access to additional models (Veo 3.0/3.1 for video, Gemini 3.x for images). If `GOOGLE_CLOUD_PROJECT` is set, Vertex AI is used automatically instead of AI Studio.

1. Create a service account in Google Cloud with the **Vertex AI User** role
2. Download the JSON key file and save it as `vertex-secret.json` in the project root
3. Create a `.env` file:

```env
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

The service account JSON is mounted read-only into the container. Both `vertex-secret.json` and `.env` are excluded from git.

### Available Models

**AI Image Generation:**
| Model | AI Studio | Vertex AI |
|-------|-----------|-----------|
| Gemini 2.5 Flash Image | Yes | Yes |
| Gemini 3.1 Flash Image (Preview) | Yes | Yes (global endpoint) |
| Gemini 3 Pro Image (Preview) | Yes | Yes (global endpoint) |

**AI Video Generation:**
| Model | AI Studio | Vertex AI |
|-------|-----------|-----------|
| Veo 2.0 | Yes | Yes |
| Veo 3.0 / 3.0 Fast | No | Yes |
| Veo 3.1 / 3.1 Fast | No | Yes |

The AI features show a helpful error message if no backend is configured. All other features work without any API keys.

## Workflow

### AI Sprite Creation
1. **Generate** a sprite with a text prompt (optionally with a reference image), or use the standalone **Generate** button from the home screen
2. **Refine** iteratively until satisfied
3. **Save** to an asset in the library
4. **Animate** using AI video generation with configurable duration and audio

### Video Frame Extraction
1. **Upload** a video file (drag-and-drop or click to browse)
2. **Configure extraction** - drag the crop box on the video to frame your sprite, set time range, frame count, and output resolution
3. **Preview** the animation - adjust frame delay, scrub through frames
4. **Apply transparency** - use color removal (with eyedropper), AI removal, or manual eraser/flood fill
5. **Download** all frames as a ZIP file

## Tech Stack

- Python 3.12 / Flask
- FFmpeg for video processing
- Pillow + NumPy + SciPy for image processing
- rembg (u2net) for AI background removal
- Google GenAI SDK + Vertex AI REST API for AI features
- Vanilla HTML/CSS/JS frontend
- Docker

## Development

The app runs with Flask debug mode and live reloads. The `app/` directory is mounted into the container so changes are reflected immediately.

```bash
# Rebuild after changing Dockerfile or requirements
docker-compose up --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

See [architecture.md](architecture.md) for detailed technical documentation.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MAX_UPLOAD_SIZE` | `500` | Maximum upload size in MB |
| `FLASK_DEBUG` | `1` | Enable Flask debug mode |
| `GEMINI_API_KEY` | *(none)* | Google AI Studio API key |
| `GOOGLE_CLOUD_PROJECT` | *(none)* | GCP project ID (enables Vertex AI) |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | GCP region for Vertex AI |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/app/vertex-secret.json` | Path to service account JSON |
