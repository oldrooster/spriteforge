(function () {
    var toolPanel = document.getElementById('tool-markup');
    var emptyState = document.getElementById('markup-empty');
    var canvasWrap = document.getElementById('markup-canvas-wrap');
    var canvas = document.getElementById('markup-canvas');
    var ctx = canvas.getContext('2d');

    // Tool buttons
    var brushBtn = document.getElementById('markup-brush-btn');
    var textBtn = document.getElementById('markup-text-btn');
    var lineBtn = document.getElementById('markup-line-btn');
    var arrowBtn = document.getElementById('markup-arrow-btn');
    var rectBtn = document.getElementById('markup-rect-btn');
    var ellipseBtn = document.getElementById('markup-ellipse-btn');
    var fillToolBtn = document.getElementById('markup-fill-btn');
    var allToolBtns = [brushBtn, textBtn, lineBtn, arrowBtn, rectBtn, ellipseBtn, fillToolBtn];

    // Settings panels
    var brushSettings = document.getElementById('markup-brush-settings');
    var fillSettings = document.getElementById('markup-fill-settings');
    var textSettings = document.getElementById('markup-text-settings');
    var shapeSettings = document.getElementById('markup-shape-settings');
    var fillGroup = document.getElementById('markup-fill-group');

    // Fill tool settings
    var fillToolColor = document.getElementById('markup-fill-tool-color');
    var fillToleranceSlider = document.getElementById('markup-fill-tolerance-slider');
    var fillToleranceDisplay = document.getElementById('markup-fill-tolerance-display');

    // Brush settings
    var colorPicker = document.getElementById('markup-color');
    var sizeSlider = document.getElementById('markup-size-slider');
    var sizeDisplay = document.getElementById('markup-size-display');

    // Text settings
    var textColorPicker = document.getElementById('markup-text-color');
    var fontSizeSlider = document.getElementById('markup-font-size-slider');
    var fontSizeDisplay = document.getElementById('markup-font-size-display');
    var fontFamilySelect = document.getElementById('markup-font-family');
    var boldBtn = document.getElementById('markup-bold-btn');
    var italicBtn = document.getElementById('markup-italic-btn');
    var fontPreviewText = document.getElementById('markup-font-preview-text');

    // Shape settings
    var shapeColorPicker = document.getElementById('markup-shape-color');
    var strokeSlider = document.getElementById('markup-stroke-slider');
    var strokeDisplay = document.getElementById('markup-stroke-display');
    var fillCheck = document.getElementById('markup-fill-check');
    var fillColorPicker = document.getElementById('markup-fill-color');

    // Layers panel
    var layersPanel = document.getElementById('markup-layers-panel');

    // History buttons
    var undoBtn = document.getElementById('markup-undo-btn');
    var redoBtn = document.getElementById('markup-redo-btn');
    var clearBtn = document.getElementById('markup-clear-btn');

    // Save buttons
    var saveNewBtn = document.getElementById('markup-save-new-btn');
    var overwriteBtn = document.getElementById('markup-overwrite-btn');
    var downloadBtn = document.getElementById('markup-download-btn');

    // State
    var originalImage = null;
    var pendingResource = null;
    var activeTool = 'brush';
    var textBold = false;
    var textItalic = false;

    // Brush offscreen canvas for the current in-progress stroke
    var brushCanvas = null;
    var brushCtx = null;
    // Temporary canvas for the active brush stroke being drawn
    var activeBrushCanvas = null;
    var activeBrushCtx = null;

    // Layers array
    var layers = [];
    var selectedLayerIndex = -1;

    // Drawing state
    var isDrawing = false;
    var lastX = 0, lastY = 0;
    var dragStart = null; // { x, y } for shape drawing
    var isDragging = false; // dragging a selected layer
    var dragOffset = { x: 0, y: 0 };

    // Undo/redo
    var undoStack = [];
    var redoStack = [];
    var MAX_UNDO = 50;

    // ── Panel activation ──
    var observer = new MutationObserver(async function () {
        if (toolPanel.classList.contains('active') && state.pendingToolResource) {
            var pending = state.pendingToolResource;
            state.pendingToolResource = null;
            pendingResource = pending;
            try {
                var resp = await fetch(pending.resource_url);
                var blob = await resp.blob();
                var img = new Image();
                img.onload = function () {
                    initCanvas(img);
                };
                img.src = URL.createObjectURL(blob);
            } catch (e) {
                alert('Failed to load image: ' + e.message);
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    function initCanvas(img) {
        originalImage = img;
        canvas.width = img.width;
        canvas.height = img.height;

        // Legacy brush buffer kept for undo/redo snapshot compat — always blank now
        brushCanvas = document.createElement('canvas');
        brushCanvas.width = img.width;
        brushCanvas.height = img.height;
        brushCtx = brushCanvas.getContext('2d');

        // Active stroke canvas (drawn into while mouse is down)
        activeBrushCanvas = document.createElement('canvas');
        activeBrushCanvas.width = img.width;
        activeBrushCanvas.height = img.height;
        activeBrushCtx = activeBrushCanvas.getContext('2d');

        layers = [];
        selectedLayerIndex = -1;
        undoStack = [];
        redoStack = [];

        render();
        pushUndo();
        emptyState.hidden = true;
        canvasWrap.hidden = false;
        updateHistoryButtons();
        renderLayersPanel();
        if (useAsRefBtn) useAsRefBtn.hidden = false;
    }

    // ── Tool switching ──
    function setTool(tool) {
        activeTool = tool;
        allToolBtns.forEach(function (btn) { btn.classList.remove('active'); });

        brushSettings.hidden = true;
        fillSettings.hidden = true;
        textSettings.hidden = true;
        shapeSettings.hidden = true;

        if (tool === 'brush') {
            brushBtn.classList.add('active');
            brushSettings.hidden = false;
            canvas.style.cursor = 'crosshair';
        } else if (tool === 'fill') {
            fillToolBtn.classList.add('active');
            fillSettings.hidden = false;
            canvas.style.cursor = 'crosshair';
        } else if (tool === 'text') {
            textBtn.classList.add('active');
            textSettings.hidden = false;
            canvas.style.cursor = 'text';
        } else {
            var btnMap = { line: lineBtn, arrow: arrowBtn, rect: rectBtn, ellipse: ellipseBtn };
            if (btnMap[tool]) btnMap[tool].classList.add('active');
            shapeSettings.hidden = false;
            // Show fill group only for rect/ellipse
            fillGroup.hidden = (tool === 'line' || tool === 'arrow');
            canvas.style.cursor = 'crosshair';
        }
    }

    brushBtn.addEventListener('click', function () { setTool('brush'); });
    textBtn.addEventListener('click', function () { setTool('text'); });
    lineBtn.addEventListener('click', function () { setTool('line'); });
    arrowBtn.addEventListener('click', function () { setTool('arrow'); });
    rectBtn.addEventListener('click', function () { setTool('rect'); });
    ellipseBtn.addEventListener('click', function () { setTool('ellipse'); });
    fillToolBtn.addEventListener('click', function () { setTool('fill'); });

    // ── Slider displays ──
    sizeSlider.addEventListener('input', function () {
        sizeDisplay.textContent = sizeSlider.value;
    });

    strokeSlider.addEventListener('input', function () {
        strokeDisplay.textContent = strokeSlider.value;
    });

    fontSizeSlider.addEventListener('input', function () {
        var size = fontSizeSlider.value;
        fontSizeDisplay.textContent = size;
        updateFontPreview();
    });

    fillToleranceSlider.addEventListener('input', function () {
        fillToleranceDisplay.textContent = fillToleranceSlider.value;
    });

    fontFamilySelect.addEventListener('change', updateFontPreview);

    boldBtn.addEventListener('click', function () {
        textBold = !textBold;
        boldBtn.classList.toggle('active', textBold);
        updateFontPreview();
    });

    italicBtn.addEventListener('click', function () {
        textItalic = !textItalic;
        italicBtn.classList.toggle('active', textItalic);
        updateFontPreview();
    });

    function updateFontPreview() {
        var size = parseInt(fontSizeSlider.value);
        var family = fontFamilySelect.value;
        var weight = textBold ? 'bold' : 'normal';
        var style = textItalic ? 'italic' : 'normal';
        fontPreviewText.style.fontSize = Math.min(size, 48) + 'px';
        fontPreviewText.style.fontFamily = family;
        fontPreviewText.style.fontWeight = weight;
        fontPreviewText.style.fontStyle = style;
        fontPreviewText.textContent = 'Abc';
    }

    // ── Canvas coordinate helper ──
    function getCanvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    // ── Rendering pipeline ──
    function render() {
        if (!originalImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Original image
        ctx.drawImage(originalImage, 0, 0);

        // 2. Layers (including brush stroke layers)
        layers.forEach(function (layer, i) {
            drawLayer(ctx, layer);
            if (i === selectedLayerIndex) {
                drawSelectionHandles(ctx, layer);
            }
        });

        // 3. Active brush stroke in progress
        if (activeBrushCanvas && isDrawing) {
            ctx.drawImage(activeBrushCanvas, 0, 0);
        }
    }

    function drawLayer(c, layer) {
        c.save();
        if (layer.type === 'brush') {
            // Brush stroke stored as ImageData
            if (layer.imageData) {
                var tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = layer.imageData.width;
                tmpCanvas.height = layer.imageData.height;
                tmpCanvas.getContext('2d').putImageData(layer.imageData, 0, 0);
                c.drawImage(tmpCanvas, 0, 0);
            }
            c.restore();
            return;
        } else if (layer.type === 'text') {
            var weight = layer.bold ? 'bold' : 'normal';
            var style = layer.italic ? 'italic' : 'normal';
            c.font = style + ' ' + weight + ' ' + layer.fontSize + 'px ' + layer.fontFamily;
            c.fillStyle = layer.color;
            c.textBaseline = 'top';
            c.fillText(layer.text, layer.x, layer.y);
        } else if (layer.type === 'line') {
            c.beginPath();
            c.moveTo(layer.x1, layer.y1);
            c.lineTo(layer.x2, layer.y2);
            c.strokeStyle = layer.color;
            c.lineWidth = layer.lineWidth;
            c.lineCap = 'round';
            c.stroke();
        } else if (layer.type === 'arrow') {
            drawArrow(c, layer.x1, layer.y1, layer.x2, layer.y2, layer.color, layer.lineWidth);
        } else if (layer.type === 'rect') {
            if (layer.fill) {
                c.fillStyle = layer.fillColor;
                c.fillRect(layer.x, layer.y, layer.w, layer.h);
            }
            c.strokeStyle = layer.color;
            c.lineWidth = layer.lineWidth;
            c.strokeRect(layer.x, layer.y, layer.w, layer.h);
        } else if (layer.type === 'ellipse') {
            var cx = layer.cx, cy = layer.cy, rx = layer.rx, ry = layer.ry;
            c.beginPath();
            c.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
            if (layer.fill) {
                c.fillStyle = layer.fillColor;
                c.fill();
            }
            c.strokeStyle = layer.color;
            c.lineWidth = layer.lineWidth;
            c.stroke();
        }
        c.restore();
    }

    function drawArrow(c, x1, y1, x2, y2, color, lineWidth) {
        var headLen = Math.max(lineWidth * 4, 12);
        var angle = Math.atan2(y2 - y1, x2 - x1);

        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.strokeStyle = color;
        c.lineWidth = lineWidth;
        c.lineCap = 'round';
        c.stroke();

        // Arrowhead
        c.beginPath();
        c.moveTo(x2, y2);
        c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        c.closePath();
        c.fillStyle = color;
        c.fill();
    }

    function drawSelectionHandles(c, layer) {
        var bounds = getLayerBounds(layer);
        if (!bounds) return;

        c.save();
        c.strokeStyle = '#00bfff';
        c.lineWidth = 2;
        c.setLineDash([4, 4]);
        c.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        c.setLineDash([]);
        c.restore();
    }

    function getLayerBounds(layer) {
        if (layer.type === 'brush') {
            // Full canvas bounds — brush strokes can't easily be bounded
            return null;
        } else if (layer.type === 'text') {
            var weight = layer.bold ? 'bold' : 'normal';
            var style = layer.italic ? 'italic' : 'normal';
            ctx.save();
            ctx.font = style + ' ' + weight + ' ' + layer.fontSize + 'px ' + layer.fontFamily;
            var metrics = ctx.measureText(layer.text);
            ctx.restore();
            return { x: layer.x, y: layer.y, w: metrics.width, h: layer.fontSize * 1.2 };
        } else if (layer.type === 'line' || layer.type === 'arrow') {
            var minX = Math.min(layer.x1, layer.x2);
            var minY = Math.min(layer.y1, layer.y2);
            var maxX = Math.max(layer.x1, layer.x2);
            var maxY = Math.max(layer.y1, layer.y2);
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        } else if (layer.type === 'rect') {
            return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
        } else if (layer.type === 'ellipse') {
            return { x: layer.cx - Math.abs(layer.rx), y: layer.cy - Math.abs(layer.ry), w: Math.abs(layer.rx) * 2, h: Math.abs(layer.ry) * 2 };
        }
        return null;
    }

    // ── Hit testing ──
    function hitTestLayers(px, py) {
        for (var i = layers.length - 1; i >= 0; i--) {
            var bounds = getLayerBounds(layers[i]);
            if (!bounds) continue;
            var pad = 6;
            if (px >= bounds.x - pad && px <= bounds.x + bounds.w + pad &&
                py >= bounds.y - pad && py <= bounds.y + bounds.h + pad) {
                return i;
            }
        }
        return -1;
    }

    // ── Canvas mouse events ──
    canvas.addEventListener('mousedown', function (e) {
        if (!originalImage) return;
        var pos = getCanvasPos(e);

        if (activeTool === 'fill') {
            floodFillAt(pos.x, pos.y);
            return;
        }

        if (activeTool === 'brush') {
            isDrawing = true;
            lastX = pos.x;
            lastY = pos.y;
            // Clear active brush canvas for new stroke
            activeBrushCtx.clearRect(0, 0, activeBrushCanvas.width, activeBrushCanvas.height);
            activeBrushCtx.beginPath();
            activeBrushCtx.arc(lastX, lastY, parseInt(sizeSlider.value) / 2, 0, Math.PI * 2);
            activeBrushCtx.fillStyle = colorPicker.value;
            activeBrushCtx.fill();
            render();
        } else if (activeTool === 'text') {
            // Check if clicking on existing text layer
            var hitIdx = hitTestLayers(pos.x, pos.y);
            if (hitIdx >= 0 && layers[hitIdx].type === 'text') {
                selectedLayerIndex = hitIdx;
                isDragging = true;
                var lb = getLayerBounds(layers[hitIdx]);
                dragOffset = { x: pos.x - layers[hitIdx].x, y: pos.y - layers[hitIdx].y };
                render();
                renderLayersPanel();
            } else {
                // Place new text
                var text = prompt('Enter text:');
                if (!text || !text.trim()) return;
                layers.push({
                    type: 'text',
                    text: text.trim(),
                    x: pos.x,
                    y: pos.y,
                    fontSize: parseInt(fontSizeSlider.value),
                    fontFamily: fontFamilySelect.value,
                    bold: textBold,
                    italic: textItalic,
                    color: textColorPicker.value,
                });
                selectedLayerIndex = layers.length - 1;
                render();
                renderLayersPanel();
                pushUndo();
            }
        } else {
            // Shape tools: check hit first for dragging
            var hitIdx = hitTestLayers(pos.x, pos.y);
            if (hitIdx >= 0) {
                selectedLayerIndex = hitIdx;
                isDragging = true;
                var layer = layers[hitIdx];
                if (layer.type === 'rect') {
                    dragOffset = { x: pos.x - layer.x, y: pos.y - layer.y };
                } else if (layer.type === 'ellipse') {
                    dragOffset = { x: pos.x - layer.cx, y: pos.y - layer.cy };
                } else {
                    dragOffset = { x: pos.x - layer.x1, y: pos.y - layer.y1 };
                }
                render();
                renderLayersPanel();
            } else {
                // Start drawing new shape
                dragStart = { x: pos.x, y: pos.y };
                selectedLayerIndex = -1;
                render();
                renderLayersPanel();
            }
        }
    });

    canvas.addEventListener('mousemove', function (e) {
        if (!originalImage) return;
        var pos = getCanvasPos(e);

        if (activeTool === 'brush' && isDrawing) {
            activeBrushCtx.beginPath();
            activeBrushCtx.moveTo(lastX, lastY);
            activeBrushCtx.lineTo(pos.x, pos.y);
            activeBrushCtx.strokeStyle = colorPicker.value;
            activeBrushCtx.lineWidth = parseInt(sizeSlider.value);
            activeBrushCtx.lineCap = 'round';
            activeBrushCtx.lineJoin = 'round';
            activeBrushCtx.stroke();
            lastX = pos.x;
            lastY = pos.y;
            render();
        } else if (isDragging && selectedLayerIndex >= 0) {
            var layer = layers[selectedLayerIndex];
            if (layer.type === 'text') {
                layer.x = pos.x - dragOffset.x;
                layer.y = pos.y - dragOffset.y;
            } else if (layer.type === 'rect') {
                layer.x = pos.x - dragOffset.x;
                layer.y = pos.y - dragOffset.y;
            } else if (layer.type === 'ellipse') {
                layer.cx = pos.x - dragOffset.x;
                layer.cy = pos.y - dragOffset.y;
            } else if (layer.type === 'line' || layer.type === 'arrow') {
                var dx = pos.x - dragOffset.x - layer.x1;
                var dy = pos.y - dragOffset.y - layer.y1;
                layer.x1 += dx;
                layer.y1 += dy;
                layer.x2 += dx;
                layer.y2 += dy;
                dragOffset = { x: pos.x - layer.x1, y: pos.y - layer.y1 };
            }
            render();
        } else if (dragStart && activeTool !== 'brush' && activeTool !== 'text') {
            // Preview shape being drawn
            render();
            var preview = buildShapeLayer(dragStart.x, dragStart.y, pos.x, pos.y);
            if (preview) drawLayer(ctx, preview);
        }
    });

    window.addEventListener('mouseup', function () {
        if (isDrawing) {
            isDrawing = false;
            // Save brush stroke as a layer
            if (activeBrushCtx) {
                var strokeData = activeBrushCtx.getImageData(0, 0, activeBrushCanvas.width, activeBrushCanvas.height);
                layers.push({ type: 'brush', imageData: strokeData });
                selectedLayerIndex = layers.length - 1;
                activeBrushCtx.clearRect(0, 0, activeBrushCanvas.width, activeBrushCanvas.height);
                render();
                renderLayersPanel();
            }
            pushUndo();
        }
        if (isDragging) {
            isDragging = false;
            pushUndo();
        }
        if (dragStart) {
            var endPos = lastMousePos || dragStart;
            dragStart = null;
        }
    });

    // Track mouse for shape creation on mouseup
    var lastMousePos = null;
    canvas.addEventListener('mousemove', function (e) {
        lastMousePos = getCanvasPos(e);
    });

    canvas.addEventListener('mouseup', function (e) {
        if (dragStart && activeTool !== 'brush' && activeTool !== 'text') {
            var pos = getCanvasPos(e);
            var dx = Math.abs(pos.x - dragStart.x);
            var dy = Math.abs(pos.y - dragStart.y);
            if (dx > 3 || dy > 3) {
                var layer = buildShapeLayer(dragStart.x, dragStart.y, pos.x, pos.y);
                if (layer) {
                    layers.push(layer);
                    selectedLayerIndex = layers.length - 1;
                    render();
                    renderLayersPanel();
                    pushUndo();
                }
            }
            dragStart = null;
        }
    });

    // ── Flood fill tool ──
    function floodFillAt(px, py) {
        if (!originalImage) return;
        var x = Math.floor(px);
        var y = Math.floor(py);
        var w = canvas.width;
        var h = canvas.height;
        if (x < 0 || x >= w || y < 0 || y >= h) return;

        // Read the current composite (original + all layers)
        var compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = w;
        compositeCanvas.height = h;
        var compositeCtx = compositeCanvas.getContext('2d');
        compositeCtx.drawImage(originalImage, 0, 0);
        layers.forEach(function (layer) { drawLayer(compositeCtx, layer); });
        var srcData = compositeCtx.getImageData(0, 0, w, h).data;

        // Target pixel color
        var startIdx = (y * w + x) * 4;
        var startR = srcData[startIdx];
        var startG = srcData[startIdx + 1];
        var startB = srcData[startIdx + 2];
        var startA = srcData[startIdx + 3];

        // Fill color
        var hex = fillToolColor.value;
        var fR = parseInt(hex.substr(1, 2), 16);
        var fG = parseInt(hex.substr(3, 2), 16);
        var fB = parseInt(hex.substr(5, 2), 16);

        // Don't fill if already the same color
        if (startR === fR && startG === fG && startB === fB && startA === 255) return;

        var tol = parseInt(fillToleranceSlider.value);

        // Create fill result as ImageData
        var fillCanvas = document.createElement('canvas');
        fillCanvas.width = w;
        fillCanvas.height = h;
        var fillCtx = fillCanvas.getContext('2d');
        var fillImgData = fillCtx.getImageData(0, 0, w, h);
        var fillData = fillImgData.data;

        var visited = new Uint8Array(w * h);
        var stack = [x + y * w];
        visited[x + y * w] = 1;

        while (stack.length > 0) {
            var pos = stack.pop();
            var cx = pos % w;
            var cy = (pos - cx) / w;
            var idx = pos * 4;

            var dr = srcData[idx] - startR;
            var dg = srcData[idx + 1] - startG;
            var db = srcData[idx + 2] - startB;
            var da = srcData[idx + 3] - startA;
            if (Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tol) {
                fillData[idx] = fR;
                fillData[idx + 1] = fG;
                fillData[idx + 2] = fB;
                fillData[idx + 3] = 255;

                if (cx > 0 && !visited[pos - 1]) { visited[pos - 1] = 1; stack.push(pos - 1); }
                if (cx < w - 1 && !visited[pos + 1]) { visited[pos + 1] = 1; stack.push(pos + 1); }
                if (cy > 0 && !visited[pos - w]) { visited[pos - w] = 1; stack.push(pos - w); }
                if (cy < h - 1 && !visited[pos + w]) { visited[pos + w] = 1; stack.push(pos + w); }
            }
        }

        fillCtx.putImageData(fillImgData, 0, 0);
        var strokeData = fillCtx.getImageData(0, 0, w, h);
        layers.push({ type: 'brush', imageData: strokeData });
        selectedLayerIndex = layers.length - 1;
        render();
        renderLayersPanel();
        pushUndo();
    }

    function buildShapeLayer(x1, y1, x2, y2) {
        var color = shapeColorPicker.value;
        var lineWidth = parseInt(strokeSlider.value);
        var fill = fillCheck.checked;
        var fillColor = fillColorPicker.value;

        if (activeTool === 'line') {
            return { type: 'line', x1: x1, y1: y1, x2: x2, y2: y2, color: color, lineWidth: lineWidth };
        } else if (activeTool === 'arrow') {
            return { type: 'arrow', x1: x1, y1: y1, x2: x2, y2: y2, color: color, lineWidth: lineWidth };
        } else if (activeTool === 'rect') {
            var rx = Math.min(x1, x2), ry = Math.min(y1, y2);
            var rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
            return { type: 'rect', x: rx, y: ry, w: rw, h: rh, color: color, lineWidth: lineWidth, fill: fill, fillColor: fillColor };
        } else if (activeTool === 'ellipse') {
            var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
            var erx = Math.abs(x2 - x1) / 2, ery = Math.abs(y2 - y1) / 2;
            return { type: 'ellipse', cx: cx, cy: cy, rx: erx, ry: ery, color: color, lineWidth: lineWidth, fill: fill, fillColor: fillColor };
        }
        return null;
    }

    // ── Delete key removes selected layer ──
    document.addEventListener('keydown', function (e) {
        if (!toolPanel.classList.contains('active')) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Don't intercept if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (selectedLayerIndex >= 0) {
                e.preventDefault();
                layers.splice(selectedLayerIndex, 1);
                selectedLayerIndex = -1;
                render();
                renderLayersPanel();
                pushUndo();
            }
        }
    });

    // ── Layers panel rendering ──
    function renderLayersPanel() {
        layersPanel.innerHTML = '';
        if (layers.length === 0) {
            layersPanel.innerHTML = '<div class="hint" style="padding:8px;text-align:center;font-size:12px;">No layers yet</div>';
            return;
        }

        layers.forEach(function (layer, i) {
            var item = document.createElement('div');
            item.className = 'markup-layer-item' + (i === selectedLayerIndex ? ' selected' : '');

            var label = document.createElement('span');
            label.className = 'markup-layer-label';
            if (layer.type === 'brush') {
                label.textContent = 'Brush Stroke';
            } else if (layer.type === 'text') {
                label.textContent = 'T: ' + (layer.text.length > 15 ? layer.text.substring(0, 15) + '...' : layer.text);
            } else {
                var typeNames = { line: 'Line', arrow: 'Arrow', rect: 'Rectangle', ellipse: 'Ellipse' };
                label.textContent = typeNames[layer.type] || layer.type;
            }

            item.addEventListener('click', function () {
                selectedLayerIndex = i;
                render();
                renderLayersPanel();
            });

            var actions = document.createElement('div');
            actions.className = 'markup-layer-actions';

            if (i > 0) {
                var upBtn = document.createElement('button');
                upBtn.className = 'markup-layer-btn';
                upBtn.textContent = '\u25B2';
                upBtn.title = 'Move up';
                upBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var tmp = layers[i];
                    layers[i] = layers[i - 1];
                    layers[i - 1] = tmp;
                    if (selectedLayerIndex === i) selectedLayerIndex = i - 1;
                    else if (selectedLayerIndex === i - 1) selectedLayerIndex = i;
                    render();
                    renderLayersPanel();
                    pushUndo();
                });
                actions.appendChild(upBtn);
            }

            if (i < layers.length - 1) {
                var downBtn = document.createElement('button');
                downBtn.className = 'markup-layer-btn';
                downBtn.textContent = '\u25BC';
                downBtn.title = 'Move down';
                downBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var tmp = layers[i];
                    layers[i] = layers[i + 1];
                    layers[i + 1] = tmp;
                    if (selectedLayerIndex === i) selectedLayerIndex = i + 1;
                    else if (selectedLayerIndex === i + 1) selectedLayerIndex = i;
                    render();
                    renderLayersPanel();
                    pushUndo();
                });
                actions.appendChild(downBtn);
            }

            var delBtn = document.createElement('button');
            delBtn.className = 'markup-layer-btn markup-layer-btn-del';
            delBtn.textContent = '\u2715';
            delBtn.title = 'Delete';
            delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                layers.splice(i, 1);
                if (selectedLayerIndex === i) selectedLayerIndex = -1;
                else if (selectedLayerIndex > i) selectedLayerIndex--;
                render();
                renderLayersPanel();
                pushUndo();
            });
            actions.appendChild(delBtn);

            item.appendChild(label);
            item.appendChild(actions);
            layersPanel.appendChild(item);
        });
    }

    // ── Undo / Redo ──
    function deepCopyLayers(arr) {
        // Deep copy layers; brush layers have imageData which can't be JSON-cloned
        return arr.map(function (layer) {
            if (layer.type === 'brush') {
                // Clone ImageData
                var id = layer.imageData;
                var newData = new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
                return { type: 'brush', imageData: newData };
            }
            return JSON.parse(JSON.stringify(layer));
        });
    }

    function pushUndo() {
        undoStack.push({
            layers: deepCopyLayers(layers),
        });
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
        updateHistoryButtons();
    }

    function restoreSnapshot(snapshot) {
        layers = deepCopyLayers(snapshot.layers);
        selectedLayerIndex = -1;
        render();
        renderLayersPanel();
    }

    function updateHistoryButtons() {
        undoBtn.disabled = undoStack.length <= 1;
        redoBtn.disabled = redoStack.length === 0;
    }

    undoBtn.addEventListener('click', function () {
        if (undoStack.length <= 1) return;
        var current = undoStack.pop();
        redoStack.push(current);
        restoreSnapshot(undoStack[undoStack.length - 1]);
        updateHistoryButtons();
    });

    redoBtn.addEventListener('click', function () {
        if (redoStack.length === 0) return;
        var next = redoStack.pop();
        undoStack.push(next);
        restoreSnapshot(next);
        updateHistoryButtons();
    });

    clearBtn.addEventListener('click', function () {
        if (!originalImage) return;
        layers = [];
        selectedLayerIndex = -1;
        render();
        renderLayersPanel();
        pushUndo();
    });

    // ── Flatten canvas to blob (for saving) ──
    function flattenToBlob() {
        // Render without selection handles
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = canvas.width;
        tmpCanvas.height = canvas.height;
        var tmpCtx = tmpCanvas.getContext('2d');

        tmpCtx.drawImage(originalImage, 0, 0);
        layers.forEach(function (layer) {
            drawLayer(tmpCtx, layer);
        });

        return new Promise(function (resolve) {
            tmpCanvas.toBlob(resolve, 'image/png');
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
    downloadBtn.addEventListener('click', async function () {
        if (!originalImage) return;
        var blob = await flattenToBlob();
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.download = (pendingResource ? pendingResource.filename.replace(/\.[^.]+$/, '') : 'markup') + '_markup.png';
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // ── Use as Reference (return to AI Generate) ──
    var useAsRefBtn = document.getElementById('markup-use-as-ref-btn');
    if (useAsRefBtn) {
        useAsRefBtn.addEventListener('click', async function () {
            if (!originalImage) return;
            var blob = await flattenToBlob();
            if (typeof window.markupReturnToAiGenerate === 'function') {
                window.markupReturnToAiGenerate(blob);
                window.markupReturnToAiGenerate = null;
                useAsRefBtn.hidden = true;
            } else {
                // No callback — navigate to AI Generate with the blob
                window.pendingReferenceBlob = blob;
                navigate('#/asset/' + (state.currentAssetId || '') + '/tool/ai-generate');
            }
        });
    }

    // Set initial cursor
    canvas.style.cursor = 'crosshair';

    // Expose for external use (AI Generate markup editing)
    window.markupTool = {
        loadImageFromUrl: async function (imageUrl, resourceInfo) {
            pendingResource = resourceInfo || null;
            // Show "Use as Reference" button if we came from AI Generate
            if (useAsRefBtn && typeof window.markupReturnToAiGenerate === 'function') {
                useAsRefBtn.hidden = false;
            }
            try {
                var resp = await fetch(imageUrl);
                var blob = await resp.blob();
                var img = new Image();
                img.onload = function () {
                    initCanvas(img);
                };
                img.src = URL.createObjectURL(blob);
            } catch (e) {
                alert('Failed to load image: ' + e.message);
            }
        },
        getImageBlob: flattenToBlob,
    };
})();
