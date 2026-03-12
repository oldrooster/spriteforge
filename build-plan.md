# SpriteForge Build Plan

Phased implementation plan derived from [to-build.md](to-build.md).

---

## Phase 0 — Bug Fixes ✓
*Fix known issues before adding features.*

### 0.1 Assets not showing on first load
- **Problem:** On first load no assets show; user must create one, go back, then they appear.
- **Root cause:** Likely the library/home panel doesn't fetch assets on initial page load — only on navigation back.
- **Files:** [app.js](app/static/js/app.js), [project-home.js](app/static/js/project-home.js), [library.py](app/routes/library.py)
- **Fix:** Ensure asset list is fetched and rendered on initial route load (`#/` or default project view), not just on `popstate`/back navigation.

---

## Phase 1 — Crop Tool Improvements ✓
*Enhance the interactive crop experience with live-sync and streamlined UI.*

### 1.1 Two-way sync: cursor selection <-> input boxes
- When dragging the yellow rectangle on the canvas, update the X/Y/W/H input fields in real time.
- When editing X/Y/W/H input fields, redraw the yellow rectangle on the canvas in real time.
- **Files:** [crop.js](app/static/js/crop.js)

### 1.2 Remove "Crop Image" button; unify into Download & Save
- Remove the standalone crop button.
- **Download** button → crops then downloads the result.
- **Save** button → crops then saves back to the library.
- Place Download and Save side-by-side horizontally.
- **Files:** [crop.js](app/static/js/crop.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css), [crop route](app/routes/crop.py)

### 1.3 "All" aspect ratio button
- Under aspect ratio options, add an **All** button that selects the entire image.
- Remove the separate "Select Entire Image" button (redundant).
- **Files:** [crop.js](app/static/js/crop.js), [index.html](app/static/index.html)

### 1.4 Zoom support on crop canvas
- Allow mouse-wheel zoom on the crop preview image for fine-grained selection.
- Pan support (click-drag when not in selection mode, or hold Space+drag).
- **Files:** [crop.js](app/static/js/crop.js), [style.css](app/static/css/style.css)

---

## Phase 2 — Resize Tool Improvements ✓
*Streamline the resize workflow for single and batch images.*

### 2.1 Post-selection layout: remove upload box, show thumbnails + stacked preview
- Once image(s) are selected, hide the upload/drop zone.
- Show selected image thumbnails horizontally along the top.
- Stack the original and resized result images vertically below.
- **Files:** [resize.js](app/static/js/resize.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

### 2.2 Single image vs. multi-image (view) selection
- Allow selecting a single image or an entire view (multiple frames).
- **Files:** [resize.js](app/static/js/resize.js)

### 2.3 Smart download format: PNG (single) vs. ZIP (multiple)
- Single image → download as `.png`.
- Multiple images → download as `.zip`.
- **Files:** [resize.js](app/static/js/resize.js), [resize route](app/routes/resize.py)

### 2.4 Remove "Resize Images" button; unify into Download & Save
- Remove standalone resize button.
- **Download** → resizes then downloads.
- **Save** → resizes then saves back to library.
- Place Download and Save side-by-side horizontally.
- **Files:** [resize.js](app/static/js/resize.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

---

## Phase 3 — Make Transparent Tool Improvements ✓
*Small UX polish for the transparency tool.*

### 3.1 Lower minimum zoom
- Reduce minimum zoom below 50% so large images fit without vertical scroll bars.
- **Files:** [image-transparency.js](app/static/js/image-transparency.js)

### 3.2 Move zoom controls to bottom-right
- Relocate the zoom buttons (+, -, Fit) beneath the image, bottom-right — opposite the preview background color selector.
- **Files:** [image-transparency.js](app/static/js/image-transparency.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

### 3.3 Horizontal Download & Save buttons
- Place Download and Save side-by-side horizontally (consistent with Crop & Resize).
- **Files:** [image-transparency.js](app/static/js/image-transparency.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

---

## Phase 4 — Standalone AI Generate ✓
*Promote AI image generation to a top-level tool accessible without an existing asset.*

### 4.1 Add "Generate" entry point
- Add a **Generate** button alongside the existing **+ New Asset** button on the home/project screen.
- Opens the AI Generate tool in standalone mode (no pre-selected asset required).
- **Files:** [index.html](app/static/index.html), [app.js](app/static/js/app.js), [ai-generate.js](app/static/js/ai-generate.js), [project-home.js](app/static/js/project-home.js), [style.css](app/static/css/style.css)

### 4.2 Save-to-library flow for standalone generation
- After generating, allow saving as a new asset (prompt for asset name, project, tags).
- Reuse existing save-to-library modal/flow.
- **Files:** [ai-generate.js](app/static/js/ai-generate.js), [library-modal.js](app/static/js/library-modal.js), [ai_generate route](app/routes/ai_generate.py)

---

## Phase 5 — Prompt Library ✓
*Centralized prompt management with integration into AI tools.*

### 5.1 Prompt management UI (Settings)
- Add a **Prompt Library** section under the settings panel (top-right gear icon).
- CRUD operations: Add / Edit / Delete prompts.
- Each prompt has: name, text, asset category (Character, Background, Sound, Object, UI), generation type (Image, Video, Both).
- **Files:** [index.html](app/static/index.html), new section in settings panel, [style.css](app/static/css/style.css)
- **Backend:** [library.py](app/routes/library.py) — endpoints for prompt CRUD (stored in `library/prompts.json`, which already exists).

### 5.2 Integrate prompts into AI Generate tool
- Replace the existing prompt list with a **dropdown selector** filtered by generation category (image).
- Dropdown supports type-ahead filtering (contains match).
- On selection: if prompt box is empty → replace; if not empty → ask "Replace or Append?".
- Add a **Save Prompt** button to save the current prompt text to the library.
- Make the prompt text area larger for better visibility.
- **Files:** [ai-generate.js](app/static/js/ai-generate.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

### 5.3 Integrate prompts into AI Video (Animate) tool
- Same dropdown + filtering + replace/append behavior as the image generator.
- Filtered by video generation category.
- **Save Prompt** button and larger text area.
- **Files:** [ai-animate.js](app/static/js/ai-animate.js), [index.html](app/static/index.html), [style.css](app/static/css/style.css)

---

## Summary

| Phase | Scope | Effort |
|-------|-------|--------|
| **0** | Bug fix: first-load assets | Small |
| **1** | Crop tool UX (4 tasks) | Medium |
| **2** | Resize tool UX (4 tasks) | Medium |
| **3** | Transparency tool UX (3 tasks) | Small |
| **4** | Standalone AI Generate (2 tasks) | Medium |
| **5** | Prompt Library + AI integration (3 tasks) | Large |
