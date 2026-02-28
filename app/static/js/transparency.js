(function () {
    const canvas = document.getElementById('transparency-canvas');
    const ctx = canvas.getContext('2d');
    const zoomContainer = document.getElementById('canvas-zoom-container');
    const playBtn = document.getElementById('trans-play-btn');
    const pauseBtn = document.getElementById('trans-pause-btn');
    const frameIndicator = document.getElementById('trans-frame-indicator');
    const frameSlider = document.getElementById('trans-frame-slider');
    const frameDisplay = document.getElementById('trans-frame-display');
    const delaySlider = document.getElementById('trans-delay-slider');
    const delayDisplay = document.getElementById('trans-delay-display');
    const colorPicker = document.getElementById('bg-color-picker');
    const eyedropperBtn = document.getElementById('eyedropper-btn');
    const toleranceSlider = document.getElementById('tolerance-slider');
    const toleranceDisplay = document.getElementById('tolerance-display');
    const applyBtn = document.getElementById('apply-transparency-btn');
    const resetBtn = document.getElementById('reset-transparency-btn');
    const transparencyProgress = document.getElementById('transparency-progress');
    const downloadBtn = document.getElementById('download-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const floodBtn = document.getElementById('flood-btn');
    const eraserSizeSlider = document.getElementById('eraser-size-slider');
    const eraserSizeDisplay = document.getElementById('eraser-size-display');
    const floodToleranceSlider = document.getElementById('flood-tolerance-slider');
    const floodToleranceDisplay = document.getElementById('flood-tolerance-display');
    const previewBgBtns = document.querySelectorAll('.preview-bg-btn');
    const previewBgCustom = document.getElementById('preview-bg-custom');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const zoomDisplay = document.getElementById('zoom-display');

    let transImages = [];
    let transIndex = 0;
    let transTimer = null;
    let transPlaying = false;
    let eyedropperActive = false;
    let transDelay = 100;

    // Preview background
    let previewBg = 'checkerboard';

    // Eraser state
    let eraserMode = null; // null, 'brush', or 'flood'
    let eraserSize = 10;
    let floodTolerance = 30;
    let isErasing = false;
    let isRestoring = false;
    let eraserCursor = null;
    let frameEdits = {};

    // Zoom state
    let zoomLevel = 1;
    const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
    let zoomStepIndex = 2; // starts at 1x

    // Create eraser cursor element
    eraserCursor = document.createElement('div');
    eraserCursor.className = 'eraser-cursor';
    document.body.appendChild(eraserCursor);

    // Preview background buttons
    previewBgBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            previewBgBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            previewBg = btn.dataset.bg;
            drawTransFrame(transIndex);
        });
    });

    previewBgCustom.addEventListener('input', () => {
        previewBgBtns.forEach(b => b.classList.remove('active'));
        previewBg = previewBgCustom.value;
        drawTransFrame(transIndex);
    });

    // Zoom functions
    function applyZoom() {
        zoomLevel = ZOOM_STEPS[zoomStepIndex];
        canvas.style.transform = `scale(${zoomLevel})`;
        // Adjust container sizing so scrollbars work
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        // The scaled size determines the scroll area
        const scaledW = canvas.width * zoomLevel;
        const scaledH = canvas.height * zoomLevel;
        canvas.style.marginRight = (scaledW - canvas.width) + 'px';
        canvas.style.marginBottom = (scaledH - canvas.height) + 'px';
        zoomDisplay.textContent = Math.round(zoomLevel * 100) + '%';

        // At fit/1x, center the canvas
        if (zoomLevel <= 1) {
            zoomContainer.style.justifyContent = 'center';
            zoomContainer.style.alignItems = 'center';
        } else {
            zoomContainer.style.justifyContent = 'flex-start';
            zoomContainer.style.alignItems = 'flex-start';
        }
    }

    zoomInBtn.addEventListener('click', () => {
        if (zoomStepIndex < ZOOM_STEPS.length - 1) {
            zoomStepIndex++;
            applyZoom();
        }
    });

    zoomOutBtn.addEventListener('click', () => {
        if (zoomStepIndex > 0) {
            zoomStepIndex--;
            applyZoom();
        }
    });

    zoomResetBtn.addEventListener('click', () => {
        zoomStepIndex = 2; // 1x
        applyZoom();
    });

    // Mouse wheel zoom on canvas
    zoomContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0 && zoomStepIndex < ZOOM_STEPS.length - 1) {
                zoomStepIndex++;
            } else if (e.deltaY > 0 && zoomStepIndex > 0) {
                zoomStepIndex--;
            }
            applyZoom();
        }
    }, { passive: false });

    // Initialize when step becomes active
    const observer = new MutationObserver(() => {
        const section = document.getElementById('step-transparency');
        if (section.classList.contains('active') && state.frames.length > 0) {
            initTransparency();
        }
    });
    observer.observe(document.getElementById('step-transparency'), { attributes: true, attributeFilter: ['class'] });

    function initTransparency() {
        const frames = state.transparentFrames || state.frames;
        transImages = [];
        transIndex = 0;
        frameEdits = {};
        stopTransPreview();

        let loadedCount = 0;
        frames.forEach((url) => {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === frames.length) {
                    canvas.width = transImages[0].width;
                    canvas.height = transImages[0].height;
                    frameSlider.max = transImages.length - 1;
                    frameSlider.value = 0;
                    frameDisplay.textContent = '1';
                    zoomStepIndex = 2;
                    applyZoom();
                    drawTransFrame(0);
                }
            };
            img.src = url + '?t=' + Date.now();
            transImages.push(img);
        });
    }

    function drawBackground(w, h) {
        if (previewBg === 'checkerboard') {
            const size = 16;
            const colors = ['#7B2D8E', '#9B4DBA'];
            for (let y = 0; y < h; y += size) {
                for (let x = 0; x < w; x += size) {
                    ctx.fillStyle = colors[((Math.floor(x / size) + Math.floor(y / size)) % 2)];
                    ctx.fillRect(x, y, size, size);
                }
            }
        } else {
            ctx.fillStyle = previewBg;
            ctx.fillRect(0, 0, w, h);
        }
    }

    function drawTransFrame(index) {
        transIndex = index;
        if (!transImages[index]) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(canvas.width, canvas.height);

        if (frameEdits[index]) {
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width;
            tmp.height = canvas.height;
            tmp.getContext('2d').putImageData(frameEdits[index], 0, 0);
            ctx.drawImage(tmp, 0, 0);
        } else {
            ctx.drawImage(transImages[index], 0, 0);
        }

        frameIndicator.textContent = `Frame: ${index + 1} / ${transImages.length}`;
        frameSlider.value = index;
        frameDisplay.textContent = index + 1;
    }

    function getFrameImageData(index) {
        if (frameEdits[index]) return frameEdits[index];
        const offCanvas = document.createElement('canvas');
        offCanvas.width = canvas.width;
        offCanvas.height = canvas.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(transImages[index], 0, 0);
        return offCtx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function startTransPreview() {
        transPlaying = true;
        playBtn.hidden = true;
        pauseBtn.hidden = false;
        tickTrans();
    }

    function stopTransPreview() {
        transPlaying = false;
        if (transTimer) {
            clearTimeout(transTimer);
            transTimer = null;
        }
        playBtn.hidden = false;
        pauseBtn.hidden = true;
    }

    function tickTrans() {
        if (!transPlaying) return;
        drawTransFrame(transIndex);
        transIndex = (transIndex + 1) % transImages.length;
        transTimer = setTimeout(tickTrans, transDelay);
    }

    playBtn.addEventListener('click', startTransPreview);
    pauseBtn.addEventListener('click', stopTransPreview);

    frameSlider.addEventListener('input', () => {
        const idx = parseInt(frameSlider.value);
        if (transPlaying) {
            transIndex = idx;
        } else {
            drawTransFrame(idx);
        }
        frameDisplay.textContent = idx + 1;
    });

    delaySlider.addEventListener('input', () => {
        transDelay = parseInt(delaySlider.value);
        delayDisplay.textContent = delaySlider.value;
    });

    toleranceSlider.addEventListener('input', () => {
        toleranceDisplay.textContent = toleranceSlider.value;
    });

    // Eyedropper
    eyedropperBtn.addEventListener('click', () => {
        if (eraserMode) setEraserMode(null);
        eyedropperActive = !eyedropperActive;
        eyedropperBtn.classList.toggle('active', eyedropperActive);
        document.querySelector('.transparency-preview').classList.toggle('eyedropper-active', eyedropperActive);
    });

    canvas.addEventListener('click', (e) => {
        if (!eyedropperActive) return;
        const { x, y } = getCanvasCoords(e);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            tempCtx.drawImage(img, 0, 0);
            const pixel = tempCtx.getImageData(x, y, 1, 1).data;
            const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
            colorPicker.value = hex;
            eyedropperActive = false;
            eyedropperBtn.classList.remove('active');
            document.querySelector('.transparency-preview').classList.remove('eyedropper-active');
        };
        img.src = state.frames[transIndex] + '?t=' + Date.now();
    });

    // Eraser mode management
    function setEraserMode(mode) {
        eraserMode = mode;
        eraserBtn.classList.toggle('active', mode === 'brush');
        floodBtn.classList.toggle('active', mode === 'flood');
        const preview = document.querySelector('.transparency-preview');
        preview.classList.toggle('eraser-active', mode === 'brush');
        // For flood fill, use crosshair cursor via CSS
        canvas.style.cursor = mode === 'flood' ? 'crosshair' : '';
        if (mode !== 'brush') {
            eraserCursor.style.display = 'none';
        }
    }

    function clearOtherTools() {
        if (eyedropperActive) {
            eyedropperActive = false;
            eyedropperBtn.classList.remove('active');
            document.querySelector('.transparency-preview').classList.remove('eyedropper-active');
        }
    }

    eraserBtn.addEventListener('click', () => {
        clearOtherTools();
        setEraserMode(eraserMode === 'brush' ? null : 'brush');
    });

    floodBtn.addEventListener('click', () => {
        clearOtherTools();
        setEraserMode(eraserMode === 'flood' ? null : 'flood');
    });

    eraserSizeSlider.addEventListener('input', () => {
        eraserSize = parseInt(eraserSizeSlider.value);
        eraserSizeDisplay.textContent = eraserSize;
        updateEraserCursorSize();
    });

    floodToleranceSlider.addEventListener('input', () => {
        floodTolerance = parseInt(floodToleranceSlider.value);
        floodToleranceDisplay.textContent = floodTolerance;
    });

    function updateEraserCursorSize() {
        const rect = canvas.getBoundingClientRect();
        const displaySize = eraserSize * (rect.width / (canvas.width * zoomLevel)) * zoomLevel * 2;
        eraserCursor.style.width = displaySize + 'px';
        eraserCursor.style.height = displaySize + 'px';
    }

    canvas.addEventListener('mousemove', (e) => {
        if (eraserMode !== 'brush') return;
        updateEraserCursorSize();
        eraserCursor.style.left = (e.clientX - eraserCursor.offsetWidth / 2) + 'px';
        eraserCursor.style.top = (e.clientY - eraserCursor.offsetHeight / 2) + 'px';
        eraserCursor.style.display = 'block';

        if (isErasing) {
            brushEraseAt(e);
        } else if (isRestoring) {
            brushRestoreAt(e);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        eraserCursor.style.display = 'none';
    });

    canvas.addEventListener('mousedown', (e) => {
        if (!eraserMode) return;
        e.preventDefault();
        if (transPlaying) stopTransPreview();

        if (eraserMode === 'brush') {
            if (e.button === 2) {
                isRestoring = true;
                brushRestoreAt(e);
            } else if (e.button === 0) {
                isErasing = true;
                brushEraseAt(e);
            }
        } else if (eraserMode === 'flood' && e.button === 0) {
            floodErase(e);
        }
    });

    canvas.addEventListener('contextmenu', (e) => {
        if (eraserMode) e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
        if (isErasing || isRestoring) {
            isErasing = false;
            isRestoring = false;
            saveFrameEdit();
        }
    });

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY),
        };
    }

    function brushEraseAt(e) {
        const { x, y } = getCanvasCoords(e);
        if (!frameEdits[transIndex]) {
            frameEdits[transIndex] = getFrameImageData(transIndex);
        }
        const imageData = frameEdits[transIndex];
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const r = eraserSize;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const px = x + dx;
                const py = y + dy;
                if (px < 0 || px >= w || py < 0 || py >= h) continue;
                const idx = (py * w + px) * 4;
                data[idx + 3] = 0;
            }
        }

        drawTransFrame(transIndex);
    }

    function brushRestoreAt(e) {
        const { x, y } = getCanvasCoords(e);
        if (!frameEdits[transIndex]) {
            frameEdits[transIndex] = getFrameImageData(transIndex);
        }

        const origCanvas = document.createElement('canvas');
        origCanvas.width = canvas.width;
        origCanvas.height = canvas.height;
        const origCtx = origCanvas.getContext('2d');
        origCtx.drawImage(transImages[transIndex], 0, 0);
        const origData = origCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        const imageData = frameEdits[transIndex];
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const r = eraserSize;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const px = x + dx;
                const py = y + dy;
                if (px < 0 || px >= w || py < 0 || py >= h) continue;
                const idx = (py * w + px) * 4;
                data[idx] = origData[idx];
                data[idx + 1] = origData[idx + 1];
                data[idx + 2] = origData[idx + 2];
                data[idx + 3] = origData[idx + 3];
            }
        }

        drawTransFrame(transIndex);
    }

    // Flood fill erase - removes all connected pixels of similar color
    function floodErase(e) {
        const { x, y } = getCanvasCoords(e);
        if (!frameEdits[transIndex]) {
            frameEdits[transIndex] = getFrameImageData(transIndex);
        }
        const imageData = frameEdits[transIndex];
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;

        // Get the color at click point
        const startIdx = (y * w + x) * 4;
        const startR = data[startIdx];
        const startG = data[startIdx + 1];
        const startB = data[startIdx + 2];
        const startA = data[startIdx + 3];

        // Don't flood fill if already transparent
        if (startA === 0) return;

        const tol = floodTolerance;
        const visited = new Uint8Array(w * h);
        const stack = [x + y * w];
        visited[x + y * w] = 1;

        while (stack.length > 0) {
            const pos = stack.pop();
            const px = pos % w;
            const py = (pos - px) / w;
            const idx = pos * 4;

            // Check color distance
            const dr = data[idx] - startR;
            const dg = data[idx + 1] - startG;
            const db = data[idx + 2] - startB;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);

            if (dist <= tol && data[idx + 3] > 0) {
                data[idx + 3] = 0; // Make transparent

                // Add neighbors
                const neighbors = [
                    px > 0 ? pos - 1 : -1,
                    px < w - 1 ? pos + 1 : -1,
                    py > 0 ? pos - w : -1,
                    py < h - 1 ? pos + w : -1,
                ];
                for (const npos of neighbors) {
                    if (npos >= 0 && !visited[npos]) {
                        visited[npos] = 1;
                        stack.push(npos);
                    }
                }
            }
        }

        drawTransFrame(transIndex);
        saveFrameEdit();
    }

    function saveFrameEdit() {
        const imageData = frameEdits[transIndex];
        if (!imageData) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

        tempCanvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('session_id', state.sessionId);
            formData.append('frame_index', transIndex);
            formData.append('image', blob, `frame_${String(transIndex).padStart(4, '0')}.png`);

            try {
                const resp = await fetch('/api/save-frame', {
                    method: 'POST',
                    body: formData,
                });
                if (!resp.ok) {
                    const data = await resp.json();
                    console.error('Failed to save frame edit:', data.error);
                }
            } catch (err) {
                console.error('Failed to save frame edit:', err);
            }
        }, 'image/png');
    }

    // Apply transparency
    const edgesOnlyCheckbox = document.getElementById('edges-only-checkbox');

    applyBtn.addEventListener('click', async () => {
        const hex = colorPicker.value;
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);

        applyBtn.disabled = true;
        transparencyProgress.hidden = false;
        stopTransPreview();

        try {
            const resp = await fetch('/api/transparency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    color: [r, g, b],
                    tolerance: parseInt(toleranceSlider.value),
                    edges_only: edgesOnlyCheckbox.checked,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            state.transparentFrames = data.frames;
            initTransparency();
        } catch (err) {
            alert('Transparency failed: ' + err.message);
        } finally {
            applyBtn.disabled = false;
            transparencyProgress.hidden = true;
        }
    });

    // AI Background Removal (rembg)
    const rembgBtn = document.getElementById('rembg-btn');
    const rembgProgress = document.getElementById('rembg-progress');

    rembgBtn.addEventListener('click', async () => {
        rembgBtn.disabled = true;
        rembgProgress.hidden = false;
        stopTransPreview();

        try {
            const resp = await fetch('/api/rembg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            state.transparentFrames = data.frames;
            initTransparency();
        } catch (err) {
            alert('AI background removal failed: ' + err.message);
        } finally {
            rembgBtn.disabled = false;
            rembgProgress.hidden = true;
        }
    });

    // Reset
    resetBtn.addEventListener('click', () => {
        state.transparentFrames = null;
        frameEdits = {};
        stopTransPreview();
        initTransparency();
    });

    // Download
    downloadBtn.addEventListener('click', () => {
        window.location.href = `/api/download/${state.sessionId}`;
    });
})();
