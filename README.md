# Sprite Forge

An AI Sprite generator for creating game assets. Extract sprite frames from video, preview animations, and export transparent PNGs ready for your game engine.

## Features

- **Video Upload** - Upload MP4, WebM, MOV, AVI, or MKV video files
- **Frame Extraction** - Select time range, resolution, and frame count to extract evenly-spaced frames
- **Animation Preview** - Preview extracted frames as an animation with adjustable speed
- **Background Transparency** - Remove background colors with tolerance control and eyedropper tool
- **Export** - Download all frames as a ZIP of transparent PNGs

## Quick Start

```bash
docker-compose up --build
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

## Workflow

1. **Upload** a video file (drag-and-drop or click to browse)
2. **Configure extraction** - set output resolution (32x32 to 512x512 or custom), time range, and number of frames
3. **Preview** the animation - adjust frame delay to get the right speed
4. **Apply transparency** - pick the background color to remove (use the eyedropper or color picker), adjust tolerance, and verify on the purple checkerboard background
5. **Download** all frames as a ZIP file

## Tech Stack

- Python 3.12 / Flask
- FFmpeg for video processing
- Pillow + NumPy for image processing
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

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MAX_UPLOAD_SIZE` | `500` | Maximum upload size in MB |
| `FLASK_DEBUG` | `1` | Enable Flask debug mode |
