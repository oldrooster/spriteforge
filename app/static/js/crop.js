(function () {
    var dropzone = document.getElementById('crop-dropzone');
    var fileInput = document.getElementById('crop-file-input');
    var canvasArea = document.getElementById('crop-canvas-area');
    var canvas = document.getElementById('crop-canvas');
    var ctx = canvas.getContext('2d');
    var canvasWrap = document.getElementById('crop-canvas-wrap');
    var imageInfo = document.getElementById('crop-image-info');
    var settings = document.getElementById('crop-settings');
    var fromLibraryBtn = document.getElementById('crop-from-library-btn');
    var cropBtn = document.getElementById('crop-btn');
    var cropProgress = document.getElementById('crop-progress');
    var downloadBtn = document.getElementById('crop-download-btn');
    var saveLibraryBtn = document.getElementById('crop-save-library-btn');
    var previewSection = document.getElementById('crop-preview-section');
    var previewCanvas = document.getElementById('crop-preview-canvas');
    var previewInfo = document.getElementById('crop-preview-info');
    var selectAllBtn = document.getElementById('crop-select-all-btn');

    var xInput = document.getElementById('crop-x-input');
    var yInput = document.getElementById('crop-y-input');
    var wInput = document.getElementById('crop-w-input');
    var hInput = document.getElementById('crop-h-input');

    var sourceImage = null;
    var sourceFile = null;
    var librarySource = null;
    var cropSessionId = null;

    // Crop region in image pixel coordinates
    var cropX = 0, cropY = 0, cropW = 100, cropH = 100;

    // Aspect ratio: null = free, otherwise w/h ratio number
    var aspectRatio = null;

    // Interaction state
    var interaction = null; // null | 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se'
    var dragStartClientX = 0, dragStartClientY = 0;
    var dragStartCrop = { x: 0, y: 0, w: 0, h: 0 };

    // ── Back button ──
    var backBtn = document.getElementById('crop-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            sourceImage = null;
            sourceFile = null;
            librarySource = null;
            cropSessionId = null;
            interaction = null;
            dropzone.style.display = '';
            canvasArea.hidden = true;
            settings.style.display = 'none';
            previewSection.hidden = true;
            downloadBtn.hidden = true;
            saveLibraryBtn.hidden = true;
            fileInput.value = '';
        });
    }

    // ── Upload ──
    dropzone.addEventListener('click', function (e) {
        if (e.target === fromLibraryBtn || fromLibraryBtn.contains(e.target)) return;
        fileInput.click();
    });
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            librarySource = null;
            loadFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) {
            librarySource = null;
            loadFile(fileInput.files[0]);
        }
    });

    // ── Library picker ──
    if (fromLibraryBtn) {
        fromLibraryBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.openLibraryModal !== 'function') return;
            window.openLibraryModal({
                mode: 'loops',
                title: 'Select Image to Crop',
                onSelect: async function (result) {
                    var loop = result.items[0];
                    var sprite = result.sprite;
                    var frameName = 'frame_0001.png';
                    var imgUrl = '/api/assets/' + sprite.id + '/views/' + loop.id + '/frames/' + frameName;
                    try {
                        var resp = await fetch(imgUrl);
                        var blob = await resp.blob();
                        var file = new File([blob], frameName, { type: 'image/png' });
                        librarySource = { asset_id: sprite.id, view_id: loop.id, filename: frameName };
                        loadFile(file);
                    } catch (err) {
                        alert('Failed to load image from library: ' + err.message);
                    }
                },
            });
        });
    }

    function loadFile(file) {
        if (!file.type.startsWith('image/')) return;
        sourceFile = file;
        var img = new Image();
        img.onload = function () {
            sourceImage = img;

            // Default crop: entire image
            cropX = 0;
            cropY = 0;
            cropW = img.width;
            cropH = img.height;

            imageInfo.textContent = img.width + ' x ' + img.height + 'px';
            xInput.max = img.width;
            yInput.max = img.height;
            wInput.max = img.width;
            hInput.max = img.height;

            dropzone.style.display = 'none';
            canvasArea.hidden = false;
            settings.style.display = '';
            previewSection.hidden = false;
            downloadBtn.hidden = true;
            saveLibraryBtn.hidden = true;
            cropSessionId = null;
            cropBtn.disabled = false;

            drawCanvas();
            updateInputs();
            updatePreview();
        };
        img.src = URL.createObjectURL(file);
    }

    // ── Drawing: render image + dim outside crop region ──
    function drawCanvas() {
        if (!sourceImage) return;
        canvas.width = sourceImage.width;
        canvas.height = sourceImage.height;

        // Draw image
        ctx.drawImage(sourceImage, 0, 0);

        // Dim outside crop area
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        var cx = Math.round(cropX), cy = Math.round(cropY);
        var cw = Math.round(cropW), ch = Math.round(cropH);
        // top
        ctx.fillRect(0, 0, canvas.width, cy);
        // bottom
        ctx.fillRect(0, cy + ch, canvas.width, canvas.height - cy - ch);
        // left
        ctx.fillRect(0, cy, cx, ch);
        // right
        ctx.fillRect(cx + cw, cy, canvas.width - cx - cw, ch);

        // Crop border
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
        ctx.setLineDash([]);

        // Corner handles
        var handleSize = 10;
        ctx.fillStyle = '#ffcc00';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        // NW
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        // NE
        ctx.fillRect(cx + cw - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(cx + cw - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        // SW
        ctx.fillRect(cx - handleSize / 2, cy + ch - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(cx - handleSize / 2, cy + ch - handleSize / 2, handleSize, handleSize);
        // SE
        ctx.fillRect(cx + cw - handleSize / 2, cy + ch - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(cx + cw - handleSize / 2, cy + ch - handleSize / 2, handleSize, handleSize);
    }

    // ── Coordinate helpers ──
    function clientToImage(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    function clientDeltaToImage(dClientX, dClientY) {
        var rect = canvas.getBoundingClientRect();
        return {
            dx: dClientX * (canvas.width / rect.width),
            dy: dClientY * (canvas.height / rect.height),
        };
    }

    // Hit test: which part of the crop region is under the cursor?
    function hitTest(imgX, imgY) {
        var handleR = 12; // handle hit radius in image pixels
        var rect = canvas.getBoundingClientRect();
        handleR = handleR * (canvas.width / rect.width); // scale to image coords

        var cx = cropX, cy = cropY, cw = cropW, ch = cropH;

        // Check handles first (corners)
        if (Math.abs(imgX - cx) < handleR && Math.abs(imgY - cy) < handleR) return 'nw';
        if (Math.abs(imgX - (cx + cw)) < handleR && Math.abs(imgY - cy) < handleR) return 'ne';
        if (Math.abs(imgX - cx) < handleR && Math.abs(imgY - (cy + ch)) < handleR) return 'sw';
        if (Math.abs(imgX - (cx + cw)) < handleR && Math.abs(imgY - (cy + ch)) < handleR) return 'se';

        // Inside crop region = move
        if (imgX >= cx && imgX <= cx + cw && imgY >= cy && imgY <= cy + ch) return 'move';

        // Outside = new draw
        return 'draw';
    }

    // Update cursor based on hover position
    canvas.addEventListener('mousemove', function (e) {
        if (interaction) return; // don't change cursor while dragging
        if (!sourceImage) return;
        var pos = clientToImage(e.clientX, e.clientY);
        var hit = hitTest(pos.x, pos.y);
        switch (hit) {
            case 'nw': canvas.style.cursor = 'nw-resize'; break;
            case 'ne': canvas.style.cursor = 'ne-resize'; break;
            case 'sw': canvas.style.cursor = 'sw-resize'; break;
            case 'se': canvas.style.cursor = 'se-resize'; break;
            case 'move': canvas.style.cursor = 'move'; break;
            default: canvas.style.cursor = 'crosshair'; break;
        }
    });

    // ── Mouse interactions on canvas ──
    canvas.addEventListener('mousedown', function (e) {
        if (!sourceImage || e.button !== 0) return;
        e.preventDefault();

        var pos = clientToImage(e.clientX, e.clientY);
        var hit = hitTest(pos.x, pos.y);

        interaction = hit;
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        dragStartCrop = { x: cropX, y: cropY, w: cropW, h: cropH };

        if (hit === 'draw') {
            // Start new selection from click point
            cropX = pos.x;
            cropY = pos.y;
            cropW = 1;
            cropH = 1;
            dragStartCrop = { x: pos.x, y: pos.y, w: 0, h: 0 };
            interaction = 'draw';
        }
    });

    window.addEventListener('mousemove', function (e) {
        if (!interaction || !sourceImage) return;

        var d = clientDeltaToImage(e.clientX - dragStartClientX, e.clientY - dragStartClientY);

        if (interaction === 'draw') {
            // Draw new selection from start point
            var startX = dragStartCrop.x;
            var startY = dragStartCrop.y;
            var endPos = clientToImage(e.clientX, e.clientY);
            var endX = endPos.x;
            var endY = endPos.y;

            // Allow drawing in any direction
            cropX = Math.min(startX, endX);
            cropY = Math.min(startY, endY);
            cropW = Math.abs(endX - startX);
            cropH = Math.abs(endY - startY);

            if (aspectRatio) {
                cropH = cropW / aspectRatio;
                if (endY < startY) cropY = startY - cropH;
            }
        } else if (interaction === 'move') {
            cropX = dragStartCrop.x + d.dx;
            cropY = dragStartCrop.y + d.dy;
            cropW = dragStartCrop.w;
            cropH = dragStartCrop.h;
            cropX = Math.max(0, Math.min(cropX, sourceImage.width - cropW));
            cropY = Math.max(0, Math.min(cropY, sourceImage.height - cropH));
        } else if (interaction === 'se') {
            cropW = Math.max(1, dragStartCrop.w + d.dx);
            cropH = aspectRatio ? cropW / aspectRatio : Math.max(1, dragStartCrop.h + d.dy);
        } else if (interaction === 'sw') {
            var newW = Math.max(1, dragStartCrop.w - d.dx);
            cropX = dragStartCrop.x + (dragStartCrop.w - newW);
            cropW = newW;
            cropH = aspectRatio ? cropW / aspectRatio : Math.max(1, dragStartCrop.h + d.dy);
        } else if (interaction === 'ne') {
            cropW = Math.max(1, dragStartCrop.w + d.dx);
            var newH = aspectRatio ? cropW / aspectRatio : Math.max(1, dragStartCrop.h - d.dy);
            cropY = dragStartCrop.y + (dragStartCrop.h - newH);
            cropH = newH;
        } else if (interaction === 'nw') {
            var nwW = Math.max(1, dragStartCrop.w - d.dx);
            var nwH = aspectRatio ? nwW / aspectRatio : Math.max(1, dragStartCrop.h - d.dy);
            cropX = dragStartCrop.x + (dragStartCrop.w - nwW);
            cropY = dragStartCrop.y + (dragStartCrop.h - nwH);
            cropW = nwW;
            cropH = nwH;
        }

        clampCrop();
        drawCanvas();
        updateInputs();
        updatePreview();
    });

    window.addEventListener('mouseup', function () {
        if (interaction) {
            interaction = null;
            // Ensure minimum size
            if (cropW < 1) cropW = 1;
            if (cropH < 1) cropH = 1;
            clampCrop();
            drawCanvas();
            updateInputs();
            updatePreview();
        }
    });

    // ── Helpers ──
    function updateInputs() {
        xInput.value = Math.round(cropX);
        yInput.value = Math.round(cropY);
        wInput.value = Math.round(cropW);
        hInput.value = Math.round(cropH);
    }

    function updatePreview() {
        if (!sourceImage) return;
        var cw = Math.max(1, Math.round(cropW));
        var ch = Math.max(1, Math.round(cropH));
        previewCanvas.width = cw;
        previewCanvas.height = ch;
        var pCtx = previewCanvas.getContext('2d');

        // Checkerboard background
        var size = Math.max(4, Math.min(16, Math.floor(cw / 16)));
        for (var py = 0; py < ch; py += size) {
            for (var px = 0; px < cw; px += size) {
                pCtx.fillStyle = ((Math.floor(px / size) + Math.floor(py / size)) % 2) ? '#9B4DBA' : '#7B2D8E';
                pCtx.fillRect(px, py, size, size);
            }
        }

        pCtx.drawImage(sourceImage, Math.round(cropX), Math.round(cropY), cw, ch, 0, 0, cw, ch);
        previewInfo.textContent = cw + ' x ' + ch + 'px';
    }

    function clampCrop() {
        if (!sourceImage) return;
        cropX = Math.max(0, Math.min(cropX, sourceImage.width - 1));
        cropY = Math.max(0, Math.min(cropY, sourceImage.height - 1));
        cropW = Math.max(1, Math.min(cropW, sourceImage.width - cropX));
        cropH = Math.max(1, Math.min(cropH, sourceImage.height - cropY));

        if (aspectRatio) {
            cropH = Math.round(cropW / aspectRatio);
            if (cropY + cropH > sourceImage.height) {
                cropH = sourceImage.height - cropY;
                cropW = Math.round(cropH * aspectRatio);
            }
        }
    }

    // ── Input handlers ──
    xInput.addEventListener('input', function () {
        cropX = parseInt(xInput.value) || 0;
        clampCrop(); drawCanvas(); updateInputs(); updatePreview();
    });
    yInput.addEventListener('input', function () {
        cropY = parseInt(yInput.value) || 0;
        clampCrop(); drawCanvas(); updateInputs(); updatePreview();
    });
    wInput.addEventListener('input', function () {
        cropW = parseInt(wInput.value) || 1;
        if (aspectRatio) cropH = Math.round(cropW / aspectRatio);
        clampCrop(); drawCanvas(); updateInputs(); updatePreview();
    });
    hInput.addEventListener('input', function () {
        cropH = parseInt(hInput.value) || 1;
        if (aspectRatio) cropW = Math.round(cropH * aspectRatio);
        clampCrop(); drawCanvas(); updateInputs(); updatePreview();
    });

    // ── Aspect ratio buttons ──
    document.querySelectorAll('.crop-aspect-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.crop-aspect-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var ratio = btn.dataset.ratio;
            if (ratio === 'free') {
                aspectRatio = null;
            } else {
                var parts = ratio.split(':');
                aspectRatio = parseInt(parts[0]) / parseInt(parts[1]);
                cropH = Math.round(cropW / aspectRatio);
                clampCrop(); drawCanvas(); updateInputs(); updatePreview();
            }
        });
    });

    // ── Select entire image ──
    selectAllBtn.addEventListener('click', function () {
        if (!sourceImage) return;
        cropX = 0; cropY = 0;
        cropW = sourceImage.width; cropH = sourceImage.height;
        if (aspectRatio) {
            cropH = Math.round(cropW / aspectRatio);
            clampCrop();
        }
        drawCanvas(); updateInputs(); updatePreview();
    });

    // ── Crop action ──
    cropBtn.addEventListener('click', async function () {
        if (!sourceFile || !sourceImage) return;

        cropBtn.disabled = true;
        cropProgress.hidden = false;
        downloadBtn.hidden = true;
        saveLibraryBtn.hidden = true;

        try {
            var formData = new FormData();
            formData.append('image', sourceFile);
            formData.append('x', Math.round(cropX));
            formData.append('y', Math.round(cropY));
            formData.append('w', Math.round(cropW));
            formData.append('h', Math.round(cropH));

            var resp = await fetch('/api/crop', { method: 'POST', body: formData });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            cropSessionId = data.session_id;
            downloadBtn.hidden = false;
            if (librarySource) saveLibraryBtn.hidden = false;
        } catch (err) {
            alert('Crop failed: ' + err.message);
        } finally {
            cropBtn.disabled = false;
            cropProgress.hidden = true;
        }
    });

    // ── Download ──
    downloadBtn.addEventListener('click', function () {
        if (cropSessionId) {
            window.location.href = '/api/download-crop/' + cropSessionId;
        }
    });

    // ── Save to library ──
    if (saveLibraryBtn) {
        saveLibraryBtn.addEventListener('click', async function () {
            if (!librarySource || !cropSessionId) return;
            saveLibraryBtn.disabled = true;
            try {
                var imgResp = await fetch('/api/crop-preview/' + cropSessionId);
                var blob = await imgResp.blob();
                var formData = new FormData();
                formData.append('image', blob, librarySource.filename);
                var url = '/api/assets/' + librarySource.asset_id + '/views/' + librarySource.view_id + '/frames/' + librarySource.filename;
                var resp = await fetch(url, { method: 'PUT', body: formData });
                var data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Save failed');
                alert('Saved to sprite library!');
            } catch (err) {
                alert('Failed to save: ' + err.message);
            } finally {
                saveLibraryBtn.disabled = false;
            }
        });
    }
})();
