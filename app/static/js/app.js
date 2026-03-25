const state = {
    currentStep: 0,
    videoId: null,
    sessionId: null,
    videoMeta: null,
    frames: [],
    transparentFrames: null,
    animationDelay: 100,
    currentAssetId: null,
    currentRoute: null,
    pendingToolView: null,
};

// ── Hash Router ──
const routeHistory = [];

function navigate(hash) {
    routeHistory.push(window.location.hash);
    window.location.hash = hash;
}

function navigateBack() {
    if (routeHistory.length > 0) {
        window.location.hash = routeHistory.pop();
    } else {
        window.location.hash = '#/';
    }
}

function parseRoute(hash) {
    const h = (hash || '#/').replace(/^#\/?/, '');
    if (!h || h === '/') {
        return { view: 'home' };
    }
    // #/asset/<id>/tool/<name>
    const toolMatch = h.match(/^asset\/([^/]+)\/tool\/(.+)$/);
    if (toolMatch) {
        return { view: 'tool', assetId: toolMatch[1], tool: toolMatch[2] };
    }
    // #/tool/<name> (standalone tool, no asset)
    const standaloneToolMatch = h.match(/^tool\/(.+)$/);
    if (standaloneToolMatch) {
        return { view: 'tool', assetId: null, tool: standaloneToolMatch[1] };
    }
    // #/asset/<id>
    const assetMatch = h.match(/^asset\/([^/]+)$/);
    if (assetMatch) {
        return { view: 'asset', assetId: assetMatch[1] };
    }
    return { view: 'home' };
}

// Map tool route names to panel IDs
const toolPanelMap = {
    'video-to-frames': 'tool-video-to-frames',
    'resize-images': 'tool-resize-images',
    'crop-image': 'tool-crop-image',
    'make-transparent': 'tool-make-transparent',
    'ai-generate': 'tool-ai-generate',
    'ai-animate': 'tool-ai-animate',
    'ai-music': 'tool-ai-music',
    'markup': 'tool-markup',
    'scene-map': 'tool-scene-map',
};

function applyRoute() {
    const route = parseRoute(window.location.hash);
    state.currentRoute = route;

    // Hide all panels first
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('project-home').classList.remove('active');
    document.getElementById('asset-detail').classList.remove('active');

    if (route.view === 'home') {
        state.currentAssetId = null;
        document.getElementById('project-home').classList.add('active');
    } else if (route.view === 'asset') {
        state.currentAssetId = route.assetId;
        document.getElementById('asset-detail').classList.add('active');
    } else if (route.view === 'tool') {
        state.currentAssetId = route.assetId || null;
        const panelId = toolPanelMap[route.tool];
        if (panelId) {
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.classList.add('active');
                // Re-trigger V2F wizard step so MutationObservers fire
                if (route.tool === 'video-to-frames') {
                    showStep(state.currentStep);
                }
            }
        }
    }
}

window.addEventListener('hashchange', applyRoute);

// Set default hash if none
if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
    window.location.hash = '#/';
}
// Initial route on page load
applyRoute();

// ── Global asset search dropdown ──
(function () {
    const searchInput = document.getElementById('header-search');
    if (!searchInput) return;

    let allAssets = [];
    let selectedIdx = -1;
    let dropdownVisible = false;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    dropdown.hidden = true;
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(dropdown);

    async function fetchAssets() {
        try {
            const resp = await fetch('/api/projects/default/assets');
            allAssets = await resp.json();
        } catch (e) {
            allAssets = [];
        }
    }

    function filterAssets(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return allAssets.filter(a => {
            const searchable = (a.name + ' ' + (a.tags || []).join(' ') + ' ' + (a.category || '')).toLowerCase();
            return searchable.includes(q);
        }).slice(0, 8);
    }

    function renderDropdown(results) {
        dropdown.innerHTML = '';
        if (results.length === 0) {
            dropdown.hidden = true;
            dropdownVisible = false;
            return;
        }
        results.forEach(function (a, i) {
            const item = document.createElement('div');
            item.className = 'search-dropdown-item' + (i === selectedIdx ? ' selected' : '');

            const thumb = document.createElement('img');
            thumb.src = '/api/assets/' + a.id + '/thumbnail';
            thumb.className = 'search-dropdown-thumb';
            item.appendChild(thumb);

            const info = document.createElement('div');
            info.className = 'search-dropdown-info';

            const name = document.createElement('div');
            name.className = 'search-dropdown-name';
            name.textContent = a.name;
            info.appendChild(name);

            const meta = document.createElement('div');
            meta.className = 'search-dropdown-meta';
            meta.textContent = a.category || '';
            info.appendChild(meta);

            item.appendChild(info);
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectAsset(a);
            });
            dropdown.appendChild(item);
        });
        dropdown.hidden = false;
        dropdownVisible = true;
    }

    function selectAsset(a) {
        searchInput.value = '';
        dropdown.hidden = true;
        dropdownVisible = false;
        selectedIdx = -1;
        navigate('#/asset/' + a.id);
    }

    searchInput.addEventListener('focus', function () {
        fetchAssets().then(function () {
            var q = searchInput.value.trim();
            if (q) renderDropdown(filterAssets(q));
        });
    });

    searchInput.addEventListener('input', function () {
        selectedIdx = -1;
        var q = searchInput.value.trim();
        if (!q) {
            dropdown.hidden = true;
            dropdownVisible = false;
            return;
        }
        if (allAssets.length === 0) {
            fetchAssets().then(function () {
                renderDropdown(filterAssets(q));
            });
        } else {
            renderDropdown(filterAssets(q));
        }
    });

    searchInput.addEventListener('keydown', function (e) {
        var results = filterAssets(searchInput.value.trim());
        if (!dropdownVisible || results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, results.length - 1);
            renderDropdown(results);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            renderDropdown(results);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIdx >= 0 && selectedIdx < results.length) {
                selectAsset(results[selectedIdx]);
            } else if (results.length === 1) {
                selectAsset(results[0]);
            }
        } else if (e.key === 'Escape') {
            dropdown.hidden = true;
            dropdownVisible = false;
            searchInput.blur();
        }
    });

    searchInput.addEventListener('blur', function () {
        setTimeout(function () {
            dropdown.hidden = true;
            dropdownVisible = false;
        }, 150);
    });
})();

// ── Wizard step navigation (Video to Frames) ──
const stepIds = ['step-upload', 'step-extract', 'step-preview', 'step-transparency'];
const stepComplete = [false, false, false, false];

function showStep(index) {
    if (index < 0 || index >= stepIds.length) return;
    state.currentStep = index;

    document.querySelectorAll('.step-section').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });

    document.querySelectorAll('.step-dot').forEach((el, i) => {
        el.classList.toggle('active', i === index);
        el.classList.toggle('completed', i < index);
    });

    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').disabled = !stepComplete[index] || index === stepIds.length - 1;
}

function completeStep(index) {
    stepComplete[index] = true;
    if (index === state.currentStep) {
        document.getElementById('next-btn').disabled = index === stepIds.length - 1;
    }
}

document.getElementById('prev-btn').addEventListener('click', () => {
    showStep(state.currentStep - 1);
});

document.getElementById('next-btn').addEventListener('click', () => {
    showStep(state.currentStep + 1);
});
