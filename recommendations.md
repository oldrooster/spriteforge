# SpriteForge — Recommendations

## 1. Architecture Changes

### Major

**Extract shared AI client into a service module**
Four route files (`ai_generate.py`, `ai_animate.py`, `ai_music.py`, `ai_inpaint.py`) each implement their own `_get_client()` function with slight variations. A single `app/services/ai_client.py` module should expose a `get_genai_client(vertex_only=False)` function that handles Vertex AI vs AI Studio detection, project/location config, and returns a configured `genai.Client`. This removes ~80 lines of duplication and gives one place to update when the SDK changes.

**Consolidate session/status helpers into a shared service**
`ai_generate.py`, `ai_animate.py`, `ai_music.py`, and `chat.py` each define their own `_session_dir()`, `_read_status()`, and `_write_status()` functions with inconsistent signatures. Moving these into `app/services/session.py` with a consistent interface (e.g. `SessionStore(base_folder, session_id)`) would eliminate ~120 lines of duplication and standardise how background tasks report progress.

**Split `library.py` (848 lines) into a sub-package**
`library.py` handles project CRUD, asset CRUD, file management, tag management, metadata, and thumbnailing. Consider splitting into `app/routes/library/projects.py`, `assets.py`, and `files.py` with a shared `__init__.py` that registers sub-blueprints.

**Introduce a lightweight config module**
Model IDs (`gemini-2.0-flash`, `imagen-3.0-capability-001`, `veo-2.0-generate-001`), default locations, and feature flags are hardcoded as string literals across multiple files. A `app/config.py` with constants or environment-variable overrides would make it easy to swap models or toggle features without editing route code.

### Minor

**Standardise error responses**
Some routes return `{'error': '...'}` with varying status codes; others return plain strings. A small `app/utils.py` helper like `error_response(msg, code=400)` keeps the JSON shape consistent for the frontend.

**Add structured logging**
Only `ai_animate.py` and `ai_music.py` use `logging` at all, and only ad-hoc. Configure a root logger in `main.py` with a formatter that includes timestamps and route names. This makes debugging production issues in Docker much easier.

**Session/output cleanup**
There is no mechanism to prune old session directories in `output/`. A startup or periodic cleanup (e.g. delete sessions older than 24 hours) would prevent the Docker volume from growing indefinitely.

**Audit the two transparency JS modules**
`transparency.js` (660 lines) and `image-transparency.js` (774 lines) appear to serve overlapping purposes. If they target different pages they could at least share utility functions; if they overlap significantly one should be removed.

---

## 2. Feature Ideas for Point & Click Adventure Asset Creation

**Sprite sheet packing / atlas export**
Allow users to select multiple assets and pack them into a single sprite sheet (with JSON metadata for frame coordinates). This is the most common format engines like Godot, Unity, and Phaser expect. Options for padding, power-of-two sizing, and trim-to-content would add value.

**Animation timeline / onion skinning**
A lightweight timeline view for sprite animation: import or arrange frames, preview playback at adjustable FPS, toggle onion-skin overlay to see previous/next frames while editing. Currently the app can generate video via AI but has no manual frame-by-frame workflow.

**Scene / room composer**
A canvas where users can place background layers, foreground objects, walkable-area polygons, and hotspot regions. Export as a scene definition (JSON + images) that a game engine can consume. This bridges the gap between individual asset creation and actual game integration.

**Colour palette management**
Define and enforce a project-wide colour palette (e.g. 16-colour retro palette). Apply palette quantisation to generated or imported images so all assets share a consistent look. Useful for pixel-art style adventure games.

**Batch AI generation with variations**
Generate multiple variations of an asset in one go (e.g. "idle", "walking", "talking" poses of a character) using a base prompt plus variation suffixes. Display results in a grid for quick comparison and selection.

**Hotspot / interaction zone editor**
Overlay clickable regions on a background image and assign labels (e.g. "door", "desk", "window"). Export as polygon data. Essential for point & click games where every interactable area needs defined coordinates.

**Asset tagging with auto-suggest**
The library already supports tags, but auto-suggesting tags based on AI image analysis (e.g. "character", "outdoor", "furniture") would speed up organisation on larger projects.

**Nine-slice / border definition**
Mark nine-slice borders on UI elements (dialog boxes, buttons, panels) so they can be exported with slice metadata for engines that support scalable UI sprites.

**Dialogue portrait cropper**
One-click crop to a standard portrait size (e.g. 128x128 or 256x256 with face centred) for character dialogue boxes. Could use face detection or a manual anchor point.

**Export presets per engine**
Pre-configured export profiles for common engines: Godot (`.tres` resource), Unity (sprite meta), Phaser (JSON atlas), RPG Maker (specific sheet layouts). Saves users from manually configuring sizes and formats each time.

---

## 3. Tidy-Up & Redundancies

**Duplicate `_get_client()` implementations**
As noted above, four near-identical functions across AI route files. Consolidate into one.

**Duplicate `_session_dir` / `_read_status` / `_write_status`**
Three copies of the same JSON read/write pattern. Consolidate into a shared module.

**Template variable substitution repeated in `ai_generate.py`**
The `{{art_style}}` / `{{asset_name}}` replacement block appears twice (in `/generate` and `/refine`). Extract to a helper function.

**`index.html` at 1,247 lines**
The single HTML file contains all page markup for every tool. Consider splitting into partial templates (Jinja2 `{% include %}`) per feature area, or at minimum add clear section comment headers for navigation.

**`style.css` at 3,055 lines**
No CSS organisation strategy (no BEM, no utility classes, no CSS modules). At minimum, split into logical partials (`layout.css`, `components.css`, `pages/markup.css`, etc.) and use `@import` or a build step.

**`markup.js` at 1,338 lines**
The largest JS file handles brush, text, shapes, select, and inpaint tools all in one module. Each tool could be its own module with a shared tool interface, making the file easier to maintain.

**No automated tests**
Zero test files exist. Even a small suite of API integration tests (using Flask's test client) for the core routes would catch regressions early. Priority targets: library CRUD, image upload/export, AI endpoint input validation.

**Debug mode enabled in production Dockerfile**
`CMD ["flask", "run", "--host=0.0.0.0", "--port=5000", "--debug"]` and `FLASK_DEBUG=1` in `docker-compose.yml`. This exposes the Werkzeug debugger. Consider using an environment variable to control debug mode, defaulting to off.

**No `.dockerignore`**
Without a `.dockerignore`, the build context may include `vertex-secret.json`, `.git/`, and other unnecessary files. Add one to speed up builds and avoid leaking secrets into the image layer.

**Unused or over-broad imports**
Some route files import modules at the top level that are only needed in specific endpoints. Moving heavy imports (like `google.genai`) inside the function that uses them (as `ai_inpaint.py` already does) keeps startup fast and makes dependencies explicit.

**No input size limits on AI endpoints**
The AI endpoints accept image uploads without checking dimensions or file size before sending to Vertex AI. Adding basic validation (e.g. max 4096x4096, max 10 MB) would give users a clearer error than a cryptic API failure.
