# Adventure Forge Refactor Plan

Breaks the REDESIGN.md spec into 8 phases. Each phase is a self-contained
chunk that leaves the app in a working state. Phases can be done across
multiple sessions — each starts with "read REFACTOR.md and REDESIGN.md"
so context is recoverable.

## Decisions (locked in)

- Hash routing (`#/asset/<id>`, `#/tool/<name>`)
- Single implicit project (data model has project_id, UI skips selector)
- Fresh start — wipe library volume, no migration
- Full rename: loops → views everywhere
- Fixed category enum: characters, backgrounds, objects, ui, sounds
- Sounds: metadata + file upload, no processing tools
- Tools open as overlay panels (existing `.tool-panel` pattern)

---

## Phase 1: Backend — Project & Asset Data Layer ✅ DONE

**Goal:** Replace `library.py` with the new project/asset/view data model.
The old sprite library backend is fully replaced. No frontend yet.

**Files to modify:**
- `app/routes/library.py` — rewrite entirely

**Files to create:**
- None (rewrite in place)

**What to do:**

1. Define constants at top of `library.py`:
   ```
   CATEGORIES = ['characters', 'backgrounds', 'objects', 'ui', 'sounds']
   DEFAULT_PROJECT_ID = 'default'
   DEFAULT_PROJECT_NAME = 'My Project'
   ```

2. Replace all helper functions to use new paths:
   - `_lib_root()` — unchanged
   - `_projects_index_path()` → `library/projects.json`
   - `_project_dir(project_id)` → `library/projects/<id>/`
   - `_project_path(project_id)` → `library/projects/<id>/project.json`
   - `_assets_index_path(project_id)` → `library/projects/<id>/assets.json`
   - `_asset_dir(asset_id)` → `library/assets/<id>/`
   - `_asset_path(asset_id)` → `library/assets/<id>/asset.json`
   - `_view_dir(asset_id, view_id)` → `library/assets/<id>/views/<vid>/`
   - Auto-create default project on first request if `projects.json` missing

3. Replace all route endpoints. New URL scheme:

   **Project (minimal for now):**
   - `GET /api/projects` — list projects (returns single default)
   - `GET /api/projects/<id>` — get project detail
   - `PUT /api/projects/<id>` — update project (name, art_style)

   **Assets (replaces sprites):**
   - `GET /api/projects/<pid>/assets` — list assets (with category filter query param)
   - `POST /api/projects/<pid>/assets` — create asset (name, category, tags)
   - `GET /api/assets/<id>` — get asset detail
   - `PUT /api/assets/<id>` — update asset (name, category, tags)
   - `DELETE /api/assets/<id>` — delete asset and all data
   - `GET /api/assets/<id>/thumbnail` — serve thumbnail

   **Resources (same concept, new paths):**
   - `POST /api/assets/<id>/resources` — upload resource
   - `DELETE /api/assets/<id>/resources/<rid>` — remove resource
   - `GET /api/assets/<id>/resources/<rid>/file` — serve resource file

   **Views (replaces loops):**
   - `POST /api/assets/<id>/views` — create view (upload frames or from session)
   - `GET /api/assets/<id>/views/<vid>` — get view metadata
   - `PUT /api/assets/<id>/views/<vid>` — update view (name, ags_loop, delay)
   - `DELETE /api/assets/<id>/views/<vid>` — delete view
   - `GET /api/assets/<id>/views/<vid>/frames/<file>` — serve frame
   - `PUT /api/assets/<id>/views/<vid>/frames/<file>` — overwrite frame
   - `GET /api/assets/<id>/views/<vid>/download` — download view as ZIP
   - `GET /api/assets/<id>/download` — download all views as ZIP

   **Videos (same concept, new paths):**
   - `GET /api/assets/<id>/videos/<vid>` — serve video file

4. Update `_generate_thumbnail()` to use new `views/` path instead of `loops/`.

5. View creation: auto-assign `ags_loop` as max existing + 1.

**How to verify:** Start container, hit endpoints with curl:
```
curl localhost:5000/api/projects
curl -X POST localhost:5000/api/projects/default/assets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","category":"characters","tags":["test"]}'
```

---

## Phase 2: Backend — Update AI Routes for New Paths ✅ DONE

**Goal:** Update `ai_animate.py` and `ai_generate.py` to use
`library/assets/<id>/views/<vid>/` paths instead of old sprite/loop paths.
Update prompt library to be project-scoped.

**Files to modify:**
- `app/routes/ai_animate.py`
- `app/routes/ai_generate.py`

**What to do:**

