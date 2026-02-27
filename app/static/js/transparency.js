(function () {
    const canvas = document.getElementById('transparency-canvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('trans-play-btn');
    const pauseBtn = document.getElementById('trans-pause-btn');
    const frameIndicator = document.getElementById('trans-frame-indicator');
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

    let transImages = [];
    let transIndex = 0;
    let transTimer = null;
    let transPlaying = false;
    let eyedropperActive = false;
    let transDelay = 100;

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
        stopTransPreview();

        let loadedCount = 0;
        frames.forEach((url) => {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === frames.length) {
                    canvas.width = transImages[0].width;
                    canvas.height = transImages[0].height;
                    drawTransFrame(0);
                }
            };
            // Bust cache after transparency applied
            img.src = url + '?t=' + Date.now();
            transImages.push(img);
        });
    }

    function drawCheckerboard(w, h) {
        const size = 16;
        const colors = ['#7B2D8E', '#9B4DBA'];
        for (let y = 0; y < h; y += size) {
            for (let x = 0; x < w; x += size) {
                ctx.fillStyle = colors[((Math.floor(x / size) + Math.floor(y / size)) % 2)];
                ctx.fillRect(x, y, size, size);
            }
        }
    }

    function drawTransFrame(index) {
        transIndex = index;
        if (!transImages[index]) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawCheckerboard(canvas.width, canvas.height);
        ctx.drawImage(transImages[index], 0, 0);
        frameIndicator.textContent = `Frame: ${index + 1} / ${transImages.length}`;
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

    delaySlider.addEventListener('input', () => {
        transDelay = parseInt(delaySlider.value);
        delayDisplay.textContent = delaySlider.value;
    });

    toleranceSlider.addEventListener('input', () => {
        toleranceDisplay.textContent = toleranceSlider.value;
    });

    // Eyedropper
    eyedropperBtn.addEventListener('click', () => {
        eyedropperActive = !eyedropperActive;
        eyedropperBtn.classList.toggle('active', eyedropperActive);
        document.querySelector('.transparency-preview').classList.toggle('eyedropper-active', eyedropperActive);
    });

    canvas.addEventListener('click', (e) => {
        if (!eyedropperActive) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        // Draw the original frame (without checkerboard) to sample correct color
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        const currentFrames = state.transparentFrames || state.frames;
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
        // Use original frames for eyedropper sampling
        img.src = state.frames[transIndex] + '?t=' + Date.now();
    });

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

    // Reset
    resetBtn.addEventListener('click', () => {
        state.transparentFrames = null;
        stopTransPreview();
        initTransparency();
    });

    // Download
    downloadBtn.addEventListener('click', () => {
        window.location.href = `/api/download/${state.sessionId}`;
    });
})();
