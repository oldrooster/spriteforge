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

## Quick Start

```bash
docker-compose up --build
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

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
