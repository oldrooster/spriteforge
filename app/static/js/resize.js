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
    const interpolation = document.getElementById('resize-interpolation');
    const flipHCheckbox = document.getElementById('resize-flip-h');
    const flipVCheckbox = document.getElementById('resize-flip-v');
    const resizeBtn = document.getElementById('resize-btn');
    const resizeProgress = document.getElementById('resize-progress');
    const downloadBtn = document.getElementById('resize-download-btn');

    let files = [];
    let aspectLocked = true;
    let originalDimensions = null;
    let resizeSessionId = null;

    // Mode toggle
    document.querySelectorAll('input[name="resize-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = document.querySelector('input[name="resize-mode"]:checked').value;
            dimGroup.hidden = mode !== 'dimensions';
            pctGroup.hidden = mode !== 'percentage';
        });
    });

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
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFiles(fileInput.files);
        }
    });

    function handleFiles(newFiles) {
        files = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        // Reset download state
        downloadBtn.hidden = true;
        resizeSessionId = null;

        // Read first image for dimensions
        const img = new Image();
        img.onload = () => {
            originalDimensions = { width: img.naturalWidth, height: img.naturalHeight };
            widthInput.value = img.naturalWidth;
            heightInput.value = img.naturalHeight;
            originalInfo.textContent = `${img.naturalWidth} x ${img.naturalHeight}px (${files.length} file${files.length > 1 ? 's' : ''})`;
            resizeBtn.disabled = false;
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(files[0]);

        // Show thumbnails
        fileListEl.hidden = false;
        fileListEl.innerHTML = '';
        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'resize-file-item';
            const thumb = document.createElement('img');
            thumb.src = URL.createObjectURL(f);
            const name = document.createElement('span');
            name.textContent = f.name;
            div.appendChild(thumb);
            div.appendChild(name);
            fileListEl.appendChild(div);
        });
    }

    // Aspect lock
    lockBtn.addEventListener('click', () => {
        aspectLocked = !aspectLocked;
        lockBtn.classList.toggle('active', aspectLocked);
    });

    widthInput.addEventListener('input', () => {
        if (aspectLocked && originalDimensions) {
            const ratio = originalDimensions.height / originalDimensions.width;
            heightInput.value = Math.round(parseInt(widthInput.value) * ratio) || 1;
        }
    });

    heightInput.addEventListener('input', () => {
        if (aspectLocked && originalDimensions) {
            const ratio = originalDimensions.width / originalDimensions.height;
            widthInput.value = Math.round(parseInt(heightInput.value) * ratio) || 1;
        }
    });

    scaleSlider.addEventListener('input', () => {
        scaleDisplay.textContent = scaleSlider.value;
    });

    // Resize
    resizeBtn.addEventListener('click', async () => {
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach(f => formData.append('images', f));

        const mode = document.querySelector('input[name="resize-mode"]:checked').value;
        if (mode === 'dimensions') {
            formData.append('width', widthInput.value);
            formData.append('height', heightInput.value);
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
})();