1. **ai_animate.py — path updates:**
   - `animate()`: change source frame path from
     `lib_root/<sprite_id>/loops/<loop_id>/frame_NNNN.png` to
     `lib_root/assets/<asset_id>/views/<view_id>/frame_NNNN.png`
   - Update request body param names: `sprite_id` → `asset_id`,
     `loop_id` → `view_id`
   - `save_video_to_library()`: change sprite.json path to
     `lib_root/assets/<asset_id>/asset.json`, key `videos`
   - `save_to_library()`: change loop dir to view dir,
     `loop.json` → `view.json`, key `loops` → `views` in asset.json,
     add `ags_loop` auto-increment
   - `serve_library_video()`: update path to `assets/<id>/videos/`

2. **ai_generate.py — prompt library:**
   - `_prompts_path()`: change from `library/prompts.json` to
     `library/projects/default/prompts.json`
   - No other changes needed (generation is session-based)

**How to verify:** Create an asset via Phase 1 API, upload frames as a view,
then call AI animate endpoint referencing the new asset_id/view_id.

---

## Phase 3: Backend — Register Blueprints & Startup ✅ DONE (completed in Phase 1)

**Goal:** Update `main.py` to ensure the default project is auto-created
on startup. Update blueprint registration if any URL prefixes changed.

**Files to modify:**
- `app/main.py`

**What to do:**

1. Add startup hook that calls a `ensure_default_project()` function
   from library.py — creates `library/projects/`, `library/assets/`,
   `library/projects/default/` dirs and `projects.json` if missing.

2. Verify all blueprint registrations still work. The `/api` prefix
   stays the same. Only the route paths within `library.py` changed.

**How to verify:** `docker-compose up --build`, hit `localhost:5000/api/projects`,
confirm default project exists with no manual setup.

---

## Phase 4: Frontend — Hash Router & Navigation Skeleton ✅ DONE

**Goal:** Replace sidebar-driven `showTool()` navigation with hash routing.
Asset grid becomes the home screen. Tools become overlay panels.
The sidebar is removed.

**Files to modify:**
- `app/static/js/app.js` — rewrite navigation
- `app/static/index.html` — restructure panels, remove sidebar
- `app/static/css/style.css` — remove sidebar styles, add new layout

**What to do:**

1. **app.js — new router:**
   ```
   Routes:
     #/                    → Project Home (asset grid)
     #/asset/<id>          → Asset Detail
     #/asset/<id>/tool/<t> → Tool overlay (V2F, transparent, crop, etc.)
   ```
   - Replace `showTool()` / `activeTool` with `navigate(hash)` / `currentRoute`
   - Keep `showStep()` and wizard step logic unchanged (used within V2F tool)
   - History stack: `navigate()` pushes to stack, `navigateBack()` pops
   - On `hashchange` event, parse route and show correct panel
   - Expose `state.currentAssetId` for tools to know their context

2. **index.html — restructure:**
   - Remove `<nav id="sidebar">` and all `.sidebar-item` elements
   - Add header bar with project name, search input, [+ New Asset] button
   - Keep all existing `.tool-panel` divs but they're now hidden by default
     and shown via hash router (not sidebar clicks)
   - Add new `#project-home` panel (asset grid — will be built in Phase 5)
   - Add new `#asset-detail` panel (will be built in Phase 6)
   - Each tool panel gets a "Back to Asset" / "Back to Home" button

3. **style.css:**
   - Remove `.sidebar`, `.sidebar-item`, `.sidebar.collapsed` styles
   - Content area becomes full-width
   - Tool panels use same `.tool-panel.active` pattern but full-width
   - Add `.project-header` styles

4. **Preserve MutationObserver pattern:**
   - Tool panels still toggle `.active` class
   - Existing JS modules (upload, extract, preview, transparency) still
     observe their `.step-section` class changes — this must keep working
   - The router just controls which `.tool-panel` gets `.active`

**How to verify:** App loads at `#/` showing empty project home placeholder.
Manually navigating to `#/asset/<id>/tool/video-to-frames` shows V2F wizard.
Browser back button works.

---

## Phase 5: Frontend — Project Home (Asset Grid) ✅ DONE

**Goal:** Build the asset grid view — the new home screen. Category tabs,
search, asset cards, create asset dialog.

**Files to modify:**
- `app/static/js/sprite-library.js` — rewrite as `app/static/js/project-home.js`
- `app/static/index.html` — add project-home panel markup
- `app/static/css/style.css` — asset grid styles

**Files to create:**
- `app/static/js/project-home.js` (replaces sprite-library.js)

**Files to delete:**
- `app/static/js/sprite-library.js`

**What to do:**

1. **project-home.js (new IIFE):**
   - Fetch assets from `GET /api/projects/default/assets`
   - Render category tabs: [All] [Characters] [Backgrounds] [Objects] [UI] [Sounds]
   - Filter by category tab + search text
   - Render asset cards (thumbnail, name, category badge, view count)
   - [+ New Asset] button → modal/dialog for name + category + tags
   - Click card → `navigate('#/asset/' + assetId)`
   - Observe `#project-home` panel `.active` class to trigger reload

