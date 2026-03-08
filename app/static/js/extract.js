(function () {
    const rangeStart = document.getElementById('range-start');
    const rangeEnd = document.getElementById('range-end');
    const rangeSelected = document.getElementById('range-selected');
    const rangePlayhead = document.getElementById('range-playhead');
    const startInput = document.getElementById('start-time-input');
    const endInput = document.getElementById('end-time-input');
    const rangeDuration = document.getElementById('range-duration');
    const frameCount = document.getElementById('frame-count');
    const frameCountDisplay = document.getElementById('frame-count-display');
    const effectiveFps = document.getElementById('effective-fps');
    const extractBtn = document.getElementById('extract-btn');
    const extractProgress = document.getElementById('extract-progress');

    // Crop dimension inputs
    const cropXInput = document.getElementById('crop-x-input');
    const cropYInput = document.getElementById('crop-y-input');
    const cropWInput = document.getElementById('crop-w-input');
    const cropHInput = document.getElementById('crop-h-input');

    // Output resolution
    const outputWidth = document.getElementById('output-width');
    const outputHeight = document.getElementById('output-height');
    const lockAspectBtn = document.getElementById('lock-aspect-btn');
    let aspectLocked = true;

    // Video controls
    const video = document.getElementById('extract-player');
    const videoContainer = document.getElementById('video-container');
    const playBtn = document.getElementById('extract-play-btn');
    const pauseBtn = document.getElementById('extract-pause-btn');
    const previewRangeBtn = document.getElementById('preview-range-btn');
    const currentTimeEl = document.getElementById('video-current-time');
    const totalTimeEl = document.getElementById('video-total-time');

    // Crop overlay
    const cropOverlay = document.getElementById('crop-overlay');
    const cropLabel = document.getElementById('crop-label');

    let videoDuration = 1;
    let isPreviewingRange = false;
    let initialized = false;

    // Crop state (in CSS pixels relative to video container)
    let crop = { x: 20, y: 20, w: 100, h: 100 };
    // Flag to prevent feedback loop between crop box and inputs
    let updatingFromInputs = false;
    let updatingFromDrag = false;

    // ── Rendered video rect (accounts for object-fit: contain letterboxing) ──

    function getRenderedVideoRect() {
        const elemRect = video.getBoundingClientRect();
        if (!video.videoWidth || !video.videoHeight) return elemRect;

        const videoAR = video.videoWidth / video.videoHeight;
        const elemAR = elemRect.width / elemRect.height;

        let renderW, renderH, renderX, renderY;
        if (videoAR > elemAR) {
            // Video wider than element → letterboxed top/bottom
            renderW = elemRect.width;
            renderH = elemRect.width / videoAR;
            renderX = elemRect.left;
            renderY = elemRect.top + (elemRect.height - renderH) / 2;
        } else {
            // Video taller than element → letterboxed left/right
            renderH = elemRect.height;
            renderW = elemRect.height * videoAR;
            renderX = elemRect.left + (elemRect.width - renderW) / 2;
            renderY = elemRect.top;
        }

        return { left: renderX, top: renderY, width: renderW, height: renderH };
    }

    // ── Initialization ──

    const observer = new MutationObserver(() => {
        const section = document.getElementById('step-extract');
        if (section.classList.contains('active') && state.videoMeta) {
            if (!initialized) {
                initExtractStep();
            } else {
                // Returning to this step - just restore crop overlay position
                restoreCropFromInputs();
            }
        }
    });
    observer.observe(document.getElementById('step-extract'), { attributes: true, attributeFilter: ['class'] });

    function initExtractStep() {
        videoDuration = state.videoMeta.duration;
        rangeStart.max = videoDuration;
        rangeEnd.max = videoDuration;
        rangeEnd.value = videoDuration;
        startInput.max = videoDuration;
        endInput.max = videoDuration;
        endInput.value = videoDuration.toFixed(2);
        totalTimeEl.textContent = formatTime(videoDuration);
        updateRange();
        // Initialize crop box once video has dimensions
        if (video.videoWidth) {
            initCropBox();
        } else {
            video.addEventListener('loadedmetadata', initCropBox, { once: true });
        }
        initialized = true;
    }

    function initCropBox() {
        const videoRect = getRenderedVideoRect();
        const containerRect = videoContainer.getBoundingClientRect();
        const offsetX = videoRect.left - containerRect.left;
        const offsetY = videoRect.top - containerRect.top;

        // Center crop box, size = 40% of smaller rendered dimension
        const dim = Math.min(videoRect.width, videoRect.height) * 0.4;
        crop.w = dim;
        crop.h = dim;
        crop.x = offsetX + (videoRect.width - crop.w) / 2;
        crop.y = offsetY + (videoRect.height - crop.h) / 2;
        applyCrop();
        syncInputsFromCrop();
    }

    function restoreCropFromInputs() {
        // Rebuild crop overlay position from the saved input values
        if (!video.videoWidth) return;
        syncCropFromInputs();
    }

    // ── Video Custom Controls ──

    playBtn.addEventListener('click', () => {
        video.play();
        playBtn.hidden = true;
        pauseBtn.hidden = false;
    });

    pauseBtn.addEventListener('click', () => {
        video.pause();
        isPreviewingRange = false;
        playBtn.hidden = false;
        pauseBtn.hidden = true;
    });

    previewRangeBtn.addEventListener('click', () => {
        const start = parseFloat(rangeStart.value);
        video.currentTime = start;
        video.play();
        isPreviewingRange = true;
        playBtn.hidden = true;
        pauseBtn.hidden = false;
    });

    video.addEventListener('timeupdate', () => {
        currentTimeEl.textContent = formatTime(video.currentTime);
        // Update playhead on range slider
        if (videoDuration > 0) {
            const pct = (video.currentTime / videoDuration) * 100;
            rangePlayhead.style.left = pct + '%';
        }
        // Loop at end of range when previewing
        if (isPreviewingRange) {
            const end = parseFloat(rangeEnd.value);
            // Use a small buffer to catch the boundary reliably
            if (video.currentTime >= end - 0.05) {
                video.currentTime = parseFloat(rangeStart.value);
            }
        }
    });

    // Handle video naturally ending (when range end === video end)
    video.addEventListener('ended', () => {
        if (isPreviewingRange) {
            // Always loop back to range start
            video.currentTime = parseFloat(rangeStart.value);
            video.play();
        } else {
            playBtn.hidden = false;
            pauseBtn.hidden = true;
        }
    });

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ── Range Slider with Video Seeking ──

    rangeStart.addEventListener('input', () => {
        if (parseFloat(rangeStart.value) >= parseFloat(rangeEnd.value)) {
            rangeStart.value = parseFloat(rangeEnd.value) - 0.01;
        }
        startInput.value = parseFloat(rangeStart.value).toFixed(2);
        video.currentTime = parseFloat(rangeStart.value);
        updateRange();
    });

    rangeEnd.addEventListener('input', () => {
        if (parseFloat(rangeEnd.value) <= parseFloat(rangeStart.value)) {
            rangeEnd.value = parseFloat(rangeStart.value) + 0.01;
        }
        endInput.value = parseFloat(rangeEnd.value).toFixed(2);
        video.currentTime = parseFloat(rangeEnd.value);
        updateRange();
    });

    startInput.addEventListener('change', () => {
        let val = parseFloat(startInput.value);
        if (val >= parseFloat(rangeEnd.value)) {
            val = parseFloat(rangeEnd.value) - 0.01;
            startInput.value = val.toFixed(2);
        }
        rangeStart.value = val;
        video.currentTime = val;
        updateRange();
    });

    endInput.addEventListener('change', () => {
        let val = parseFloat(endInput.value);
        if (val <= parseFloat(rangeStart.value)) {
            val = parseFloat(rangeStart.value) + 0.01;
            endInput.value = val.toFixed(2);
        }
        rangeEnd.value = val;
        video.currentTime = val;
        updateRange();
    });

    function updateRange() {
        const max = parseFloat(rangeEnd.max) || 1;
        const start = parseFloat(rangeStart.value);
        const end = parseFloat(rangeEnd.value);
        const startPct = (start / max) * 100;
        const endPct = (end / max) * 100;
        rangeSelected.style.left = startPct + '%';
        rangeSelected.style.width = (endPct - startPct) + '%';

        const dur = end - start;
        rangeDuration.textContent = dur.toFixed(2) + 's';
        updateEffectiveFps();
    }

    // ── Frame Count ──

    frameCount.addEventListener('input', () => {
        frameCountDisplay.textContent = frameCount.value;
        updateEffectiveFps();
    });

    function updateEffectiveFps() {
        const start = parseFloat(rangeStart.value);
        const end = parseFloat(rangeEnd.value);
        const dur = end - start;
        const count = parseInt(frameCount.value);
        if (dur > 0) {
            effectiveFps.textContent = `~${(count / dur).toFixed(1)} fps`;
        }
    }

    // ── Output Resolution with Aspect Lock ──

    lockAspectBtn.addEventListener('click', () => {
        aspectLocked = !aspectLocked;
        lockAspectBtn.classList.toggle('active', aspectLocked);
    });

    outputWidth.addEventListener('input', () => {
        if (aspectLocked) {
            const videoCrop = getVideoCropCoords();
            if (videoCrop && videoCrop.w > 0 && videoCrop.h > 0) {
                const ratio = videoCrop.h / videoCrop.w;
                outputHeight.value = Math.round(parseInt(outputWidth.value) * ratio) || 1;
            }
        }
    });

    outputHeight.addEventListener('input', () => {
        if (aspectLocked) {
            const videoCrop = getVideoCropCoords();
            if (videoCrop && videoCrop.w > 0 && videoCrop.h > 0) {
                const ratio = videoCrop.w / videoCrop.h;
                outputWidth.value = Math.round(parseInt(outputHeight.value) * ratio) || 1;
            }
        }
    });

    // ── Crop Box ──

    function constrainCrop() {
        const videoRect = getRenderedVideoRect();
        const containerRect = videoContainer.getBoundingClientRect();
        const offsetX = videoRect.left - containerRect.left;
        const offsetY = videoRect.top - containerRect.top;
        const vw = videoRect.width;
        const vh = videoRect.height;

        crop.w = Math.max(20, Math.min(crop.w, vw));
        crop.h = Math.max(20, Math.min(crop.h, vh));
        crop.x = Math.max(offsetX, Math.min(crop.x, offsetX + vw - crop.w));
        crop.y = Math.max(offsetY, Math.min(crop.y, offsetY + vh - crop.h));
    }

    function applyCrop() {
        cropOverlay.style.left = crop.x + 'px';
        cropOverlay.style.top = crop.y + 'px';
        cropOverlay.style.width = crop.w + 'px';
        cropOverlay.style.height = crop.h + 'px';

        // Update label with video-pixel coordinates
        const videoCrop = getVideoCropCoords();
        if (videoCrop) {
            cropLabel.textContent = `${videoCrop.w}x${videoCrop.h} at (${videoCrop.x}, ${videoCrop.y})`;
        }
    }

    function syncInputsFromCrop() {
        if (updatingFromInputs) return;
        updatingFromDrag = true;
        const vc = getVideoCropCoords();
        if (vc) {
            cropXInput.value = vc.x;
            cropYInput.value = vc.y;
            cropWInput.value = vc.w;
            cropHInput.value = vc.h;
            // Update output resolution to match crop if aspect locked
            if (aspectLocked) {
                outputWidth.value = vc.w;
                outputHeight.value = vc.h;
            }
        }
        updatingFromDrag = false;
    }

    function syncCropFromInputs() {
        if (updatingFromDrag) return;
        updatingFromInputs = true;
        const videoRect = getRenderedVideoRect();
        const containerRect = videoContainer.getBoundingClientRect();
        const offsetX = videoRect.left - containerRect.left;
        const offsetY = videoRect.top - containerRect.top;

        if (!video.videoWidth) { updatingFromInputs = false; return; }

        const scaleX = videoRect.width / video.videoWidth;
        const scaleY = videoRect.height / video.videoHeight;

        const vx = parseInt(cropXInput.value) || 0;
        const vy = parseInt(cropYInput.value) || 0;
        const vw = parseInt(cropWInput.value) || 1;
        const vh = parseInt(cropHInput.value) || 1;

        crop.x = offsetX + vx * scaleX;
        crop.y = offsetY + vy * scaleY;
        crop.w = vw * scaleX;
        crop.h = vh * scaleY;

        constrainCrop();
        applyCrop();
        updatingFromInputs = false;
    }

    function getVideoCropCoords() {
        if (!video.videoWidth) return null;
        const videoRect = getRenderedVideoRect();
        const containerRect = videoContainer.getBoundingClientRect();
        const offsetX = videoRect.left - containerRect.left;
        const offsetY = videoRect.top - containerRect.top;
        const scaleX = video.videoWidth / videoRect.width;
        const scaleY = video.videoHeight / videoRect.height;

        const x = Math.max(0, Math.round((crop.x - offsetX) * scaleX));
        const y = Math.max(0, Math.round((crop.y - offsetY) * scaleY));
        let w = Math.round(crop.w * scaleX);
        let h = Math.round(crop.h * scaleY);

        // Ensure crop doesn't exceed video bounds
        w = Math.min(w, video.videoWidth - x);
        h = Math.min(h, video.videoHeight - y);

        // FFmpeg requires even dimensions for many codecs
        w = Math.max(2, w - (w % 2));
        h = Math.max(2, h - (h % 2));

        return { x, y, w, h };
    }

    // Crop input listeners
    [cropXInput, cropYInput, cropWInput, cropHInput].forEach(input => {
        input.addEventListener('change', syncCropFromInputs);
    });

    // When crop W/H changes via inputs, update output res if locked
    cropWInput.addEventListener('change', () => {
        if (aspectLocked) {
            outputWidth.value = parseInt(cropWInput.value) || 128;
            outputHeight.value = parseInt(cropHInput.value) || 128;
        }
    });
    cropHInput.addEventListener('change', () => {
        if (aspectLocked) {
            outputWidth.value = parseInt(cropWInput.value) || 128;
            outputHeight.value = parseInt(cropHInput.value) || 128;
        }
    });

    // ── Crop Drag & Resize (free-form, no aspect lock) ──

    let dragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se'
    let dragStartX = 0, dragStartY = 0;
    let dragStartCrop = {};

    cropOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const handle = e.target.dataset.handle;
        dragMode = handle || 'move';
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartCrop = { ...crop };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });

    function onDragMove(e) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        if (dragMode === 'move') {
            crop.x = dragStartCrop.x + dx;
            crop.y = dragStartCrop.y + dy;
        } else if (dragMode === 'se') {
            crop.w = Math.max(20, dragStartCrop.w + dx);
            crop.h = Math.max(20, dragStartCrop.h + dy);
        } else if (dragMode === 'sw') {
            const newW = Math.max(20, dragStartCrop.w - dx);
            crop.x = dragStartCrop.x + dragStartCrop.w - newW;
            crop.w = newW;
            crop.h = Math.max(20, dragStartCrop.h + dy);
        } else if (dragMode === 'ne') {
            crop.w = Math.max(20, dragStartCrop.w + dx);
            const newH = Math.max(20, dragStartCrop.h - dy);
            crop.y = dragStartCrop.y + dragStartCrop.h - newH;
            crop.h = newH;
        } else if (dragMode === 'nw') {
            const newW = Math.max(20, dragStartCrop.w - dx);
            const newH = Math.max(20, dragStartCrop.h - dy);
            crop.x = dragStartCrop.x + dragStartCrop.w - newW;
            crop.y = dragStartCrop.y + dragStartCrop.h - newH;
            crop.w = newW;
            crop.h = newH;
        }

        constrainCrop();
        applyCrop();
        syncInputsFromCrop();
    }

    function onDragEnd() {
        dragMode = null;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
    }

    // Recalculate crop on window resize
    window.addEventListener('resize', () => {
        if (video.videoWidth) {
            syncCropFromInputs();
        }
    });

    // ── Extract ──

    extractBtn.addEventListener('click', async () => {
        const videoCrop = getVideoCropCoords();

        if (!videoCrop) {
            alert('Video not loaded yet');
            return;
        }

        const body = {
            video_id: state.videoId,
            start_time: parseFloat(rangeStart.value),
            end_time: parseFloat(rangeEnd.value),
            frame_count: parseInt(frameCount.value),
            width: parseInt(outputWidth.value) || videoCrop.w,
            height: parseInt(outputHeight.value) || videoCrop.h,
            crop_x: videoCrop.x,
            crop_y: videoCrop.y,
            crop_w: videoCrop.w,
            crop_h: videoCrop.h,
        };

        extractBtn.disabled = true;
        extractProgress.hidden = false;

        try {
            const resp = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            state.sessionId = data.session_id;
            state.frames = data.frames;
            state.transparentFrames = null;

            completeStep(1);
            showStep(2);
            initPreview();
        } catch (err) {
            alert('Extraction failed: ' + err.message);
        } finally {
            extractBtn.disabled = false;
            extractProgress.hidden = true;
        }
    });
})();
