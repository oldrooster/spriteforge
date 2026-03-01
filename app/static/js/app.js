const state = {
    currentStep: 0,
    videoId: null,
    sessionId: null,
    videoMeta: null,
    frames: [],
    transparentFrames: null,
    animationDelay: 100,
};

// ── Top-level tool navigation ──
let activeTool = 'video-to-frames';

function showTool(toolId) {
    activeTool = toolId;

    document.querySelectorAll('.tool-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tool-${toolId}`);
    });

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tool === toolId);
    });

    // Re-trigger current step's active class so MutationObservers fire
    if (toolId === 'video-to-frames') {
        showStep(state.currentStep);
    }
}

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
        showTool(item.dataset.tool);
    });
});

// Sidebar collapse
const sidebar = document.getElementById('sidebar');
const collapseBtn = document.getElementById('sidebar-collapse-btn');

collapseBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

// Mobile sidebar toggle
const sidebarToggle = document.getElementById('sidebar-toggle');
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
});

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
