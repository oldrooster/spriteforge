(function () {
    const dropzone = document.getElementById('resize-dropzone');
    const fileInput = document.getElementById('resize-file-input');
    const fileListEl = document.getElementById('resize-file-list');
    const originalInfo = document.getElementById('resize-original-info');
    const widthInput = document.getElementById('resize-width');
    const heightInput = document.getElementById('resize-height');
    const lockBtn = document.getElementById('resize-lock-btn');
    const scaleSlider = document.getElementById('resize-scale-slider');
    const scaleDisplay = document.getElementById('resize-scale-display');
    const dimGroup = document.getElementById('resize-dimensions-group');
    const pctGroup = document.getElementById('resize-percentage-group');
    const fitGroup = document.getElementById('resize-fit-group');
    const interpolation = document.getElementById('resize-interpolation');
    const flipHCheckbox = document.getElementById('resize-flip-h');
    const flipVCheckbox = document.getElementById('resize-flip-v');
    const resizeBtn = document.getElementById('resize-btn');
    const resizeProgress = document.getElementById('resize-progress');
    const downloadBtn = document.getElementById('resize-download-btn');
    const resizeSaveLibraryBtn = document.getElementById('resize-save-library-btn');
    const previewArea = document.getElementById('resize-preview');
    const previewOrigCanvas = document.getElementById('resize-preview-original');
    const previewResultCanvas = document.getElementById('resize-preview-result');
    const previewOrigInfo = document.getElementById('resize-preview-original-info');
    const previewResultInfo = document.getElementById('resize-preview-result-info');

    let files = [];
    let aspectLocked = true;
    let originalDimensions = null;
    let resizeSessionId = null;
    let selectedIndex = 0;
    let selectedImage = null; // HTMLImageElement of the currently selected file
    let librarySource = null; // { sprite_id, loop_id, filenames: ['frame_0001.png', ...] } when loaded from library

    // Mode toggle
    document.querySelectorAll('input[name="resize-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = document.querySelector('input[name="resize-mode"]:checked').value;
            dimGroup.hidden = mode !== 'dimensions';
            pctGroup.hidden = mode !== 'percentage';
            updateFitVisibility();
            updatePreview();
        });
    });

    // Fit mode toggle
    document.querySelectorAll('input[name="resize-fit"]').forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });

    // Show/hide fit group based on whether aspect ratio is changing
    function updateFitVisibility() {
        const mode = document.querySelector('input[name="resize-mode"]:checked').value;
        if (mode === 'percentage' || aspectLocked) {
            fitGroup.hidden = true;
        } else if (mode === 'dimensions' && originalDimensions) {
            const targetW = parseInt(widthInput.value) || 1;
            const targetH = parseInt(heightInput.value) || 1;
            const origRatio = originalDimensions.width / originalDimensions.height;
            const targetRatio = targetW / targetH;
            fitGroup.hidden = Math.abs(origRatio - targetRatio) < 0.01;
        }
    }

    // Drag-and-drop
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            librarySource = null;
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            librarySource = null;
            handleFiles(fileInput.files);
        }
    });

    function handleFiles(newFiles) {
        files = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        // Reset download state
        downloadBtn.hidden = true;
        if (resizeSaveLibraryBtn) resizeSaveLibraryBtn.hidden = true;
        resizeSessionId = null;
        selectedIndex = 0;

        // Read first image for dimensions
        loadSelectedImage(0);

        // Show thumbnails
        fileListEl.hidden = false;
        fileListEl.innerHTML = '';
        files.forEach((f, i) => {
            const div = document.createElement('div');
            div.className = 'resize-file-item' + (i === 0 ? ' selected' : '');
            div.addEventListener('click', () => selectFile(i));
            const thumb = document.createElement('img');
            thumb.src = URL.createObjectURL(f);
            const name = document.createElement('span');
            name.textContent = f.name;
            div.appendChild(thumb);
            div.appendChild(name);
            fileListEl.appendChild(div);
        });
    }

    function selectFile(index) {
        selectedIndex = index;
        fileListEl.querySelectorAll('.resize-file-item').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
        loadSelectedImage(index);
    }

    function loadSelectedImage(index) {
        const img = new Image();
        img.onload = () => {
            selectedImage = img;
            originalDimensions = { width: img.naturalWidth, height: img.naturalHeight };
            widthInput.value = img.naturalWidth;
            heightInput.value = img.naturalHeight;
            originalInfo.textContent = `${img.naturalWidth} x ${img.naturalHeight}px (${files.length} file${files.length > 1 ? 's' : ''})`;
            resizeBtn.disabled = false;
            updateFitVisibility();
            updatePreview();
        };
        img.src = URL.createObjectURL(files[index]);
    }

    // Aspect lock
    lockBtn.addEventListener('click', () => {
        aspectLocked = !aspectLocked;
        lockBtn.classList.toggle('active', aspectLocked);
        if (aspectLocked && originalDimensions) {
            const ratio = originalDimensions.height / originalDimensions.width;
            heightInput.value = Math.round(parseInt(widthInput.value) * ratio) || 1;
        }
        updateFitVisibility();
        updatePreview();
    });

    widthInput.addEventListener('input', () => {
        if (aspectLocked && originalDimensions) {
            const ratio = originalDimensions.height / originalDimensions.width;
            heightInput.value = Math.round(parseInt(widthInput.value) * ratio) || 1;
        }
        updateFitVisibility();
        updatePreview();
    });

    heightInput.addEventListener('input', () => {
        if (aspectLocked && originalDimensions) {
            const ratio = originalDimensions.width / originalDimensions.height;
            widthInput.value = Math.round(parseInt(heightInput.value) * ratio) || 1;
        }
        updateFitVisibility();
        updatePreview();
    });

    scaleSlider.addEventListener('input', () => {
        scaleDisplay.textContent = scaleSlider.value;
        updatePreview();
    });

    // Update preview whenever flip changes
    flipHCheckbox.addEventListener('change', updatePreview);
    flipVCheckbox.addEventListener('change', updatePreview);
    interpolation.addEventListener('change', updatePreview);

    // Preview rendering
    function updatePreview() {
        if (!selectedImage || !originalDimensions) {
            previewArea.hidden = true;
            return;
        }

        previewArea.hidden = false;
        const srcW = originalDimensions.width;
        const srcH = originalDimensions.height;

        // Draw original
        previewOrigCanvas.width = srcW;
        previewOrigCanvas.height = srcH;
        previewOrigCanvas.getContext('2d').drawImage(selectedImage, 0, 0);
        previewOrigInfo.textContent = `${srcW} x ${srcH}`;

        // Calculate target dimensions
        let targetW, targetH;
        const mode = document.querySelector('input[name="resize-mode"]:checked').value;
        if (mode === 'percentage') {
            const s = parseInt(scaleSlider.value) / 100;
            targetW = Math.max(1, Math.round(srcW * s));
            targetH = Math.max(1, Math.round(srcH * s));
        } else {
            targetW = parseInt(widthInput.value) || 1;
            targetH = parseInt(heightInput.value) || 1;
        }

        // Determine fit mode
        const fitMode = document.querySelector('input[name="resize-fit"]:checked').value;
        const interpName = interpolation.value;
        const useSmoothing = interpName !== 'nearest';

        // Draw result preview
        previewResultCanvas.width = targetW;
        previewResultCanvas.height = targetH;
        const rCtx = previewResultCanvas.getContext('2d');
        rCtx.imageSmoothingEnabled = useSmoothing;
        rCtx.imageSmoothingQuality = 'high';

        // Draw checkerboard background for transparency
        const chkSize = Math.max(4, Math.min(16, Math.floor(targetW / 16)));
        for (let y = 0; y < targetH; y += chkSize) {
            for (let x = 0; x < targetW; x += chkSize) {
                rCtx.fillStyle = ((Math.floor(x / chkSize) + Math.floor(y / chkSize)) % 2) ? '#9B4DBA' : '#7B2D8E';
                rCtx.fillRect(x, y, chkSize, chkSize);
            }
        }

        if (fitMode === 'stretch' || aspectLocked || mode === 'percentage') {
            // Direct resize (stretch)
            drawWithFlip(rCtx, selectedImage, 0, 0, targetW, targetH);
        } else if (fitMode === 'fit') {
            // Scale to fit: entire image visible, letterboxed
            const scaleX = targetW / srcW;
            const scaleY = targetH / srcH;
            const s = Math.min(scaleX, scaleY);
            const fitW = Math.round(srcW * s);
            const fitH = Math.round(srcH * s);
            const offX = Math.round((targetW - fitW) / 2);
            const offY = Math.round((targetH - fitH) / 2);
            drawWithFlip(rCtx, selectedImage, offX, offY, fitW, fitH);
        } else if (fitMode === 'crop') {
            // Crop to fill: image fills target, excess cropped
            const scaleX = targetW / srcW;
            const scaleY = targetH / srcH;
            const s = Math.max(scaleX, scaleY);
            const cropW = Math.round(targetW / s);
            const cropH = Math.round(targetH / s);
            const cropX = Math.round((srcW - cropW) / 2);
            const cropY = Math.round((srcH - cropH) / 2);
            drawCropWithFlip(rCtx, selectedImage, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
        }

        previewResultInfo.textContent = `${targetW} x ${targetH}`;
    }

    function drawWithFlip(ctx, img, x, y, w, h) {
        ctx.save();
        const flipH = flipHCheckbox.checked;
        const flipV = flipVCheckbox.checked;
        if (flipH || flipV) {
            ctx.translate(flipH ? x + w : x, flipV ? y + h : y);
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            ctx.drawImage(img, 0, 0, w, h);
        } else {
            ctx.drawImage(img, x, y, w, h);
        }
        ctx.restore();
    }

    function drawCropWithFlip(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
        ctx.save();
        const flipH = flipHCheckbox.checked;
        const flipV = flipVCheckbox.checked;
        if (flipH || flipV) {
            ctx.translate(flipH ? dx + dw : dx, flipV ? dy + dh : dy);
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
        } else {
            ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        }
        ctx.restore();
    }

    // Resize
    resizeBtn.addEventListener('click', async () => {
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach(f => formData.append('images', f));

        const mode = document.querySelector('input[name="resize-mode"]:checked').value;
        if (mode === 'dimensions') {
            formData.append('width', widthInput.value);
            formData.append('height', heightInput.value);
            if (!aspectLocked) {
                formData.append('fit', document.querySelector('input[name="resize-fit"]:checked').value);
            }
        } else {
            formData.append('scale', scaleSlider.value);
        }
        formData.append('interpolation', interpolation.value);
        formData.append('flip_h', flipHCheckbox.checked);
        formData.append('flip_v', flipVCheckbox.checked);

        resizeBtn.disabled = true;
        resizeProgress.hidden = false;
        downloadBtn.hidden = true;

        try {
            const resp = await fetch('/api/resize', {
                method: 'POST',
                body: formData,
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);

            resizeSessionId = data.session_id;
            downloadBtn.hidden = false;
            if (resizeSaveLibraryBtn && librarySource) resizeSaveLibraryBtn.hidden = false;
        } catch (err) {
            alert('Resize failed: ' + err.message);
        } finally {
            resizeBtn.disabled = false;
            resizeProgress.hidden = true;
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (resizeSessionId) {
            window.location.href = `/api/download-resized/${resizeSessionId}`;
        }
    });

    // Import from Sprite Library
    const resizeFromLibraryBtn = document.getElementById('resize-from-library-btn');
    if (resizeFromLibraryBtn) {
        resizeFromLibraryBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't trigger dropzone click
            if (typeof window.openLibraryModal === 'function') {
                window.openLibraryModal({
                    mode: 'loops',
                    title: 'Import Frames from Library',
                    multiSelect: true,
                    onSelect: async (result) => {
                        // Fetch frames from selected loops as File objects
                        const newFiles = [];
                        const frameNames = [];
                        const loop = result.items[0];
                        for (const loopItem of result.items) {
                            for (let i = 1; i <= loopItem.frame_count; i++) {
                                const frameName = `frame_${String(i).padStart(4, '0')}.png`;
                                const frameUrl = `/api/library/${result.sprite.id}/loops/${loopItem.id}/frames/${frameName}`;
                                try {
                                    const resp = await fetch(frameUrl);
                                    const blob = await resp.blob();
                                    const fileName = `${loopItem.name.replace(/\s+/g, '_')}_frame_${String(i).padStart(4, '0')}.png`;
                                    newFiles.push(new File([blob], fileName, { type: 'image/png' }));
                                    frameNames.push({ loop_id: loopItem.id, filename: frameName });
                                } catch (err) {
                                    console.error('Failed to fetch frame:', err);
                                }
                            }
                        }
                        if (newFiles.length > 0) {
                            librarySource = {
                                sprite_id: result.sprite.id,
                                frames: frameNames,
                            };
                            handleFiles(newFiles);
                            if (resizeSaveLibraryBtn) resizeSaveLibraryBtn.hidden = false;
                        }
                    },
                });
            }
        });
    }

    // Save resized images back to Sprite Library
    if (resizeSaveLibraryBtn) {
        resizeSaveLibraryBtn.addEventListener('click', async () => {
            if (!librarySource || !resizeSessionId) return;
            resizeSaveLibraryBtn.disabled = true;
            try {
                // Download the resized ZIP, extract and overwrite each frame
                const resp = await fetch(`/api/save-resized-to-library`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: resizeSessionId,
                        sprite_id: librarySource.sprite_id,
                        frames: librarySource.frames,
                    }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Save failed');
                alert('Saved ' + data.count + ' frame(s) to sprite library!');
            } catch (err) {
                alert('Failed to save: ' + err.message);
            } finally {
                resizeSaveLibraryBtn.disabled = false;
            }
        });
    }
})();
