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
    var eyedropperBtn = document.getElementById('markup-eyedropper-btn');
    var selectBtn = document.getElementById('markup-select-btn');
    var inpaintBtn = document.getElementById('markup-inpaint-btn');
    var allToolBtns = [brushBtn, textBtn, lineBtn, arrowBtn, rectBtn, ellipseBtn, fillToolBtn, eyedropperBtn, selectBtn, inpaintBtn];

    // Settings panels
    var brushSettings = document.getElementById('markup-brush-settings');
    var fillSettings = document.getElementById('markup-fill-settings');
    var textSettings = document.getElementById('markup-text-settings');
    var shapeSettings = document.getElementById('markup-shape-settings');
    var fillGroup = document.getElementById('markup-fill-group');
    var inpaintSettings = document.getElementById('markup-inpaint-settings');
    var selectSettings = document.getElementById('markup-select-settings');
    var selectAllBtn = document.getElementById('markup-select-all-btn');
    var selectActions = document.getElementById('markup-select-actions');
    var selectMoveBtn = document.getElementById('markup-select-move-btn');
    var selectDeleteBtn = document.getElementById('markup-select-delete-btn');
    var selectCancelBtn = document.getElementById('markup-select-cancel-btn');

    // Inpaint controls
    var inpaintSizeSlider = document.getElementById('markup-inpaint-size-slider');
    var inpaintSizeDisplay = document.getElementById('markup-inpaint-size-display');
    var inpaintPrompt = document.getElementById('markup-inpaint-prompt');
    var inpaintApplyBtn = document.getElementById('markup-inpaint-apply-btn');
    var inpaintRemoveBtn = document.getElementById('markup-inpaint-remove-btn');
    var inpaintClearMaskBtn = document.getElementById('markup-inpaint-clear-mask-btn');
    var inpaintStatus = document.getElementById('markup-inpaint-status');

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

    // Eyedropper state
    var previousTool = 'brush'; // tool to return to after eyedropper pick

    // Layers array
    var layers = [];
    var selectedLayerIndex = -1;

    // Drawing state
    var isDrawing = false;
    var lastX = 0, lastY = 0;
    var dragStart = null; // { x, y } for shape drawing
    var isDragging = false; // dragging a selected layer
    var dragOffset = { x: 0, y: 0 };
    var selectState = null; // { startX, startY } while drawing a selection rectangle
    var pendingSelect = null; // { x, y, w, h } — confirmed selection area awaiting action
    var resizeHandle = null; // which handle is being dragged: 'nw','n','ne','e','se','s','sw','w'
    var resizeStart = null; // { x, y, bounds: {x,y,w,h} } snapshot at drag start
    var inpaintMaskCanvas = null; // offscreen mask canvas (white = edit, black = preserve)
    var inpaintMaskCtx = null;

    // Undo/redo
    var undoStack = [];
    var redoStack = [];
    var MAX_UNDO = 50;

    // ── Panel activation ──
    var observer = new MutationObserver(async function () {
        if (!toolPanel.classList.contains('active')) return;

        // Consume a pending blob (from AI Animate markup button)
        if (window.pendingMarkupBlob) {
            var blob = window.pendingMarkupBlob;
            window.pendingMarkupBlob = null;
            pendingResource = null;
            var img = new Image();
            img.onload = function () {
                initCanvas(img);
            };
            img.src = URL.createObjectURL(blob);
            return;
        }

        if (state.pendingToolResource) {
            var pending = state.pendingToolResource;
            state.pendingToolResource = null;
            pendingResource = pending;
            try {
                var resp = await fetch(pending.resource_url);
                var blob2 = await resp.blob();
                var img2 = new Image();
                img2.onload = function () {
                    initCanvas(img2);
                };
                img2.src = URL.createObjectURL(blob2);
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
        if (tool !== 'eyedropper') previousTool = activeTool || 'brush';
        activeTool = tool;
        allToolBtns.forEach(function (btn) { btn.classList.remove('active'); });

        brushSettings.hidden = true;
        fillSettings.hidden = true;
        textSettings.hidden = true;
        shapeSettings.hidden = true;
        inpaintSettings.hidden = true;
        selectSettings.hidden = true;
        pendingSelect = null;
        selectActions.hidden = true;

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
        } else if (tool === 'eyedropper') {
            eyedropperBtn.classList.add('active');
            canvas.style.cursor = 'crosshair';
        } else if (tool === 'select') {
            selectBtn.classList.add('active');
            selectSettings.hidden = false;
            canvas.style.cursor = 'crosshair';
            selectState = null;
        } else if (tool === 'inpaint') {
            inpaintBtn.classList.add('active');
            inpaintSettings.hidden = false;
            canvas.style.cursor = 'crosshair';
            // Initialize mask canvas if needed
            if (!inpaintMaskCanvas || inpaintMaskCanvas.width !== canvas.width || inpaintMaskCanvas.height !== canvas.height) {
                inpaintMaskCanvas = document.createElement('canvas');
                inpaintMaskCanvas.width = canvas.width;
                inpaintMaskCanvas.height = canvas.height;
                inpaintMaskCtx = inpaintMaskCanvas.getContext('2d');
                inpaintMaskCtx.clearRect(0, 0, canvas.width, canvas.height);
            }
            render();
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
    eyedropperBtn.addEventListener('click', function () { setTool('eyedropper'); });
    selectBtn.addEventListener('click', function () { setTool('select'); });
    selectAllBtn.addEventListener('click', function () {
        if (!originalImage) return;
        setTool('select');
        setPendingSelect(0, 0, canvas.width, canvas.height);
    });
    selectMoveBtn.addEventListener('click', function () {
        if (!pendingSelect || !originalImage) return;
        var p = pendingSelect;
        clearPendingSelect();
        performSelection(p.x, p.y, p.w, p.h);
    });
    selectDeleteBtn.addEventListener('click', function () {
        if (!pendingSelect || !originalImage) return;
        var p = pendingSelect;
        clearPendingSelect();
        deleteSelection(p.x, p.y, p.w, p.h);
    });
    selectCancelBtn.addEventListener('click', function () {
        clearPendingSelect();
    });
    inpaintBtn.addEventListener('click', function () { setTool('inpaint'); });

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

    inpaintSizeSlider.addEventListener('input', function () {
        inpaintSizeDisplay.textContent = inpaintSizeSlider.value;
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
        if (activeBrushCanvas && isDrawing && activeTool === 'brush') {
            ctx.drawImage(activeBrushCanvas, 0, 0);
        }

        // 4. Inpaint mask overlay (semi-transparent red)
        if (activeTool === 'inpaint' && inpaintMaskCanvas) {
            var maskOverlay = document.createElement('canvas');
            maskOverlay.width = canvas.width;
            maskOverlay.height = canvas.height;
            var moCtx = maskOverlay.getContext('2d');
            moCtx.drawImage(inpaintMaskCanvas, 0, 0);
            moCtx.globalCompositeOperation = 'source-in';
            moCtx.fillStyle = 'rgba(255, 0, 0, 0.4)';
            moCtx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(maskOverlay, 0, 0);
        }

        // 5. Pending selection rectangle with handles
        if (pendingSelect) {
            var ps = pendingSelect;
            ctx.save();
            // Dim area outside selection
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, canvas.width, ps.y); // top
            ctx.fillRect(0, ps.y, ps.x, ps.h); // left
            ctx.fillRect(ps.x + ps.w, ps.y, canvas.width - ps.x - ps.w, ps.h); // right
            ctx.fillRect(0, ps.y + ps.h, canvas.width, canvas.height - ps.y - ps.h); // bottom
            // Dashed border
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(ps.x, ps.y, ps.w, ps.h);
            ctx.setLineDash([]);
            // Resize handles
            var hs = HANDLE_SIZE;
            var hh = hs / 2;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 1.5;
            var handles = getResizeHandlePositions(ps);
            for (var key in handles) {
                var h = handles[key];
                ctx.fillRect(h.x - hh, h.y - hh, hs, hs);
                ctx.strokeRect(h.x - hh, h.y - hh, hs, hs);
            }
            ctx.restore();
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
        } else if (layer.type === 'select') {
            if (layer.imageData) {
                var tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = layer.imageData.width;
                tmpCanvas.height = layer.imageData.height;
                tmpCanvas.getContext('2d').putImageData(layer.imageData, 0, 0);
                c.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height,
                    layer.x, layer.y, layer.w, layer.h);
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

    var HANDLE_SIZE = 8;
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

    function getResizeHandlePositions(bounds) {
        var mx = bounds.x + bounds.w / 2;
        var my = bounds.y + bounds.h / 2;
        return {
            nw: { x: bounds.x, y: bounds.y },
            n:  { x: mx, y: bounds.y },
            ne: { x: bounds.x + bounds.w, y: bounds.y },
            e:  { x: bounds.x + bounds.w, y: my },
            se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
            s:  { x: mx, y: bounds.y + bounds.h },
            sw: { x: bounds.x, y: bounds.y + bounds.h },
            w:  { x: bounds.x, y: my },
        };
    }

    function hitTestResizeHandles(px, py) {
        if (!pendingSelect) return null;
        var handles = getResizeHandlePositions(pendingSelect);
        var threshold = HANDLE_SIZE;
        for (var key in handles) {
            var h = handles[key];
            if (Math.abs(px - h.x) <= threshold && Math.abs(py - h.y) <= threshold) {
                return key;
            }
        }
        return null;
    }

    function getLayerBounds(layer) {
        if (layer.type === 'brush') {
            // Full canvas bounds — brush strokes can't easily be bounded
            return null;
        } else if (layer.type === 'select') {
            return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
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

    // ── Pending selection helpers ──
    function setPendingSelect(x, y, w, h) {
        pendingSelect = { x: x, y: y, w: w, h: h };
        selectActions.hidden = false;
        render();
    }

    function clearPendingSelect() {
        pendingSelect = null;
        selectActions.hidden = true;
        render();
    }

    function deleteSelection(sx, sy, sw, sh) {
        // Punch a hole in the original image and layers without creating a select layer
        var newOrigCanvas = document.createElement('canvas');
        newOrigCanvas.width = originalImage.width || canvas.width;
        newOrigCanvas.height = originalImage.height || canvas.height;
        var newOrigCtx = newOrigCanvas.getContext('2d');
        newOrigCtx.drawImage(originalImage, 0, 0);
        newOrigCtx.clearRect(sx, sy, sw, sh);
        var newImg = new Image();
        newImg.onload = function () {
            originalImage = newImg;
            // Clear from existing layers
            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i];
                if (layer.type === 'brush' || layer.type === 'select') {
                    var id = layer.imageData;
                    var data = id.data;
                    var imgW = id.width;
                    var clearX = layer.type === 'select' ? sx - Math.round(layer.x) : sx;
                    var clearY = layer.type === 'select' ? sy - Math.round(layer.y) : sy;
                    for (var py = 0; py < sh; py++) {
                        for (var px = 0; px < sw; px++) {
                            var lx = clearX + px;
                            var ly = clearY + py;
                            var lw = layer.type === 'select' ? layer.w : imgW;
                            var lh = layer.type === 'select' ? layer.h : id.height;
                            if (lx >= 0 && lx < lw && ly >= 0 && ly < lh) {
                                var idx = (ly * lw + lx) * 4;
                                data[idx + 3] = 0;
                            }
                        }
                    }
                } else if (layer.type !== 'brush') {
                    var bounds = getLayerBounds(layer);
                    if (bounds && bounds.x >= sx && bounds.y >= sy &&
                        bounds.x + bounds.w <= sx + sw && bounds.y + bounds.h <= sy + sh) {
                        layers.splice(i, 1);
                        if (selectedLayerIndex === i) selectedLayerIndex = -1;
                        else if (selectedLayerIndex > i) selectedLayerIndex--;
                    }
                }
            }
            render();
            renderLayersPanel();
            pushUndo();
        };
        newImg.src = newOrigCanvas.toDataURL();
    }

    // ── Perform selection (extract region from composite) ──
    function performSelection(sx, sy, sw, sh) {
        // Clamp to canvas bounds
        if (sx < 0) { sw += sx; sx = 0; }
        if (sy < 0) { sh += sy; sy = 0; }
        if (sx + sw > canvas.width) sw = canvas.width - sx;
        if (sy + sh > canvas.height) sh = canvas.height - sy;
        if (sw <= 0 || sh <= 0) { render(); return; }

        // 1. Flatten entire composite to extract the selected region
        var compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = canvas.width;
        compositeCanvas.height = canvas.height;
        var compositeCtx = compositeCanvas.getContext('2d');
        compositeCtx.drawImage(originalImage, 0, 0);
        layers.forEach(function (layer) { drawLayer(compositeCtx, layer); });
        var selectedPixels = compositeCtx.getImageData(sx, sy, sw, sh);

        // 2. Punch a hole in the original image
        var newOrigCanvas = document.createElement('canvas');
        newOrigCanvas.width = originalImage.width || canvas.width;
        newOrigCanvas.height = originalImage.height || canvas.height;
        var newOrigCtx = newOrigCanvas.getContext('2d');
        newOrigCtx.drawImage(originalImage, 0, 0);
        newOrigCtx.clearRect(sx, sy, sw, sh);
        var newImg = new Image();
        newImg.onload = function () {
            originalImage = newImg;

            // 3. Clear the selected rect from all existing brush/select layers
            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i];
                if (layer.type === 'brush' || layer.type === 'select') {
                    var id = layer.imageData;
                    var data = id.data;
                    var imgW = id.width;
                    var clearX, clearY;
                    if (layer.type === 'select') {
                        clearX = sx - Math.round(layer.x);
                        clearY = sy - Math.round(layer.y);
                    } else {
                        clearX = sx;
                        clearY = sy;
                    }
                    for (var py = 0; py < sh; py++) {
                        for (var px = 0; px < sw; px++) {
                            var lx = clearX + px;
                            var ly = clearY + py;
                            if (lx >= 0 && lx < (layer.type === 'select' ? layer.w : imgW) &&
                                ly >= 0 && ly < (layer.type === 'select' ? layer.h : id.height)) {
                                var idx = ((ly) * imgW + lx) * 4;
                                if (layer.type === 'select') {
                                    idx = (ly * layer.w + lx) * 4;
                                }
                                data[idx + 3] = 0;
                            }
                        }
                    }
                } else if (layer.type !== 'brush') {
                    var bounds = getLayerBounds(layer);
                    if (bounds && bounds.x >= sx && bounds.y >= sy &&
                        bounds.x + bounds.w <= sx + sw && bounds.y + bounds.h <= sy + sh) {
                        layers.splice(i, 1);
                        if (selectedLayerIndex === i) selectedLayerIndex = -1;
                        else if (selectedLayerIndex > i) selectedLayerIndex--;
                    }
                }
            }

            // 4. Create the new select layer
            layers.push({
                type: 'select',
                imageData: selectedPixels,
                x: sx,
                y: sy,
                w: sw,
                h: sh,
            });
            selectedLayerIndex = layers.length - 1;
            render();
            renderLayersPanel();
            pushUndo();
        };
        newImg.src = newOrigCanvas.toDataURL();
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

        if (activeTool === 'inpaint') {
            isDrawing = true;
            lastX = pos.x;
            lastY = pos.y;
            // Paint a dot on the mask canvas
            if (inpaintMaskCtx) {
                inpaintMaskCtx.beginPath();
                inpaintMaskCtx.arc(lastX, lastY, parseInt(inpaintSizeSlider.value) / 2, 0, Math.PI * 2);
                inpaintMaskCtx.fillStyle = '#fff';
                inpaintMaskCtx.fill();
                render();
            }
            return;
        }

        if (activeTool === 'select') {
            // Check if clicking a resize handle on the pending selection
            if (pendingSelect) {
                var handle = hitTestResizeHandles(pos.x, pos.y);
                if (handle) {
                    resizeHandle = handle;
                    resizeStart = { x: pos.x, y: pos.y, bounds: { x: pendingSelect.x, y: pendingSelect.y, w: pendingSelect.w, h: pendingSelect.h } };
                    return;
                }
            }
            // Check if clicking on an existing select layer to drag it
            var hitIdx = hitTestLayers(pos.x, pos.y);
            if (hitIdx >= 0 && layers[hitIdx].type === 'select') {
                selectedLayerIndex = hitIdx;
                isDragging = true;
                dragOffset = { x: pos.x - layers[hitIdx].x, y: pos.y - layers[hitIdx].y };
                render();
                renderLayersPanel();
            } else {
                // Start drawing a new selection rectangle (clears any pending)
                clearPendingSelect();
                selectState = { startX: pos.x, startY: pos.y };
                selectedLayerIndex = -1;
                render();
                renderLayersPanel();
            }
            return;
        }

        if (activeTool === 'eyedropper') {
            // Sample pixel colour from the composite canvas
            var px = Math.round(pos.x);
            var py = Math.round(pos.y);
            if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) {
                var pixel = ctx.getImageData(px, py, 1, 1).data;
                var hex = '#' + ((1 << 24) | (pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16).slice(1);
                colorPicker.value = hex;
                textColorPicker.value = hex;
                shapeColorPicker.value = hex;
                fillToolColor.value = hex;
            }
            setTool(previousTool);
            return;
        }

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

        if (activeTool === 'inpaint' && isDrawing && inpaintMaskCtx) {
            inpaintMaskCtx.beginPath();
            inpaintMaskCtx.moveTo(lastX, lastY);
            inpaintMaskCtx.lineTo(pos.x, pos.y);
            inpaintMaskCtx.strokeStyle = '#fff';
            inpaintMaskCtx.lineWidth = parseInt(inpaintSizeSlider.value);
            inpaintMaskCtx.lineCap = 'round';
            inpaintMaskCtx.lineJoin = 'round';
            inpaintMaskCtx.stroke();
            lastX = pos.x;
            lastY = pos.y;
            render();
            return;
        }

        // Handle resize dragging on pending selection
        if (resizeHandle && resizeStart && pendingSelect) {
            var dx = pos.x - resizeStart.x;
            var dy = pos.y - resizeStart.y;
            var b = resizeStart.bounds;
            var MIN_SIZE = 8;

            if (resizeHandle === 'nw') {
                pendingSelect.x = b.x + dx;
                pendingSelect.y = b.y + dy;
                pendingSelect.w = Math.max(MIN_SIZE, b.w - dx);
                pendingSelect.h = Math.max(MIN_SIZE, b.h - dy);
            } else if (resizeHandle === 'n') {
                pendingSelect.y = b.y + dy;
                pendingSelect.h = Math.max(MIN_SIZE, b.h - dy);
            } else if (resizeHandle === 'ne') {
                pendingSelect.y = b.y + dy;
                pendingSelect.w = Math.max(MIN_SIZE, b.w + dx);
                pendingSelect.h = Math.max(MIN_SIZE, b.h - dy);
            } else if (resizeHandle === 'e') {
                pendingSelect.w = Math.max(MIN_SIZE, b.w + dx);
            } else if (resizeHandle === 'se') {
                pendingSelect.w = Math.max(MIN_SIZE, b.w + dx);
                pendingSelect.h = Math.max(MIN_SIZE, b.h + dy);
            } else if (resizeHandle === 's') {
                pendingSelect.h = Math.max(MIN_SIZE, b.h + dy);
            } else if (resizeHandle === 'sw') {
                pendingSelect.x = b.x + dx;
                pendingSelect.w = Math.max(MIN_SIZE, b.w - dx);
                pendingSelect.h = Math.max(MIN_SIZE, b.h + dy);
            } else if (resizeHandle === 'w') {
                pendingSelect.x = b.x + dx;
                pendingSelect.w = Math.max(MIN_SIZE, b.w - dx);
            }

            render();
            return;
        }

        if (activeTool === 'select' && selectState) {
            // Preview selection rectangle
            render();
            var sx = Math.min(selectState.startX, pos.x);
            var sy = Math.min(selectState.startY, pos.y);
            var sw = Math.abs(pos.x - selectState.startX);
            var sh = Math.abs(pos.y - selectState.startY);
            ctx.save();
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.setLineDash([]);
            ctx.restore();
            return;
        }

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
            } else if (layer.type === 'select') {
                layer.x = pos.x - dragOffset.x;
                layer.y = pos.y - dragOffset.y;
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
            if (activeTool === 'inpaint') {
                // Mask painting done — no layer or undo needed
            } else {
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
    var HANDLE_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    canvas.addEventListener('mousemove', function (e) {
        lastMousePos = getCanvasPos(e);
        // Update cursor for resize handles on pending selection
        if (activeTool === 'select' && !isDrawing && !isDragging && !selectState && !resizeHandle) {
            if (pendingSelect) {
                var hoverHandle = hitTestResizeHandles(lastMousePos.x, lastMousePos.y);
                if (hoverHandle) {
                    canvas.style.cursor = HANDLE_CURSORS[hoverHandle];
                    return;
                }
            }
            canvas.style.cursor = 'crosshair';
        }
    });

    canvas.addEventListener('mouseup', function (e) {
        // Handle select tool completion — set pending selection (don't extract yet)
        if (activeTool === 'select' && selectState) {
            var pos = getCanvasPos(e);
            var sx = Math.round(Math.min(selectState.startX, pos.x));
            var sy = Math.round(Math.min(selectState.startY, pos.y));
            var sw = Math.round(Math.abs(pos.x - selectState.startX));
            var sh = Math.round(Math.abs(pos.y - selectState.startY));
            selectState = null;

            // Minimum size threshold
            if (sw < 4 || sh < 4) { render(); return; }

            // Clamp to canvas bounds
            if (sx < 0) { sw += sx; sx = 0; }
            if (sy < 0) { sh += sy; sy = 0; }
            if (sx + sw > canvas.width) sw = canvas.width - sx;
            if (sy + sh > canvas.height) sh = canvas.height - sy;
            if (sw <= 0 || sh <= 0) { render(); return; }

            setPendingSelect(sx, sy, sw, sh);
            return;
        }

        // Handle resize completion on pending selection
        if (resizeHandle) {
            resizeHandle = null;
            resizeStart = null;
            render();
            return;
        }

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

    // ── Inpaint functions ──
    function clearInpaintMask() {
        if (inpaintMaskCtx) {
            inpaintMaskCtx.clearRect(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height);
            render();
        }
    }

    function isMaskEmpty() {
        if (!inpaintMaskCanvas) return true;
        var data = inpaintMaskCtx.getImageData(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height).data;
        // Check if any pixel has been painted (non-transparent)
        for (var i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return false;
        }
        return true;
    }

    async function doInpaint(mode) {
        if (!originalImage) return;

        if (isMaskEmpty()) {
            inpaintStatus.textContent = 'Paint a mask area first.';
            inpaintStatus.hidden = false;
            return;
        }

        var prompt = inpaintPrompt.value.trim();
        if (mode === 'insert' && !prompt) {
            inpaintStatus.textContent = 'Enter a prompt for editing.';
            inpaintStatus.hidden = false;
            return;
        }

        inpaintApplyBtn.disabled = true;
        inpaintRemoveBtn.disabled = true;
        inpaintStatus.textContent = 'Inpainting... this may take a moment.';
        inpaintStatus.hidden = false;

        try {
            // Flatten composite to blob
            var imageBlob = await flattenToBlob();

            // Build a proper black/white mask for the API (black=preserve, white=edit)
            var apiMask = document.createElement('canvas');
            apiMask.width = inpaintMaskCanvas.width;
            apiMask.height = inpaintMaskCanvas.height;
            var amCtx = apiMask.getContext('2d');
            amCtx.fillStyle = '#000';
            amCtx.fillRect(0, 0, apiMask.width, apiMask.height);
            amCtx.drawImage(inpaintMaskCanvas, 0, 0);
            var maskBlob = await new Promise(function (resolve) {
                apiMask.toBlob(resolve, 'image/png');
            });

            var fd = new FormData();
            fd.append('image', imageBlob, 'source.png');
            fd.append('mask', maskBlob, 'mask.png');
            fd.append('prompt', prompt);
            fd.append('mode', mode);

            var resp = await fetch('/api/ai-inpaint', { method: 'POST', body: fd });

            if (!resp.ok) {
                var errData = await resp.json();
                throw new Error(errData.error || 'Inpaint failed');
            }

            var resultBlob = await resp.blob();
            var img = new Image();
            img.onload = function () {
                // Replace the canvas with the inpainted result
                originalImage = img;
                canvas.width = img.width;
                canvas.height = img.height;
                layers = [];
                selectedLayerIndex = -1;
                clearInpaintMask();
                // Re-init mask canvas to new dimensions
                if (inpaintMaskCanvas) {
                    inpaintMaskCanvas.width = img.width;
                    inpaintMaskCanvas.height = img.height;
                    inpaintMaskCtx = inpaintMaskCanvas.getContext('2d');
                    inpaintMaskCtx.clearRect(0, 0, img.width, img.height);
                }
                render();
                renderLayersPanel();
                pushUndo();
                inpaintStatus.textContent = 'Inpaint complete!';
                setTimeout(function () { inpaintStatus.hidden = true; }, 3000);
            };
            img.src = URL.createObjectURL(resultBlob);

        } catch (err) {
            inpaintStatus.textContent = 'Error: ' + err.message;
        } finally {
            inpaintApplyBtn.disabled = false;
            inpaintRemoveBtn.disabled = false;
        }
    }

    inpaintApplyBtn.addEventListener('click', function () { doInpaint('insert'); });
    inpaintRemoveBtn.addEventListener('click', function () { doInpaint('remove'); });
    inpaintClearMaskBtn.addEventListener('click', clearInpaintMask);

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
            } else if (layer.type === 'select') {
                label.textContent = 'Selection';
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
            if (layer.type === 'select') {
                var id = layer.imageData;
                var newData = new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
                return { type: 'select', imageData: newData, x: layer.x, y: layer.y, w: layer.w, h: layer.h };
            }
            return JSON.parse(JSON.stringify(layer));
        });
    }

    function cloneOriginalImage() {
        if (!originalImage) return null;
        var c = document.createElement('canvas');
        c.width = originalImage.width || canvas.width;
        c.height = originalImage.height || canvas.height;
        c.getContext('2d').drawImage(originalImage, 0, 0);
        return c;
    }

    function pushUndo() {
        undoStack.push({
            layers: deepCopyLayers(layers),
            origCanvas: cloneOriginalImage(),
        });
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
        updateHistoryButtons();
    }

    function restoreSnapshot(snapshot) {
        layers = deepCopyLayers(snapshot.layers);
        selectedLayerIndex = -1;
        if (snapshot.origCanvas) {
            var img = new Image();
            img.onload = function () {
                originalImage = img;
                render();
            };
            img.src = snapshot.origCanvas.toDataURL();
        } else {
            render();
        }
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

    // ── Use as Reference (return to AI Generate or AI Animate) ──
    var useAsRefBtn = document.getElementById('markup-use-as-ref-btn');
    if (useAsRefBtn) {
        useAsRefBtn.addEventListener('click', async function () {
            if (!originalImage) return;
            var blob = await flattenToBlob();
            if (typeof window.markupReturnToAiAnimate === 'function') {
                window.markupReturnToAiAnimate(blob);
                window.markupReturnToAiAnimate = null;
                useAsRefBtn.hidden = true;
                navigateBack();
            } else if (typeof window.markupReturnToAiGenerate === 'function') {
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
