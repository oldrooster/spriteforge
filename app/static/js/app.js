const state = {
    currentStep: 0,
    videoId: null,
    sessionId: null,
    videoMeta: null,
    frames: [],
    transparentFrames: null,
    animationDelay: 100,
};

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
