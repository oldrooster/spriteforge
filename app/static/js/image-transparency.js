(function () {
    const dropzone = document.getElementById('img-trans-dropzone');
    const fileInput = document.getElementById('img-trans-file-input');
    const canvasArea = document.getElementById('img-trans-canvas-area');
    const canvas = document.getElementById('img-trans-canvas');
    const ctx = canvas.getContext('2d');
    const zoomContainer = document.getElementById('img-trans-zoom-container');
    const settingsPanel = document.getElementById('img-trans-settings');
    const colorPicker = document.getElementById('img-trans-color-picker');
    const eyedropperBtn = document.getElementById('img-trans-eyedropper-btn');
    const toleranceSlider = document.getElementById('img-trans-tolerance-slider');
    const toleranceDisplay = document.getElementById('img-trans-tolerance-display');
    const edgesOnlyCheckbox = document.getElementById('img-trans-edges-only');
    const applyBtn = document.getElementById('img-trans-apply-btn');
    const resetBtn = document.getElementById('img-trans-reset-btn');
    const applyProgress = document.getElementById('img-trans-progress');
    const rembgBtn = document.getElementById('img-trans-rembg-btn');
    const rembgProgress = document.getElementById('img-trans-rembg-progress');
    const eraserBtn = document.getElementById('img-trans-eraser-btn');
    const floodBtn = document.getElementById('img-trans-flood-btn');
    const eraserSizeSlider = document.getElementById('img-trans-eraser-size-slider');
    const eraserSizeDisplay = document.getElementById('img-trans-eraser-size-display');
    const floodToleranceSlider = document.getElementById('img-trans-flood-tolerance-slider');
    const floodToleranceDisplay = document.getElementById('img-trans-flood-tolerance-display');
    const zoomInBtn = document.getElementById('img-trans-zoom-in');
    const zoomOutBtn = document.getElementById('img-trans-zoom-out');
    const zoomResetBtn = document.getElementById('img-trans-zoom-reset');
    const zoomDisplay = document.getElementById('img-trans-zoom-display');
    const downloadBtn = document.getElementById('img-trans-download-btn');
    const bgOptions = document.getElementById('img-trans-bg-options');
    const bgBtns = bgOptions.querySelectorAll('.preview-bg-btn');
    const bgCustom = document.getElementById('img-trans-bg-custom');

    let sessionId = null;
    let originalImage = null;  // HTMLImageElement of the uploaded/processed image
    let currentImageData = null;  // ImageData for manual edits
    let eyedropperActive = false;
    let eraserMode = null;
    let eraserSize = 10;
    let floodTolerance = 30;
    let isErasing = false;
    let isRestoring = false;
    let previewBg = 'checkerboard';

    // Zoom
    let zoomLevel = 1;
    const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
    let zoomStepIndex = 2;

    // Eraser cursor
    const eraserCursor = document.createElement('div');
    eraserCursor.className = 'eraser-cursor';
    document.body.appendChild(eraserCursor);

    // ── Drag-and-drop upload ──
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) uploadImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) uploadImage(fileInput.files[0]);
    });

    async function uploadImage(file) {
        if (!file.type.startsWith('image/')) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const resp = await fetch('/api/upload-image', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            sessionId = data.session_id;
            loadImage(data.frame_url);
        } catch (err) {
            alert('Upload failed: ' + err.message);
        }
    }

    function loadImage(url) {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            currentImageData = null;
            canvas.width = img.width;
            canvas.height = img.height;
            zoomStepIndex = 2;
            applyZoom();
            drawFrame();

            // Show canvas and settings, hide dropzone
            dropzone.style.display = 'none';
            canvasArea.hidden = false;
            settingsPanel.style.display = '';
        };
        img.src = url + '?t=' + Date.now();
    }

    // ── Preview background ──
    bgBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bgBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            previewBg = btn.dataset.bg;
            drawFrame();
        });
    });
    bgCustom.addEventListener('input', () => {
        bgBtns.forEach(b => b.classList.remove('active'));
        previewBg = bgCustom.value;
        drawFrame();
    });

    // ── Zoom ──
    function applyZoom() {
        zoomLevel = ZOOM_STEPS[zoomStepIndex];
        canvas.style.transform = `scale(${zoomLevel})`;
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        const scaledW = canvas.width * zoomLevel;
        const scaledH = canvas.height * zoomLevel;
        canvas.style.marginRight = (scaledW - canvas.width) + 'px';
        canvas.style.marginBottom = (scaledH - canvas.height) + 'px';
        zoomDisplay.textContent = Math.round(zoomLevel * 100) + '%';
        if (zoomLevel <= 1) {
            zoomContainer.style.justifyContent = 'center';
            zoomContainer.style.alignItems = 'center';
        } else {
            zoomContainer.style.justifyContent = 'flex-start';
            zoomContainer.style.alignItems = 'flex-start';
        }
    }

    zoomInBtn.addEventListener('click', () => { if (zoomStepIndex < ZOOM_STEPS.length - 1) { zoomStepIndex++; applyZoom(); } });
    zoomOutBtn.addEventListener('click', () => { if (zoomStepIndex > 0) { zoomStepIndex--; applyZoom(); } });
    zoomResetBtn.addEventListener('click', () => { zoomStepIndex = 2; applyZoom(); });
    zoomContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0 && zoomStepIndex < ZOOM_STEPS.length - 1) zoomStepIndex++;
            else if (e.deltaY > 0 && zoomStepIndex > 0) zoomStepIndex--;
            applyZoom();
        }
    }, { passive: false });

    // ── Drawing ──
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

    function drawFrame() {
        if (!originalImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(canvas.width, canvas.height);

        if (currentImageData) {
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width;
            tmp.height = canvas.height;
            tmp.getContext('2d').putImageData(currentImageData, 0, 0);
            ctx.drawImage(tmp, 0, 0);
        } else {
            ctx.drawImage(originalImage, 0, 0);
        }
    }

    function getImageData() {
        if (currentImageData) return currentImageData;
        const off = document.createElement('canvas');
        off.width = canvas.width;
        off.height = canvas.height;
        off.getContext('2d').drawImage(originalImage, 0, 0);
        return off.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    }

    // ── Eyedropper ──
    eyedropperBtn.addEventListener('click', () => {
        if (eraserMode) setEraserMode(null);
        eyedropperActive = !eyedropperActive;
        eyedropperBtn.classList.toggle('active', eyedropperActive);
        canvasArea.classList.toggle('eyedropper-active', eyedropperActive);
    });

    canvas.addEventListener('click', (e) => {
        if (!eyedropperActive) return;
        const { x, y } = getCanvasCoords(e);
        const imgData = getImageData();
        const idx = (y * canvas.width + x) * 4;
        const hex = '#' + [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2]]
            .map(v => v.toString(16).padStart(2, '0')).join('');
        colorPicker.value = hex;
        eyedropperActive = false;
        eyedropperBtn.classList.remove('active');
        canvasArea.classList.remove('eyedropper-active');
    });

    // ── Eraser mode ──
    function setEraserMode(mode) {
        eraserMode = mode;
        eraserBtn.classList.toggle('active', mode === 'brush');
        floodBtn.classList.toggle('active', mode === 'flood');
        canvasArea.classList.toggle('eraser-active', mode === 'brush');
        canvas.style.cursor = mode === 'flood' ? 'crosshair' : '';
        if (mode !== 'brush') eraserCursor.style.display = 'none';
    }

    function clearOtherTools() {
        if (eyedropperActive) {
            eyedropperActive = false;
            eyedropperBtn.classList.remove('active');
            canvasArea.classList.remove('eyedropper-active');
        }
    }

    eraserBtn.addEventListener('click', () => { clearOtherTools(); setEraserMode(eraserMode === 'brush' ? null : 'brush'); });
    floodBtn.addEventListener('click', () => { clearOtherTools(); setEraserMode(eraserMode === 'flood' ? null : 'flood'); });

    eraserSizeSlider.addEventListener('input', () => {
        eraserSize = parseInt(eraserSizeSlider.value);
        eraserSizeDisplay.textContent = eraserSize;
        updateEraserCursorSize();
    });

    floodToleranceSlider.addEventListener('input', () => {
        floodTolerance = parseInt(floodToleranceSlider.value);
        floodToleranceDisplay.textContent = floodTolerance;
    });

    toleranceSlider.addEventListener('input', () => {
        toleranceDisplay.textContent = toleranceSlider.value;
    });

    function updateEraserCursorSize() {
        const rect = canvas.getBoundingClientRect();
        const displaySize = eraserSize * (rect.width / (canvas.width * zoomLevel)) * zoomLevel * 2;
        eraserCursor.style.width = displaySize + 'px';
        eraserCursor.style.height = displaySize + 'px';
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY),
        };
    }

    canvas.addEventListener('mousemove', (e) => {
        if (eraserMode !== 'brush') return;
        updateEraserCursorSize();
        eraserCursor.style.left = (e.clientX - eraserCursor.offsetWidth / 2) + 'px';
        eraserCursor.style.top = (e.clientY - eraserCursor.offsetHeight / 2) + 'px';
        eraserCursor.style.display = 'block';
        if (isErasing) brushEraseAt(e);
        else if (isRestoring) brushRestoreAt(e);
    });

    canvas.addEventListener('mouseleave', () => { eraserCursor.style.display = 'none'; });

    canvas.addEventListener('mousedown', (e) => {
        if (!eraserMode) return;
        e.preventDefault();
        if (eraserMode === 'brush') {
            if (e.button === 2) { isRestoring = true; brushRestoreAt(e); }
            else if (e.button === 0) { isErasing = true; brushEraseAt(e); }
        } else if (eraserMode === 'flood' && e.button === 0) {
            floodErase(e);
        }
    });

    canvas.addEventListener('contextmenu', (e) => { if (eraserMode) e.preventDefault(); });

    window.addEventListener('mouseup', () => {
        if (isErasing || isRestoring) {
            isErasing = false;
            isRestoring = false;
            saveEdit();
        }
    });

    // ── Brush erase/restore ──
    function brushEraseAt(e) {
        const { x, y } = getCanvasCoords(e);
        if (!currentImageData) currentImageData = getImageData();
        const data = currentImageData.data;
        const w = currentImageData.width;
        const h = currentImageData.height;
        const r = eraserSize;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const px = x + dx, py = y + dy;
                if (px < 0 || px >= w || py < 0 || py >= h) continue;
                data[(py * w + px) * 4 + 3] = 0;
            }
        }
        drawFrame();
    }

    function brushRestoreAt(e) {
        const { x, y } = getCanvasCoords(e);
        if (!currentImageData) currentImageData = getImageData();

        const origCanvas = document.createElement('canvas');
        origCanvas.width = canvas.width;
        origCanvas.height = canvas.height;
        origCanvas.getContext('2d').drawImage(originalImage, 0, 0);
        const origData = origCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

        const data = currentImageData.data;
        const w = currentImageData.width;
        const h = currentImageData.height;
        const r = eraserSize;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const px = x + dx, py = y + dy;
                if (px < 0 || px >= w || py < 0 || py >= h) continue;
                const idx = (py * w + px) * 4;
                data[idx] = origData[idx];
                data[idx + 1] = origData[idx + 1];
                data[idx + 2] = origData[idx + 2];
                data[idx + 3] = origData[idx + 3];
            }
        }
        drawFrame();
    }

    // ── Flood fill erase ──
    function floodErase(e) {
        const { x, y } = getCanvasCoords(e);
        if (!currentImageData) currentImageData = getImageData();
        const data = currentImageData.data;
        const w = currentImageData.width;
        const h = currentImageData.height;

        const startIdx = (y * w + x) * 4;
        const startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2], startA = data[startIdx + 3];
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

            const dr = data[idx] - startR;
            const dg = data[idx + 1] - startG;
            const db = data[idx + 2] - startB;
            if (Math.sqrt(dr * dr + dg * dg + db * db) <= tol && data[idx + 3] > 0) {
                data[idx + 3] = 0;
                if (px > 0 && !visited[pos - 1]) { visited[pos - 1] = 1; stack.push(pos - 1); }
                if (px < w - 1 && !visited[pos + 1]) { visited[pos + 1] = 1; stack.push(pos + 1); }
                if (py > 0 && !visited[pos - w]) { visited[pos - w] = 1; stack.push(pos - w); }
                if (py < h - 1 && !visited[pos + w]) { visited[pos + w] = 1; stack.push(pos + w); }
            }
        }
        drawFrame();
        saveEdit();
    }

    // ── Save edit to server ──
    function saveEdit() {
        if (!currentImageData || !sessionId) return;
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        tmp.getContext('2d').putImageData(currentImageData, 0, 0);

        tmp.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('session_id', sessionId);
            formData.append('frame_index', 0);
            formData.append('image', blob, 'frame_0001.png');
            try {
                await fetch('/api/save-frame', { method: 'POST', body: formData });
            } catch (err) {
                console.error('Failed to save edit:', err);
            }
        }, 'image/png');
    }

    // ── Apply color removal (server-side) ──
    applyBtn.addEventListener('click', async () => {
        if (!sessionId) return;
        const hex = colorPicker.value;
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);

        applyBtn.disabled = true;
        applyProgress.hidden = false;

        try {
            const resp = await fetch('/api/transparency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    color: [r, g, b],
                    tolerance: parseInt(toleranceSlider.value),
                    edges_only: edgesOnlyCheckbox.checked,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            // Reload the transparent version
            reloadFromServer(data.frames[0]);
        } catch (err) {
            alert('Transparency failed: ' + err.message);
        } finally {
            applyBtn.disabled = false;
            applyProgress.hidden = true;
        }
    });

    // ── AI background removal ──
    rembgBtn.addEventListener('click', async () => {
        if (!sessionId) return;
        rembgBtn.disabled = true;
        rembgProgress.hidden = false;

        try {
            const resp = await fetch('/api/rembg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            reloadFromServer(data.frames[0]);
        } catch (err) {
            alert('AI background removal failed: ' + err.message);
        } finally {
            rembgBtn.disabled = false;
            rembgProgress.hidden = true;
        }
    });

    function reloadFromServer(frameUrl) {
        currentImageData = null;
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            applyZoom();
            drawFrame();
        };
        img.src = frameUrl + '?t=' + Date.now();
    }

    // ── Reset ──
    resetBtn.addEventListener('click', () => {
        if (!sessionId) return;
        currentImageData = null;
        // Reload original
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            applyZoom();
            drawFrame();
        };
        img.src = `/api/frames/${sessionId}/original/frame_0001.png?t=` + Date.now();
    });

    // ── Download ──
    downloadBtn.addEventListener('click', () => {
        if (sessionId) {
            window.location.href = `/api/download-image/${sessionId}`;
        }
    });
})();
