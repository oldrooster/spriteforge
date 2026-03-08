# Sprite Forge

An AI Sprite generator for creating game assets. Extract sprite frames from video, preview animations, apply transparency, and export PNGs ready for your game engine.

## Features

- **Video Upload** - Upload MP4, WebM, MOV, AVI, or MKV video files via drag-and-drop
- **Crop & Extract** - Drag a crop box on the video to select a sprite region, set time range and frame count
- **Animation Preview** - Preview extracted frames as an animation with adjustable speed and filmstrip view
- **Background Transparency**
  - Color-based removal with tolerance and edge-only mode (preserves interior pixels like eyes)
  - AI-powered background removal using rembg (u2net)
  - Manual brush eraser and flood fill for touch-up corrections
  - Zoom up to 8x for fine detail work
- **Configurable Preview** - Switch preview background between checkerboard, solid colors, or custom color
- **Export** - Download all frames as a ZIP of transparent PNGs
- **AI Sprite Generation** - Generate sprite images from text prompts using Google Gemini API, with iterative refinement and save to library
- **AI Animation** - Animate sprites from your library using Gemini Veo video generation, with sample prompts for walking, idle, attack, and more

## Quick Start

```bash
docker-compose up --build
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### Setting up the Gemini API Key (required for AI features)

The AI Generate and AI Animate features require a Google Gemini API key.

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key
2. Set the `GEMINI_API_KEY` environment variable before running:

```bash
# Option 1: Export in your shell
export GEMINI_API_KEY=your-api-key-here
docker-compose up --build

# Option 2: Inline
GEMINI_API_KEY=your-api-key-here docker-compose up --build

# Option 3: Create a .env file in the project root
echo "GEMINI_API_KEY=your-api-key-here" > .env
docker-compose up --build
```

The AI features will show a helpful error message if the key is not configured. All other features work without an API key.

> The first build downloads the u2net AI model (~176MB) and may take a few minutes. Subsequent builds use the cached layer.

## Workflow

1. **Upload** a video file (drag-and-drop or click to browse)
2. **Configure extraction** - drag the crop box on the video to frame your sprite, set time range and number of frames, choose output resolution
3. **Preview** the animation - adjust frame delay, scrub through frames
4. **Apply transparency** - use color removal (with eyedropper), AI removal, or manual eraser/flood fill to clean up backgrounds
5. **Download** all frames as a ZIP file

## Tech Stack

- Python 3.12 / Flask
- FFmpeg for video processing
- Pillow + NumPy + SciPy for image processing
- rembg (u2net) for AI background removal
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
| `GEMINI_API_KEY` | *(none)* | Google Gemini API key for AI features |
