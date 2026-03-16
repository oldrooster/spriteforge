(function () {
    const panel = document.getElementById('asset-detail');
    const content = document.getElementById('asset-detail-content');

    let asset = null;
    let previewTimers = {};  // viewId → timer id
    let activeContextMenu = null; // currently open context menu element
    let activeFilter = 'all'; // resource filter: all, image, video, audio, other

    // ── Load asset on panel activation ──

    async function load() {
        const id = state.currentAssetId;
        if (!id) return;

        try {
            const resp = await fetch('/api/assets/' + id);
            if (!resp.ok) throw new Error('Not found');
            asset = await resp.json();
        } catch (e) {
            content.innerHTML = '<p class="hint">Failed to load asset.</p>';
            return;
        }
        render();
    }

    // ── Dismiss context menu on outside click ──
    document.addEventListener('click', () => dismissContextMenu());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dismissContextMenu();
    });

    function dismissContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    // ── Render ──

    function render() {
        stopAllPreviews();
        dismissContextMenu();
        content.innerHTML = '';
        const id = asset.id;

        // ── Header ──
        const header = el('div', 'asset-detail-header');

        const nameEl = el('h2', 'asset-detail-name');
        nameEl.textContent = asset.name;
        nameEl.title = 'Click to rename';
        nameEl.style.cursor = 'pointer';
        nameEl.addEventListener('click', () => renameAsset());

        const badge = el('span', 'asset-category-badge category-' + asset.category);
        badge.textContent = asset.category;

        const tagsWrap = el('div', 'asset-detail-tags');
        (asset.tags || []).forEach(t => {
            const pill = el('span', 'tag-pill');
            pill.textContent = t;
            tagsWrap.appendChild(pill);
        });

        const assetMenuBtn = el('button', 'asset-menu-btn');
        assetMenuBtn.textContent = '\u2026';
        assetMenuBtn.title = 'Asset Actions';
        assetMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const items = [
                ['Rename', () => renameAsset()],
                ['Upload Resource', () => uploadResource()],
                null,
                ['Generate Image', () => navigate('#/asset/' + id + '/tool/ai-generate')],
                ['Generate Music', () => navigate('#/asset/' + id + '/tool/ai-music')],
                null,
                ['Download', () => { window.open('/api/assets/' + id + '/download', '_blank'); }],
                ['Export AGS', () => { window.open('/api/assets/' + id + '/export-ags', '_blank'); }],
                null,
                ['Delete', () => deleteAsset(), true],
            ];
            buildContextMenu(items, assetMenuBtn);
        });

        header.appendChild(nameEl);
        header.appendChild(assetMenuBtn);
        header.appendChild(badge);
        header.appendChild(tagsWrap);
        content.appendChild(header);

        // ── Resource Filter Tabs ──
        const resources = asset.resources || [];
        const thumbResId = asset.thumbnail_resource_id || null;

        if (resources.length > 0) {
            const filterBar = el('div', 'resource-filter-bar');
            const types = ['all', 'image', 'video', 'audio', 'other'];
            types.forEach(t => {
                const count = t === 'all' ? resources.length
                    : t === 'other' ? resources.filter(r => r.type !== 'image' && r.type !== 'video' && r.type !== 'audio').length
                    : resources.filter(r => r.type === t).length;
                if (t !== 'all' && count === 0) return; // hide empty filters
                const fBtn = btn(t.charAt(0).toUpperCase() + t.slice(1) + ' (' + count + ')',
                    'btn btn-secondary btn-small resource-filter-btn' + (activeFilter === t ? ' active' : ''),
                    () => {
                        activeFilter = t;
                        render();
                    });
                filterBar.appendChild(fBtn);
            });
            content.appendChild(filterBar);
        }

        // ── Resource Strip ──
        const strip = el('div', 'resource-strip');

        if (resources.length > 0) {
            // Sort so hero/default image appears first
            const sorted = [...resources].sort((a, b) => {
                if (a.id === thumbResId) return -1;
                if (b.id === thumbResId) return 1;
                return 0;
            });
            // Filter by active filter
            const filtered = activeFilter === 'all' ? sorted
                : activeFilter === 'other' ? sorted.filter(r => r.type !== 'image' && r.type !== 'video' && r.type !== 'audio')
                : sorted.filter(r => r.type === activeFilter);
            filtered.forEach(r => {
                const isDefault = r.id === thumbResId;
                const card = buildResourceCard(r, isDefault);
                strip.appendChild(card);
            });
            if (filtered.length === 0) {
                const empty = el('p', 'hint');
                empty.textContent = 'No ' + activeFilter + ' resources.';
                empty.style.padding = '16px';
                strip.appendChild(empty);
            }
        } else {
            // Show hero card with centered generate button when no resources exist
            const heroCard = el('div', 'resource-card resource-card-hero');
            const preview = el('div', 'resource-card-preview hero-empty-preview');
            const generateBtn = btn('Generate Image', 'btn btn-primary', () => {
                navigate('#/asset/' + id + '/tool/ai-generate');
            });
            preview.appendChild(generateBtn);
            heroCard.appendChild(preview);
            const label = el('div', 'resource-card-name');
            label.textContent = asset.name;
            heroCard.appendChild(label);
            strip.appendChild(heroCard);
        }

        content.appendChild(strip);

        // ── Views Section ──
        const viewsSection = el('div', 'asset-detail-section');
        viewsSection.appendChild(sectionTitle('Views'));

        if (asset.views && asset.views.length > 0) {
            asset.views.forEach(v => viewsSection.appendChild(renderView(v)));
        } else {
            const empty = el('p', 'hint');
            empty.textContent = 'No views yet. Create one by uploading frames or using a tool.';
            viewsSection.appendChild(empty);
        }

        const newViewBtn = btn('+ New View', 'btn btn-primary btn-small', () => uploadNewView());
        newViewBtn.style.marginTop = '12px';
        viewsSection.appendChild(newViewBtn);
        content.appendChild(viewsSection);

        // Videos are now shown as resources in the resource strip
    }

    // ── Build a resource card ──

    function buildResourceCard(res, isDefault) {
        const card = el('div', 'resource-card' + (isDefault ? ' resource-card-default' : ''));

        // Determine display type (image, video, audio, or other)
        const displayType = (res.type === 'image' || res.type === 'video' || res.type === 'audio') ? res.type : 'other';

        // Preview area
        const preview = el('div', 'resource-card-preview');
        const fileUrl = '/api/assets/' + asset.id + '/resources/' + res.id + '/file';

        if (displayType === 'image') {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = res.filename;
            img.loading = 'lazy';
            preview.appendChild(img);
        } else if (displayType === 'video') {
            const vid = document.createElement('video');
            vid.src = fileUrl;
            vid.muted = true;
            vid.preload = 'metadata';
            preview.appendChild(vid);
        } else if (displayType === 'audio') {
            const icon = el('div', 'resource-audio-icon');
            icon.innerHTML = '&#9835;';
            preview.appendChild(icon);
        } else {
            // 'other' — show file icon placeholder
            const icon = el('div', 'resource-audio-icon');
            icon.innerHTML = '&#128196;';
            preview.appendChild(icon);
        }

        // Click on card to show preview modal
        preview.style.cursor = 'pointer';
        preview.addEventListener('click', () => showResourcePreview(res, fileUrl));

        // Type badge overlay
        const badge = el('span', 'resource-card-badge');
        badge.textContent = (displayType === 'other' ? 'OTHER' : res.type.toUpperCase());
        preview.appendChild(badge);

        // Default star indicator
        if (isDefault) {
            const star = el('span', 'resource-card-star');
            star.textContent = '\u2605';
            star.title = 'Default / Hero image';
            preview.appendChild(star);
        }

        // "..." context menu button
        const menuBtn = el('button', 'resource-card-menu-btn');
        menuBtn.textContent = '\u2026';
        menuBtn.title = 'Actions';
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(res, menuBtn);
        });
        preview.appendChild(menuBtn);

        card.appendChild(preview);

        // Filename label
        const nameLabel = el('div', 'resource-card-name');
        nameLabel.textContent = res.filename;
        nameLabel.title = res.filename;
        card.appendChild(nameLabel);

        // Image dimensions (loaded async)
        if (displayType === 'image') {
            const dimLabel = el('div', 'resource-card-dims');
            card.appendChild(dimLabel);
            const probe = new Image();
            probe.onload = function () {
                dimLabel.textContent = probe.naturalWidth + ' × ' + probe.naturalHeight;
            };
            probe.src = fileUrl;
        }

        return card;
    }

    // ── Resource Preview Modal ──

    function showResourcePreview(res, fileUrl) {
        const displayType = (res.type === 'image' || res.type === 'video' || res.type === 'audio') ? res.type : 'other';

        // Create overlay
        const overlay = el('div', 'resource-preview-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const box = el('div', 'resource-preview-box');

        const closeBtn = btn('\u2715', 'btn btn-secondary btn-small resource-preview-close', () => overlay.remove());
        box.appendChild(closeBtn);

        if (displayType === 'image') {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = res.filename;
            box.appendChild(img);
        } else if (displayType === 'video') {
            const vid = document.createElement('video');
            vid.src = fileUrl;
            vid.controls = true;
            vid.autoplay = true;
            vid.loop = true;
            vid.style.maxWidth = '100%';
            vid.style.maxHeight = '70vh';
            box.appendChild(vid);
        } else if (displayType === 'audio') {
            const aud = document.createElement('audio');
            aud.src = fileUrl;
            aud.controls = true;
            aud.autoplay = true;
            aud.style.width = '100%';
            box.appendChild(aud);
        } else {
            const msg = el('p', 'hint');
            msg.textContent = 'Preview not available for this file type.';
            msg.style.padding = '24px';
            box.appendChild(msg);
        }

        const nameLabel = el('div', 'resource-preview-name');
        nameLabel.textContent = res.filename;
        box.appendChild(nameLabel);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Close on escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // ── Context Menu ──

    function buildContextMenu(items, anchorEl) {
        dismissContextMenu();
        const menu = el('div', 'resource-context-menu');

        items.forEach(item => {
            if (item === null) {
                menu.appendChild(el('div', 'context-menu-sep'));
                return;
            }
            const [label, action, isDanger] = item;
            const menuItem = el('button', 'context-menu-item' + (isDanger ? ' context-menu-danger' : ''));
            menuItem.textContent = label;
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissContextMenu();
                action();
            });
            menu.appendChild(menuItem);
        });

        const rect = anchorEl.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = rect.bottom + 4 + 'px';
        menu.style.left = rect.right + 'px';
        document.body.appendChild(menu);

        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth - 8) {
            menu.style.left = (rect.left - menuRect.width) + 'px';
        }
        if (menuRect.bottom > window.innerHeight - 8) {
            menu.style.top = (rect.top - menuRect.height) + 'px';
        }

        activeContextMenu = menu;
    }

    function showContextMenu(res, anchorEl) {
        const items = [];

        if (res.type === 'image') {
            items.push(['Generate Image', () => launchTool(res, 'ai-generate')]);
            items.push(['AI Animate', () => launchTool(res, 'ai-animate')]);
            items.push(['Crop', () => launchTool(res, 'crop-image')]);
            items.push(['Resize', () => launchTool(res, 'resize-images')]);
            items.push(['Make Transparent', () => launchTool(res, 'make-transparent')]);
            items.push(['Mark Up', () => launchTool(res, 'markup')]);
            items.push(null);
            items.push(['Set as Default', () => setAsDefault(res)]);
        } else if (res.type === 'video') {
            items.push(['Video to Frames', () => launchTool(res, 'video-to-frames')]);
            items.push(null);
        }

        items.push(['Duplicate', () => duplicateResource(res)]);
        items.push(['Rename', () => renameResource(res)]);
        items.push(['Download', () => {
            window.open('/api/assets/' + asset.id + '/resources/' + res.id + '/file', '_blank');
        }]);
        items.push(null);
        items.push(['Delete', () => deleteResource(res), true]);

        buildContextMenu(items, anchorEl);
    }

    // ── Context menu actions ──

    function launchViewTool(view, toolRoute) {
        state.pendingToolView = {
            asset_id: asset.id,
            view_id: view.id,
            view_name: view.name,
            frame_count: view.frame_count,
            width: view.width,
            height: view.height,
        };
        navigate('#/asset/' + asset.id + '/tool/' + toolRoute);
    }

    function launchTool(res, toolRoute) {
        state.pendingToolResource = {
            asset_id: asset.id,
            resource_id: res.id,
            resource_url: '/api/assets/' + asset.id + '/resources/' + res.id + '/file',
            filename: res.filename,
            type: res.type,
        };
        navigate('#/asset/' + asset.id + '/tool/' + toolRoute);
    }

    async function setAsDefault(res) {
        await fetch('/api/assets/' + asset.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail_resource_id: res.id }),
        });
        load();
    }

    async function duplicateResource(res) {
        await fetch('/api/assets/' + asset.id + '/resources/' + res.id + '/duplicate', {
            method: 'POST',
        });
        load();
    }

    async function renameResource(res) {
        const name = prompt('Rename resource:', res.filename);
        if (!name || !name.trim() || name.trim() === res.filename) return;
        await fetch('/api/assets/' + asset.id + '/resources/' + res.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: name.trim() }),
        });
        load();
    }

    async function deleteResource(res) {
        if (!confirm('Delete resource "' + res.filename + '"?')) return;
        await fetch('/api/assets/' + asset.id + '/resources/' + res.id, { method: 'DELETE' });
        load();
    }

    // ── Render a single view ──

    function renderView(view) {
        const id = asset.id;
        const item = el('div', 'view-item');

        // Header row
        const hdr = el('div', 'view-item-header');
        const info = el('div', 'view-item-info');

        const nameSpan = el('span', 'view-item-name');
        nameSpan.textContent = view.name;
        info.appendChild(nameSpan);

        const meta = el('span', 'view-item-meta');
        meta.textContent = `${view.frame_count} frames \u00B7 ${view.width}\u00D7${view.height} \u00B7 Loop #${view.ags_loop}`;
        info.appendChild(meta);

        const actions = el('div', 'view-item-actions');
        const viewMenuBtn = el('button', 'asset-menu-btn');
        viewMenuBtn.textContent = '\u2026';
        viewMenuBtn.title = 'View Actions';
        viewMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const items = [
                ['Preview', () => togglePreview(view, item)],
                null,
                ['Crop', () => launchViewTool(view, 'crop-image')],
                ['Resize', () => launchViewTool(view, 'resize-images')],
                ['Make Transparent', () => launchViewTool(view, 'make-transparent')],
                null,
                ['Rename', () => renameView(view)],
                ['Duplicate', () => duplicateView(view)],
                ['Export', () => { window.open('/api/assets/' + id + '/views/' + view.id + '/download', '_blank'); }],
                null,
                ['Delete', () => deleteView(view), true],
            ];
            buildContextMenu(items, viewMenuBtn);
        });
        actions.appendChild(viewMenuBtn);

        hdr.appendChild(info);
        hdr.appendChild(actions);
        item.appendChild(hdr);

        // Filmstrip
        const filmstrip = el('div', 'filmstrip library-filmstrip');
        for (let i = 1; i <= view.frame_count; i++) {
            const img = document.createElement('img');
            img.className = 'filmstrip-frame';
            img.src = '/api/assets/' + id + '/views/' + view.id + '/frames/frame_' + String(i).padStart(4, '0') + '.png';
            img.loading = 'lazy';
            filmstrip.appendChild(img);
        }
        item.appendChild(filmstrip);

        return item;
    }

    // ── Preview animation toggle ──

    function togglePreview(view, container) {
        const existing = container.querySelector('.view-preview-wrap');
        if (existing) {
            stopPreview(view.id);
            existing.remove();
            return;
        }

        const wrap = el('div', 'view-preview-wrap');
        const canvas = document.createElement('canvas');
        canvas.className = 'loop-preview-canvas';
        canvas.width = view.width;
        canvas.height = view.height;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        const ctx = canvas.getContext('2d');
        const images = [];
        let loaded = 0;

        for (let i = 1; i <= view.frame_count; i++) {
            const img = new Image();
            img.src = '/api/assets/' + asset.id + '/views/' + view.id + '/frames/frame_' + String(i).padStart(4, '0') + '.png';
            img.onload = () => {
                loaded++;
                if (loaded === view.frame_count) startAnim();
            };
            images.push(img);
        }

        function startAnim() {
            let idx = 0;
            const w = canvas.width, h = canvas.height;
            function tick() {
                ctx.clearRect(0, 0, w, h);
                // Checkerboard
                const size = 8;
                for (let y = 0; y < h; y += size) {
                    for (let x = 0; x < w; x += size) {
                        ctx.fillStyle = ((Math.floor(x / size) + Math.floor(y / size)) % 2) ? '#9B4DBA' : '#7B2D8E';
                        ctx.fillRect(x, y, size, size);
                    }
                }
                ctx.drawImage(images[idx], 0, 0);
                idx = (idx + 1) % images.length;
                previewTimers[view.id] = setTimeout(tick, view.delay || 100);
            }
            tick();
        }
    }

    function stopPreview(viewId) {
        if (previewTimers[viewId]) {
            clearTimeout(previewTimers[viewId]);
            delete previewTimers[viewId];
        }
    }

    function stopAllPreviews() {
        Object.keys(previewTimers).forEach(k => {
            clearTimeout(previewTimers[k]);
        });
        previewTimers = {};
    }

    // ── Render video ──

    function renderVideo(vid) {
        const row = el('div', 'resource-item');

        const nameSpan = el('span', 'resource-item-name');
        nameSpan.textContent = vid.name || vid.filename || 'Video';
        row.appendChild(nameSpan);

        row.appendChild(btn('Play', 'btn btn-secondary btn-small', () => {
            window.open('/api/assets/' + asset.id + '/videos/' + vid.id, '_blank');
        }));

        row.appendChild(btn('Delete', 'btn btn-secondary btn-small', async () => {
            if (!confirm('Delete this video?')) return;
            await fetch('/api/assets/' + asset.id + '/videos/' + vid.id, { method: 'DELETE' });
            load();
        }));

        return row;
    }

    // ── Actions ──

    async function renameAsset() {
        const name = prompt('Rename asset:', asset.name);
        if (!name || !name.trim() || name.trim() === asset.name) return;
        await fetch('/api/assets/' + asset.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
        });
        load();
    }

    async function deleteAsset() {
        if (!confirm('Delete "' + asset.name + '" and all its views/resources?')) return;
        await fetch('/api/assets/' + asset.id, { method: 'DELETE' });
        navigate('#/');
        if (window.projectHome) window.projectHome.loadAssets();
    }

    async function renameView(view) {
        const name = prompt('Rename view:', view.name);
        if (!name || !name.trim() || name.trim() === view.name) return;
        await fetch('/api/assets/' + asset.id + '/views/' + view.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
        });
        load();
    }

    async function duplicateView(view) {
        await fetch('/api/assets/' + asset.id + '/views/' + view.id + '/duplicate', { method: 'POST' });
        load();
    }

    async function deleteView(view) {
        if (!confirm('Delete view "' + view.name + '"?')) return;
        await fetch('/api/assets/' + asset.id + '/views/' + view.id, { method: 'DELETE' });
        load();
    }

    function uploadNewView() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.png';
        input.multiple = true;
        input.addEventListener('change', async () => {
            if (!input.files.length) return;
            const name = prompt('View name:', 'Untitled View');
            if (!name || !name.trim()) return;

            const fd = new FormData();
            fd.append('name', name.trim());
            Array.from(input.files)
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(f => fd.append('frames', f));

            await fetch('/api/assets/' + asset.id + '/views', {
                method: 'POST',
                body: fd,
            });
            load();
        });
        input.click();
    }

    function uploadResource() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mp4,.webm,.mov,.avi,.mkv,.png,.jpg,.jpeg,.webp,.gif,.wav,.mp3,.ogg';
        input.multiple = true;
        input.addEventListener('change', async () => {
            if (!input.files.length) return;
            for (const file of input.files) {
                const fd = new FormData();
                fd.append('file', file);
                await fetch('/api/assets/' + asset.id + '/resources', {
                    method: 'POST',
                    body: fd,
                });
            }
            load();
        });
        input.click();
    }

    // ── Helpers ──

    function el(tag, className) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        return e;
    }

    function btn(label, className, onclick) {
        const b = document.createElement('button');
        b.className = className;
        b.textContent = label;
        b.addEventListener('click', onclick);
        return b;
    }

    function sectionTitle(text) {
        const h = document.createElement('h3');
        h.textContent = text;
        return h;
    }

    // ── Auto-load on panel activation ──

    const observer = new MutationObserver(() => {
        if (panel.classList.contains('active')) {
            load();
        } else {
            stopAllPreviews();
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    window.assetDetail = { load };
})();