2. **Create asset dialog:**
   - Name (text input, required)
   - Category (dropdown, fixed enum)
   - Tags (comma-separated text input)
   - Submit → `POST /api/projects/default/assets`

3. **index.html markup:**
   ```html
   <div id="project-home" class="main-panel">
     <div class="category-tabs">...</div>
     <div class="asset-search">...</div>
     <div id="asset-grid" class="asset-grid">...</div>
   </div>
   ```

**How to verify:** App loads showing asset grid. Can create assets in each
category. Category tabs filter correctly. Search works. Clicking a card
navigates to `#/asset/<id>` (detail panel will be blank until Phase 6).

---

## Phase 6: Frontend — Asset Detail Panel ✅ DONE

**Goal:** Build the asset detail view with hero image, source files, views
(with filmstrip + preview), videos, and contextual action buttons that
launch tools.

**Files to create:**
- `app/static/js/asset-detail.js`

**Files to modify:**
- `app/static/index.html` — add asset-detail panel markup
- `app/static/css/style.css` — asset detail styles

**What to do:**

1. **asset-detail.js (new IIFE):**
   - On route `#/asset/<id>`: fetch `GET /api/assets/<id>`, render detail
   - Header: back button, asset name (editable), category badge, tags
   - Hero image area: thumbnail large view
   - Action buttons grid: AI Generate, Upload, Paste, AI Animate,
     Crop, Resize, Make Transparent
     - Each sets `state.currentAssetId` and navigates to tool hash
   - Source files section: list resources, upload button, remove button
     - Video resources: "Open in V2F" button
   - Views section: for each view render:
     - Name + frame count + dimensions + ags_loop index
     - Filmstrip (same pattern as old loop filmstrip)
     - Preview button (canvas animation, same as old loop preview)
     - Action buttons: [Edit Frames] [Transparent] [AI Animate] [Export] [Delete]
     - [+ New View] button (upload frames)
     - [+ From Video] button (opens V2F with asset context)
   - Videos section: list saved videos with play/remove buttons
   - Rename: inline edit or prompt
   - Delete asset: confirm dialog

2. **Tool launch pattern:**
   Every action button does:
   ```js
   state.currentAssetId = assetId;
   state.currentViewId = viewId; // if applicable
   navigate('#/asset/' + assetId + '/tool/ai-generate');
   ```
   The tool panel opens as overlay. Tool reads `state.currentAssetId`
   to know where to save results.

3. **View creation from upload:**
   - File picker for multiple PNGs
   - Name prompt (suggest AGS-style: walk_south, idle, etc.)
   - `POST /api/assets/<id>/views` with multipart frames

