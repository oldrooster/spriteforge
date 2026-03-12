(function () {
    const toolPanel = document.getElementById('tool-markup');
    const emptyState = document.getElementById('markup-empty');
    const canvasWrap = document.getElementById('markup-canvas-wrap');
    const canvas = document.getElementById('markup-canvas');
    const ctx = canvas.getContext('2d');

    // Tool buttons
    const brushBtn = document.getElementById('markup-brush-btn');
    const textBtn = document.getElementById('markup-text-btn');
    const brushSettings = document.getElementById('markup-brush-settings');
    const textSettings = document.getElementById('markup-text-settings');

    // Brush settings
    const colorPicker = document.getElementById('markup-color');
    const sizeSlider = document.getElementById('markup-size-slider');
    const sizeDisplay = document.getElementById('markup-size-display');

    // Text settings
    const textColorPicker = document.getElementById('markup-text-color');
    const fontSizeSlider = document.getElementById('markup-font-size-slider');
    const fontSizeDisplay = document.getElementById('markup-font-size-display');

    // History buttons
    const undoBtn = document.getElementById('markup-undo-btn');
    const redoBtn = document.getElementById('markup-redo-btn');
    const clearBtn = document.getElementById('markup-clear-btn');

    // Save buttons
    const saveNewBtn = document.getElementById('markup-save-new-btn');
    const overwriteBtn = document.getElementById('markup-overwrite-btn');
    const downloadBtn = document.getElementById('markup-download-btn');

    // State
    let originalImage = null;   // HTMLImageElement of loaded resource
    let pendingResource = null; // { asset_id, resource_id, resource_url, filename, type }
    let activeTool = 'brush';   // 'brush' | 'text'
    let isDrawing = false;
    let lastX = 0, lastY = 0;

    // Undo/redo stacks store ImageData snapshots
    let undoStack = [];
    let redoStack = [];
    const MAX_UNDO = 50;

    // ── Panel activation: load pending resource ──
    const observer = new MutationObserver(async function () {
        if (toolPanel.classList.contains('active') && state.pendingToolResource) {
            var pending = state.pendingToolResource;
            state.pendingToolResource = null;
            pendingResource = pending;
            try {
                var resp = await fetch(pending.resource_url);
                var blob = await resp.blob();
                var img = new Image();
                img.onload = function () {
                    originalImage = img;
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    pushUndo();
                    emptyState.hidden = true;
                    canvasWrap.hidden = false;
                    undoStack = [];
                    redoStack = [];
                    pushUndo();
                    updateHistoryButtons();
                };
                img.src = URL.createObjectURL(blob);
            } catch (e) {
                alert('Failed to load image: ' + e.message);
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    // ── Tool switching ──
    brushBtn.addEventListener('click', function () {
        activeTool = 'brush';
        brushBtn.classList.add('active');
        textBtn.classList.remove('active');
        brushSettings.hidden = false;
        textSettings.hidden = true;
        canvas.style.cursor = 'crosshair';
    });

    textBtn.addEventListener('click', function () {
        activeTool = 'text';
        textBtn.classList.add('active');
        brushBtn.classList.remove('active');
        textSettings.hidden = false;
        brushSettings.hidden = true;
        canvas.style.cursor = 'text';
    });

    // ── Brush size slider ──
    sizeSlider.addEventListener('input', function () {
        sizeDisplay.textContent = sizeSlider.value;
    });

    fontSizeSlider.addEventListener('input', function () {
        fontSizeDisplay.textContent = fontSizeSlider.value;
    });

    // ── Canvas coordinate helper ──
    function getCanvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    // ── Brush drawing ──
    canvas.addEventListener('mousedown', function (e) {
        if (!originalImage) return;
        if (activeTool === 'brush') {
            isDrawing = true;
            var pos = getCanvasPos(e);
            lastX = pos.x;
            lastY = pos.y;
            // Draw a dot at start position
            ctx.beginPath();
            ctx.arc(lastX, lastY, parseInt(sizeSlider.value) / 2, 0, Math.PI * 2);
            ctx.fillStyle = colorPicker.value;
            ctx.fill();
        } else if (activeTool === 'text') {
            var pos = getCanvasPos(e);
            promptText(pos.x, pos.y);
        }
    });

    canvas.addEventListener('mousemove', function (e) {
        if (!isDrawing || activeTool !== 'brush') return;
        var pos = getCanvasPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = parseInt(sizeSlider.value);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
    });

    window.addEventListener('mouseup', function () {
        if (isDrawing) {
            isDrawing = false;
            pushUndo();
        }
    });

    // ── Text placement ──
    function promptText(x, y) {
        var text = prompt('Enter annotation text:');
        if (!text || !text.trim()) return;
        var fontSize = parseInt(fontSizeSlider.value);
        var color = textColorPicker.value;
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';

        // Draw text background for readability
        var metrics = ctx.measureText(text);
        var padding = 4;
        var bgX = x - padding;
        var bgY = y - padding;
        var bgW = metrics.width + padding * 2;
        var bgH = fontSize + padding * 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(bgX, bgY, bgW, bgH);

        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        pushUndo();
    }

    // ── Undo / Redo ──
    function pushUndo() {
        var snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        undoStack.push(snapshot);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        undoBtn.disabled = undoStack.length <= 1;
        redoBtn.disabled = redoStack.length === 0;
    }

    undoBtn.addEventListener('click', function () {
        if (undoStack.length <= 1) return;
        var current = undoStack.pop();
        redoStack.push(current);
        var prev = undoStack[undoStack.length - 1];
        ctx.putImageData(prev, 0, 0);
        updateHistoryButtons();
    });

    redoBtn.addEventListener('click', function () {
        if (redoStack.length === 0) return;
        var next = redoStack.pop();
        undoStack.push(next);
        ctx.putImageData(next, 0, 0);
        updateHistoryButtons();
    });

    clearBtn.addEventListener('click', function () {
        if (!originalImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0);
        pushUndo();
    });

    // ── Flatten canvas to blob ──
    function flattenToBlob() {
        return new Promise(function (resolve) {
            canvas.toBlob(resolve, 'image/png');
        });
    }

    // ── Save as New Resource ──
    saveNewBtn.addEventListener('click', async function () {
        if (!pendingResource || !originalImage) return;
        saveNewBtn.disabled = true;
        try {
            var blob = await flattenToBlob();
            var baseName = pendingResource.filename.replace(/\.[^.]+$/, '');
            var newFilename = baseName + '_markup.png';
            var fd = new FormData();
            fd.append('file', blob, newFilename);
            var resp = await fetch('/api/assets/' + pendingResource.asset_id + '/resources', {
                method: 'POST',
                body: fd,
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Save failed');
            alert('Saved as new resource: ' + newFilename);
        } catch (err) {
            alert('Failed to save: ' + err.message);
        } finally {
            saveNewBtn.disabled = false;
        }
    });

    // ── Overwrite Original ──
    overwriteBtn.addEventListener('click', async function () {
        if (!pendingResource || !originalImage) return;
        if (!confirm('Overwrite the original resource? This cannot be undone.')) return;
        overwriteBtn.disabled = true;
        try {
            var blob = await flattenToBlob();
            var fd = new FormData();
            fd.append('file', blob, pendingResource.filename);
            var resp = await fetch('/api/assets/' + pendingResource.asset_id + '/resources/' + pendingResource.resource_id + '/file', {
                method: 'PUT',
                body: fd,
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Overwrite failed');
            alert('Original resource overwritten.');
        } catch (err) {
            alert('Failed to overwrite: ' + err.message);
        } finally {
            overwriteBtn.disabled = false;
        }
    });

    // ── Download PNG ──
    downloadBtn.addEventListener('click', function () {
        if (!originalImage) return;
        var link = document.createElement('a');
        link.download = (pendingResource ? pendingResource.filename.replace(/\.[^.]+$/, '') : 'markup') + '_markup.png';
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Set initial cursor
    canvas.style.cursor = 'crosshair';
})();
