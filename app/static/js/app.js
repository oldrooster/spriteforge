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
