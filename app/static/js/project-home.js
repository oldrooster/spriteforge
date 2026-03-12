(function () {
    const panel = document.getElementById('project-home');
    const content = document.getElementById('project-home-content');
    const emptyEl = document.getElementById('project-home-empty');
    const headerSearch = document.getElementById('header-search');
    const headerNewBtn = document.getElementById('header-new-asset-btn');

    const CATEGORIES = ['all', 'characters', 'backgrounds', 'objects', 'ui', 'sounds'];

    let assets = [];
    let activeCategory = 'all';

    // ── Build DOM structure ──

    // Category tabs
    const tabsBar = document.createElement('div');
    tabsBar.className = 'category-tabs';
    CATEGORIES.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-tab' + (cat === 'all' ? ' active' : '');
        btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        btn.dataset.category = cat;
        btn.addEventListener('click', () => {
            activeCategory = cat;
            tabsBar.querySelectorAll('.category-tab').forEach(b => b.classList.toggle('active', b.dataset.category === cat));
            renderGrid();
        });
        tabsBar.appendChild(btn);
    });
    content.insertBefore(tabsBar, emptyEl);

    // Asset grid container
    const grid = document.createElement('div');
    grid.className = 'asset-grid';
    grid.id = 'asset-grid';
    content.insertBefore(grid, emptyEl);

    // ── Load assets ──

    async function loadAssets() {
        try {
            const resp = await fetch('/api/projects/default/assets');
            assets = await resp.json();
        } catch (e) {
            assets = [];
        }
        renderGrid();
    }

    // ── Render grid ──

    function renderGrid() {
        const query = headerSearch.value.toLowerCase().trim();
        let filtered = assets;

        if (activeCategory !== 'all') {
            filtered = filtered.filter(a => a.category === activeCategory);
        }
        if (query) {
            filtered = filtered.filter(a => {
                const searchable = (a.name + ' ' + (a.tags || []).join(' ')).toLowerCase();
                return searchable.includes(query);
            });
        }

        // Clear old cards
        grid.innerHTML = '';

        if (filtered.length === 0) {
            emptyEl.hidden = false;
            grid.hidden = true;
            return;
        }
        emptyEl.hidden = true;
        grid.hidden = false;

        filtered.forEach(a => {
            const card = document.createElement('div');
            card.className = 'asset-card';
            card.addEventListener('click', () => navigate('#/asset/' + a.id));

            const thumb = document.createElement('img');
            thumb.src = `/api/assets/${a.id}/thumbnail?t=${Date.now()}`;
            thumb.alt = a.name;
            thumb.loading = 'lazy';

            const name = document.createElement('div');
            name.className = 'asset-card-name';
            name.textContent = a.name;

            const meta = document.createElement('div');
            meta.className = 'asset-card-meta';

            const badge = document.createElement('span');
            badge.className = 'asset-category-badge category-' + a.category;
            badge.textContent = a.category;

            const views = a.view_count || 0;
            const viewText = document.createElement('span');
            viewText.className = 'asset-card-info';
            viewText.textContent = `${views} view${views !== 1 ? 's' : ''}`;

            meta.appendChild(badge);
            meta.appendChild(viewText);

            card.appendChild(thumb);
            card.appendChild(name);
            card.appendChild(meta);
            grid.appendChild(card);
        });
    }

    headerSearch.addEventListener('input', renderGrid);

    // ── Create Asset Modal ──

    const modal = document.getElementById('create-asset-modal');
    const modalClose = document.getElementById('create-asset-close');
    const modalName = document.getElementById('create-asset-name');
    const modalCategory = document.getElementById('create-asset-category');
    const modalTags = document.getElementById('create-asset-tags');
    const modalConfirm = document.getElementById('create-asset-confirm');
    const modalStatus = document.getElementById('create-asset-status');

    headerNewBtn.addEventListener('click', () => {
        modalName.value = '';
        modalCategory.value = 'characters';
        modalTags.value = '';
        modalStatus.textContent = '';
        modal.hidden = false;
        modalName.focus();
    });

    modalClose.addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

    modalConfirm.addEventListener('click', async () => {
        const name = modalName.value.trim();
        if (!name) {
            modalStatus.textContent = 'Name is required';
            return;
        }

        const category = modalCategory.value;
        const tags = modalTags.value.split(',').map(t => t.trim()).filter(Boolean);

        modalConfirm.disabled = true;
        modalStatus.textContent = 'Creating...';

        try {
            const resp = await fetch('/api/projects/default/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category, tags }),
            });
            const asset = await resp.json();
            if (!resp.ok) throw new Error(asset.error);
            modal.hidden = true;
            await loadAssets();
            navigate('#/asset/' + asset.id);
        } catch (e) {
            modalStatus.textContent = 'Error: ' + e.message;
        } finally {
            modalConfirm.disabled = false;
        }
    });

    // Enter key submits
    modalName.addEventListener('keydown', (e) => { if (e.key === 'Enter') modalConfirm.click(); });
    modalTags.addEventListener('keydown', (e) => { if (e.key === 'Enter') modalConfirm.click(); });

    // ── Auto-load when panel becomes visible ──

    const observer = new MutationObserver(() => {
        if (panel.classList.contains('active')) {
            loadAssets();
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    // Expose for integration
    window.projectHome = { loadAssets };
})();