**How to verify:** Navigate to an asset, see all sections rendered.
Create a view by uploading frames. Preview animation works. Filmstrip shows.
Action buttons navigate to tool hashes (tools themselves may not be
contextual yet — that's Phase 7).

---

## Phase 7: Frontend — Contextual Tool Integration ✅ DONE

**Goal:** Wire up all existing tool panels to work contextually from an
asset. Tools read `state.currentAssetId` / `state.currentViewId` and
save results back to the asset.

**Files to modify:**
- `app/static/js/ai-generate.js` — save to current asset
- `app/static/js/ai-animate.js` — source from current asset/view
- `app/static/js/upload.js` — minor: "Back to Asset" awareness
- `app/static/js/transparency.js` — load from view, save back
- `app/static/js/crop.js` — load from asset, save back
- `app/static/js/resize.js` — load from view, save back
- `app/static/js/image-transparency.js` — load from asset, save back
- `app/static/js/library-modal.js` — update for new asset/view hierarchy

**What to do:**

1. **ai-generate.js:**
   - When launched from asset context, pre-populate reference image from
     asset thumbnail
   - "Save to Library" → saves to `state.currentAssetId` instead of
     showing sprite picker modal
   - Prompt library: fetch from `/api/ai-generate/prompts` (now project-scoped)

2. **ai-animate.js:**
   - When launched from view context, auto-select source asset/view/frame
     instead of showing picker
   - Update API call params: `asset_id`/`view_id` instead of `sprite_id`/`loop_id`
   - "Save Video to Library" → saves to `state.currentAssetId`

3. **transparency.js / image-transparency.js:**
   - When launched from view context, load view frames from
     `/api/assets/<id>/views/<vid>/frames/frame_NNNN.png`
   - After editing, save frames back via
     `PUT /api/assets/<id>/views/<vid>/frames/frame_NNNN.png`

4. **resize.js:**
   - When launched from view context, load frames from view
   - After resize, overwrite view frames or create new view

5. **crop.js:**
   - When launched from asset hero image, crop and save back as thumbnail

6. **library-modal.js:**
   - Update to browse assets → views instead of sprites → loops
   - Update API calls to new endpoints
   - May not be needed at all if tools are always launched with context
     (keep for cases where user wants to pick a different asset)

7. **All tool panels:**
   - Add "← Back to Asset" button that calls `navigateBack()`
   - On save/complete, offer to navigate back to asset detail

**How to verify:** Full workflow test:
1. Create a character asset
2. AI Generate a hero image → saves to asset
3. Upload frames as a view
4. Apply transparency to the view's frames
5. AI Animate from the view
6. Save video back to asset
7. Navigate back, see all data on asset detail

---

## Phase 8: Frontend — Polish & AGS Export ✅ DONE

**Goal:** Final polish, AGS-aware export, prompt template variables,
cleanup dead code.

**Files to modify:**
- `app/routes/ai_generate.py` — template variable substitution
- `app/static/css/style.css` — responsive polish
- `app/static/index.html` — cleanup

**Files to delete:**
- `app/static/js/sprite-library.js` (if not already deleted in Phase 5)

**What to do:**

1. **Prompt template variables:**
   - In `ai_generate.py` `generate()` and `refine()`, before sending to API:
     ```python
     project = _read_project('default')
     prompt = prompt.replace('{{art_style}}', project.get('art_style', ''))
     prompt = prompt.replace('{{asset_name}}', asset_name)
     ```
   - Requires passing `asset_id` in the generate request so the backend
     can look up the asset name

2. **AGS export:**
   - `GET /api/assets/<id>/export-ags` — downloads ZIP structured as:
     ```
     RogerWilco/
       view.json          # AGS view metadata
       loop_0_walk_south/
         frame_0000.png
         frame_0001.png
         ...
       loop_1_idle/
         frame_0000.png
         ...
     ```
   - Frame filenames zero-indexed to match AGS convention

3. **Project settings panel:**
   - Accessible from header
   - Edit project name, art_style prompt prefix
   - View/edit default resolution

4. **Cleanup:**
   - Remove any dead sidebar HTML/CSS/JS
   - Remove old `sprite-library.js` if not yet deleted
   - Update `architecture.md` and `README.md` for new structure
   - Remove old sprite-related comments and dead code paths

**How to verify:** Full end-to-end test of all workflows.
Export an asset as AGS structure, verify file naming.
Prompts with `{{art_style}}` resolve correctly.

---

## Session Recovery Guide

If you run out of context mid-phase, start the next session with:

> Read REFACTOR.md and REDESIGN.md. I'm on Phase N.
> [describe what's done and what's left]

Each phase is designed so that:
- The app builds and runs after each phase completes
- No phase depends on unreleased work from a future phase
- Phases 1-3 (backend) can be tested with curl before any frontend work
- Phases 4-7 (frontend) each add visible UI that can be manually tested
- Phase 8 is pure polish and can be skipped/deferred

## File Change Summary

| File | Phase | Action |
|------|-------|--------|
| `app/routes/library.py` | 1 | Rewrite |
| `app/routes/ai_animate.py` | 2 | Modify paths + param names |
| `app/routes/ai_generate.py` | 2, 8 | Modify prompt paths; add templates |
| `app/main.py` | 3 | Add startup hook |
| `app/static/js/app.js` | 4 | Rewrite navigation |
| `app/static/index.html` | 4, 5, 6 | Restructure panels |
| `app/static/css/style.css` | 4, 5, 6 | New layout styles |
| `app/static/js/project-home.js` | 5 | **New** (replaces sprite-library.js) |
| `app/static/js/sprite-library.js` | 5 | **Delete** |
| `app/static/js/asset-detail.js` | 6 | **New** |
| `app/static/js/ai-generate.js` | 7 | Modify for context |
| `app/static/js/ai-animate.js` | 7 | Modify for context + param names |
| `app/static/js/transparency.js` | 7 | Modify for context |
| `app/static/js/image-transparency.js` | 7 | Modify for context |
| `app/static/js/resize.js` | 7 | Modify for context |
| `app/static/js/crop.js` | 7 | Modify for context |
| `app/static/js/library-modal.js` | 7 | Modify for new hierarchy |
| `app/static/js/upload.js` | 7 | Minor: back button |

**Unchanged files (no modifications needed):**
- `app/routes/upload.py`
- `app/routes/extract.py`
- `app/routes/export.py`
- `app/routes/resize.py`
- `app/routes/image_transparent.py`
- `app/routes/crop.py`
- `app/services/video.py`
- `app/services/image.py`
- `app/static/js/extract.js`
- `app/static/js/preview.js`
- `Dockerfile`
- `docker-compose.yml`
- `requirements.txt`
