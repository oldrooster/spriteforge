(function () {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const frameIndicator = document.getElementById('frame-indicator');
    const delaySlider = document.getElementById('delay-slider');
    const delayDisplay = document.getElementById('delay-display');
    const filmstrip = document.getElementById('filmstrip');

    let previewImages = [];
    let previewIndex = 0;
    let previewTimer = null;
    let previewPlaying = false;

    function drawFrame(index) {
        previewIndex = index;
        if (!previewImages[index]) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(previewImages[index], 0, 0);
        frameIndicator.textContent = `Frame: ${index + 1} / ${previewImages.length}`;

        filmstrip.querySelectorAll('.filmstrip-frame').forEach((el, i) => {
            el.classList.toggle('active', i === index);
        });
    }

    function startPreview() {
        if (previewImages.length === 0) return;
        previewPlaying = true;
        playBtn.hidden = true;
        pauseBtn.hidden = false;
        tick();
    }

    function stopPreview() {
        previewPlaying = false;
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        playBtn.hidden = false;
        pauseBtn.hidden = true;
    }

    function tick() {
        if (!previewPlaying) return;
        drawFrame(previewIndex);
        previewIndex = (previewIndex + 1) % previewImages.length;
        previewTimer = setTimeout(tick, state.animationDelay);
    }

    // Bind events once (not inside initPreview)
    playBtn.addEventListener('click', startPreview);
    pauseBtn.addEventListener('click', stopPreview);

    delaySlider.addEventListener('input', () => {
        state.animationDelay = parseInt(delaySlider.value);
        delayDisplay.textContent = delaySlider.value;
    });

    // Called from extract.js when frames are ready
    window.initPreview = function () {
        stopPreview();
        previewImages = [];
        previewIndex = 0;
        filmstrip.innerHTML = '';

        const frames = state.frames;
        let loadedCount = 0;

        frames.forEach((url, i) => {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === frames.length) {
                    canvas.width = previewImages[0].width;
                    canvas.height = previewImages[0].height;
                    drawFrame(0);
                }
            };
            img.src = url;
            previewImages.push(img);

            const thumb = document.createElement('img');
            thumb.src = url;
            thumb.className = 'filmstrip-frame';
            if (i === 0) thumb.classList.add('active');
            thumb.addEventListener('click', () => {
                stopPreview();
                drawFrame(i);
            });
            filmstrip.appendChild(thumb);
        });

        completeStep(2);
    };
})();
