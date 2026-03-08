(function () {
    const gridView = document.getElementById('library-grid-view');
    const detailView = document.getElementById('library-detail-view');
    const spritesGrid = document.getElementById('library-sprites-grid');
    const emptyEl = document.getElementById('library-empty');
    const searchInput = document.getElementById('library-search');
    const newBtn = document.getElementById('library-new-btn');

    // Detail view elements
    const backBtn = document.getElementById('library-back-btn');
    const spriteName = document.getElementById('library-sprite-name');
    const renameBtn = document.getElementById('library-rename-btn');
    const deleteSpriteBtn = document.getElementById('library-delete-sprite-btn');
    const resourceInput = document.getElementById('library-resource-input');
    const resourcesList = document.getElementById('library-resources-list');
    const noResources = document.getElementById('library-no-resources');
    const loopsList = document.getElementById('library-loops-list');
    const noLoops = document.getElementById('library-no-loops');
    const newLoopBtn = document.getElementById('library-new-loop-btn');
    const downloadAllBtn = document.getElementById('library-download-all-btn');

    let sprites = [];
    let currentSprite = null;
    let loopPreviewTimers = {};

    // ── Grid View ──

    async function loadSprites() {
        try {
            const resp = await fetch('/api/library');
            sprites = await resp.json();
        } catch (e) {
            sprites = [];
        }
        renderGrid();
    }

    function renderGrid() {
        const query = searchInput.value.toLowerCase().trim();
        const filtered = query ? sprites.filter(s => s.name.toLowerCase().includes(query)) : sprites;

        // Remove old cards but keep empty element
        spritesGrid.querySelectorAll('.sprite-card').forEach(el => el.remove());

        if (filtered.length === 0) {
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;

        filtered.forEach(s => {
            const card = document.createElement('div');
            card.className = 'sprite-card';
            card.addEventListener('click', () => openSprite(s.id));

            const thumb = document.createElement('img');
            thumb.src = `/api/library/${s.id}/thumbnail?t=${Date.now()}`;
            thumb.alt = s.name;

            const name = document.createElement('div');
            name.className = 'sprite-card-name';
            name.textContent = s.name;

            const info = document.createElement('div');
            info.className = 'sprite-card-info';
            const loops = s.loop_count || 0;
            const resources = s.resource_count || 0;
            info.textContent = `${loops} loop${loops !== 1 ? 's' : ''}`;
            if (resources > 0) info.textContent += ` · ${resources} resource${resources !== 1 ? 's' : ''}`;

            card.appendChild(thumb);
            card.appendChild(name);
            card.appendChild(info);
            spritesGrid.appendChild(card);
        });
    }

    searchInput.addEventListener('input', renderGrid);

    // ── Create Sprite ──

    newBtn.addEventListener('click', async () => {
        const name = prompt('Sprite name:');
        if (!name || !name.trim()) return;

        try {
            const resp = await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            const sprite = await resp.json();
            if (!resp.ok) throw new Error(sprite.error);
            await loadSprites();
            openSprite(sprite.id);
        } catch (e) {
            alert('Failed to create sprite: ' + e.message);
        }
    });

    // ── Sprite Detail ──

    async function openSprite(spriteId) {
        try {
            const resp = await fetch(`/api/library/${spriteId}`);
            currentSprite = await resp.json();
            if (!resp.ok) throw new Error(currentSprite.error);
        } catch (e) {
            alert('Failed to load sprite: ' + e.message);
            return;
        }

        gridView.hidden = true;
        detailView.hidden = false;
        spriteName.textContent = currentSprite.name;

        renderResources();
        renderLoops();
    }

    backBtn.addEventListener('click', () => {
        stopAllLoopPreviews();
        detailView.hidden = true;
        gridView.hidden = false;
        currentSprite = null;
        loadSprites();
    });

    renameBtn.addEventListener('click', async () => {
        if (!currentSprite) return;
        const name = prompt('New name:', currentSprite.name);
        if (!name || !name.trim()) return;

        try {
            const resp = await fetch(`/api/library/${currentSprite.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            currentSprite.name = data.name;
            spriteName.textContent = data.name;
        } catch (e) {
            alert('Failed to rename: ' + e.message);
        }
    });

    deleteSpriteBtn.addEventListener('click', async () => {
        if (!currentSprite) return;
        if (!confirm(`Delete "${currentSprite.name}" and all its data?`)) return;

        try {
            const resp = await fetch(`/api/library/${currentSprite.id}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('Delete failed');
            stopAllLoopPreviews();
            detailView.hidden = true;
            gridView.hidden = false;
            currentSprite = null;
            loadSprites();
        } catch (e) {
            alert('Failed to delete sprite: ' + e.message);
        }
    });

    // ── Resources ──

    function renderResources() {
        resourcesList.querySelectorAll('.library-resource-tile').forEach(el => el.remove());
        const resources = currentSprite.resources || [];
        noResources.hidden = resources.length > 0;

        resources.forEach(r => {
            const tile = document.createElement('div');
            tile.className = 'library-resource-tile';

            const preview = document.createElement('div');
            preview.className = 'resource-tile-preview';

            const fileUrl = `/api/library/${currentSprite.id}/resources/${r.id}/file`;

            if (r.type === 'video') {
                const video = document.createElement('video');
                video.src = fileUrl;
                video.muted = true;
                video.preload = 'metadata';
                video.addEventListener('loadeddata', () => video.currentTime = 0.1);
                preview.appendChild(video);
                const badge = document.createElement('span');
                badge.className = 'resource-tile-badge';
                badge.textContent = 'VIDEO';
                preview.appendChild(badge);
            } else {
                const img = document.createElement('img');
                img.src = fileUrl;
                img.alt = r.filename;
                preview.appendChild(img);
            }

            tile.appendChild(preview);

            const name = document.createElement('div');
            name.className = 'resource-tile-name';
            name.textContent = r.filename;
            name.title = r.filename;
            tile.appendChild(name);

            const actions = document.createElement('div');
            actions.className = 'resource-tile-actions';

            if (r.type === 'video') {
                const openBtn = document.createElement('button');
                openBtn.className = 'btn btn-secondary btn-small';
                openBtn.textContent = 'Open in V2F';
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openResourceInTool(r);
                });
                actions.appendChild(openBtn);
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-secondary btn-small';
            removeBtn.textContent = 'Remove';
            removeBtn.style.color = 'var(--accent)';
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Remove "${r.filename}"?`)) return;
                try {
                    await fetch(`/api/library/${currentSprite.id}/resources/${r.id}`, { method: 'DELETE' });
                    currentSprite.resources = currentSprite.resources.filter(x => x.id !== r.id);
                    renderResources();
                } catch (err) {
                    alert('Failed to remove resource');
                }
            });
            actions.appendChild(removeBtn);

            tile.appendChild(actions);
            resourcesList.appendChild(tile);
        });
    }

    resourceInput.addEventListener('change', async () => {
        if (!currentSprite || !resourceInput.files.length) return;
        for (const file of resourceInput.files) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const resp = await fetch(`/api/library/${currentSprite.id}/resources`, {
                    method: 'POST',
                    body: formData,
                });
                const resource = await resp.json();
                if (!resp.ok) throw new Error(resource.error);
                currentSprite.resources.push(resource);
            } catch (e) {
                alert('Failed to upload: ' + e.message);
            }
        }
        resourceInput.value = '';
        renderResources();
    });

    function openResourceInTool(resource) {
        // Switch to Video to Frames and set the video source from library
        const videoUrl = `/api/library/${currentSprite.id}/resources/${resource.id}/file`;
        showTool('video-to-frames');

        // Trigger upload from library URL
        if (typeof window.uploadFromLibrary === 'function') {
            window.uploadFromLibrary(videoUrl, resource.filename);
        }
    }

    // ── Loops ──

    function renderLoops() {
        stopAllLoopPreviews();
        loopsList.querySelectorAll('.library-loop-item').forEach(el => el.remove());
        const loops = currentSprite.loops || [];
        noLoops.hidden = loops.length > 0;

        loops.forEach(loop => {
            const div = document.createElement('div');
            div.className = 'library-loop-item';

            const header = document.createElement('div');
            header.className = 'loop-item-header';

            const info = document.createElement('div');
            info.className = 'loop-item-info';
            const title = document.createElement('strong');
            title.textContent = loop.name;
            const meta = document.createElement('span');
            meta.className = 'hint';
            meta.textContent = ` (${loop.frame_count} frames, ${loop.width}x${loop.height})`;
            info.appendChild(title);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'loop-item-actions';

            const previewBtn = document.createElement('button');
            previewBtn.className = 'btn btn-secondary btn-small';
            previewBtn.textContent = 'Preview';
            previewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLoopPreview(loop, div);
            });

            const renLoopBtn = document.createElement('button');
            renLoopBtn.className = 'btn btn-secondary btn-small';
            renLoopBtn.textContent = 'Rename';
            renLoopBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const name = prompt('Loop name:', loop.name);
                if (!name || !name.trim()) return;
                try {
                    const resp = await fetch(`/api/library/${currentSprite.id}/loops/${loop.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim() }),
                    });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.error);
                    loop.name = data.name;
                    title.textContent = data.name;
                } catch (err) {
                    alert('Failed to rename loop');
                }
            });

            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn btn-secondary btn-small';
            dlBtn.textContent = 'ZIP';
            dlBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.href = `/api/library/${currentSprite.id}/loops/${loop.id}/download`;
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-secondary btn-small';
            delBtn.textContent = 'Delete';
            delBtn.style.color = 'var(--accent)';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete loop "${loop.name}"?`)) return;
                try {
                    await fetch(`/api/library/${currentSprite.id}/loops/${loop.id}`, { method: 'DELETE' });
                    currentSprite.loops = currentSprite.loops.filter(l => l.id !== loop.id);
                    renderLoops();
                } catch (err) {
                    alert('Failed to delete loop');
                }
            });

            actions.appendChild(previewBtn);
            actions.appendChild(renLoopBtn);
            actions.appendChild(dlBtn);
            actions.appendChild(delBtn);

            header.appendChild(info);
            header.appendChild(actions);
            div.appendChild(header);

            // Filmstrip
            const filmstrip = document.createElement('div');
            filmstrip.className = 'filmstrip library-filmstrip';
            for (let i = 1; i <= loop.frame_count; i++) {
                const img = document.createElement('img');
                img.className = 'filmstrip-frame';
                img.src = `/api/library/${currentSprite.id}/loops/${loop.id}/frames/frame_${String(i).padStart(4, '0')}.png`;
                img.alt = `Frame ${i}`;
                filmstrip.appendChild(img);
            }
            div.appendChild(filmstrip);

            loopsList.appendChild(div);
        });
    }

    function toggleLoopPreview(loop, container) {
        if (loopPreviewTimers[loop.id]) {
            stopLoopPreview(loop.id, container);
            return;
        }

        // Create or find preview canvas
        let previewWrap = container.querySelector('.loop-preview-wrap');
        if (!previewWrap) {
            previewWrap = document.createElement('div');
            previewWrap.className = 'loop-preview-wrap';
            const cvs = document.createElement('canvas');
            cvs.className = 'loop-preview-canvas';
            previewWrap.appendChild(cvs);
            container.appendChild(previewWrap);
        }
        previewWrap.hidden = false;

        const cvs = previewWrap.querySelector('canvas');
        cvs.width = loop.width;
        cvs.height = loop.height;
        const cvsCtx = cvs.getContext('2d');

        // Load all frames
        const images = [];
        let loaded = 0;
        for (let i = 1; i <= loop.frame_count; i++) {
            const img = new Image();
            img.onload = () => {
                loaded++;
                if (loaded === loop.frame_count) {
                    // Start animation
                    let idx = 0;
                    function tick() {
                        cvsCtx.clearRect(0, 0, cvs.width, cvs.height);
                        // Checkerboard
                        const size = 8;
                        for (let y = 0; y < cvs.height; y += size) {
                            for (let x = 0; x < cvs.width; x += size) {
                                cvsCtx.fillStyle = ((Math.floor(x / size) + Math.floor(y / size)) % 2) ? '#9B4DBA' : '#7B2D8E';
                                cvsCtx.fillRect(x, y, size, size);
                            }
                        }
                        cvsCtx.drawImage(images[idx], 0, 0);
                        idx = (idx + 1) % images.length;
                        loopPreviewTimers[loop.id] = setTimeout(tick, loop.delay || 100);
                    }
                    tick();
                }
            };
            img.src = `/api/library/${currentSprite.id}/loops/${loop.id}/frames/frame_${String(i).padStart(4, '0')}.png`;
            images.push(img);
        }
    }

    function stopLoopPreview(loopId, container) {
        if (loopPreviewTimers[loopId]) {
            clearTimeout(loopPreviewTimers[loopId]);
            delete loopPreviewTimers[loopId];
        }
        const wrap = container ? container.querySelector('.loop-preview-wrap') : null;
        if (wrap) wrap.hidden = true;
    }

    function stopAllLoopPreviews() {
        for (const id of Object.keys(loopPreviewTimers)) {
            clearTimeout(loopPreviewTimers[id]);
        }
        loopPreviewTimers = {};
    }

    // ── New Loop (upload frames) ──

    newLoopBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.png,.jpg,.jpeg,.webp,.gif';
        input.multiple = true;
        input.addEventListener('change', async () => {
            if (!input.files.length) return;
            const name = prompt('Loop name:', 'Untitled Loop');
            if (!name || !name.trim()) return;

            const formData = new FormData();
            formData.append('name', name.trim());
            const files = Array.from(input.files).sort((a, b) => a.name.localeCompare(b.name));
            files.forEach(f => formData.append('frames', f));

            try {
                const resp = await fetch(`/api/library/${currentSprite.id}/loops`, {
                    method: 'POST',
                    body: formData,
                });
                const loop = await resp.json();
                if (!resp.ok) throw new Error(loop.error);
                currentSprite.loops.push(loop);
                renderLoops();
            } catch (e) {
                alert('Failed to create loop: ' + e.message);
            }
        });
        input.click();
    });

    // ── Download All ──

    downloadAllBtn.addEventListener('click', () => {
        if (currentSprite) {
            window.location.href = `/api/library/${currentSprite.id}/download`;
        }
    });

    // ── Auto-load when tool becomes visible ──

    const panel = document.getElementById('tool-sprite-library');
    const observer = new MutationObserver(() => {
        if (panel.classList.contains('active')) {
            loadSprites();
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    // Expose for integration
    window.spriteLibrary = {
        loadSprites,
        openSprite,
    };
})();
