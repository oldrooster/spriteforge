(function () {
    var promptInput = document.getElementById('ai-music-prompt');
    var negativePromptInput = document.getElementById('ai-music-negative-prompt');
    var generateBtn = document.getElementById('ai-music-btn');
    var progress = document.getElementById('ai-music-progress');
    var statusText = document.getElementById('ai-music-status-text');
    var emptyState = document.getElementById('ai-music-empty');
    var resultSection = document.getElementById('ai-music-result');
    var audioEl = document.getElementById('ai-music-audio');
    var actionsSection = document.getElementById('ai-music-actions');
    var saveBtn = document.getElementById('ai-music-save-btn');
    var downloadBtn = document.getElementById('ai-music-download-btn');
    var errorEl = document.getElementById('ai-music-error');
    var refinePrompt = document.getElementById('ai-music-refine-prompt');
    var refineBtn = document.getElementById('ai-music-refine-btn');
    var historyEl = document.getElementById('ai-music-history');

    var sessionId = null;
    var pollTimer = null;
    var history = []; // [{prompt, audio_url, session_id}]

    // Reset UI when panel is activated
    var toolPanel = document.getElementById('tool-ai-music');
    var observer = new MutationObserver(function () {
        if (toolPanel.classList.contains('active')) {
            resetUI();
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    function resetUI() {
        sessionId = null;
        history = [];
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        promptInput.value = '';
        negativePromptInput.value = '';
        generateBtn.disabled = false;
        progress.hidden = true;
        statusText.hidden = true;
        errorEl.hidden = true;
        emptyState.hidden = false;
        resultSection.hidden = true;
        actionsSection.hidden = true;
        audioEl.src = '';
        refinePrompt.value = '';
        historyEl.innerHTML = '';
    }

    function startGeneration(prompt) {
        generateBtn.disabled = true;
        if (refineBtn) refineBtn.disabled = true;
        progress.hidden = false;
        statusText.textContent = 'Generating music... this may take a minute';
        statusText.hidden = false;
        errorEl.hidden = true;

        return fetch('/api/ai-music', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                negative_prompt: negativePromptInput.value.trim(),
                asset_id: state.currentAssetId || '',
            }),
        }).then(function (resp) {
            return resp.json().then(function (data) {
                if (!resp.ok) throw new Error(data.error || 'Generation failed');
                sessionId = data.session_id;
                pollStatus(prompt);
            });
        }).catch(function (err) {
            showError(err.message);
            generateBtn.disabled = false;
            if (refineBtn) refineBtn.disabled = false;
            progress.hidden = true;
            statusText.hidden = true;
        });
    }

    generateBtn.addEventListener('click', function () {
        var prompt = promptInput.value.trim();
        if (!prompt) return;
        startGeneration(prompt);
    });

    refineBtn.addEventListener('click', function () {
        var prompt = refinePrompt.value.trim();
        if (!prompt) return;
        startGeneration(prompt);
    });

    function pollStatus(prompt) {
        fetch('/api/ai-music/status/' + sessionId).then(function (resp) {
            return resp.json();
        }).then(function (data) {
            if (data.status === 'completed') {
                progress.hidden = true;
                statusText.hidden = true;
                generateBtn.disabled = false;
                if (refineBtn) refineBtn.disabled = false;
                emptyState.hidden = true;
                audioEl.src = data.audio_url;
                resultSection.hidden = false;
                actionsSection.hidden = false;

                // Pre-fill refine prompt with current prompt
                refinePrompt.value = prompt;

                // Add to history
                history.push({ prompt: prompt, audio_url: data.audio_url, session_id: sessionId });
                renderHistory();
            } else if (data.status === 'failed') {
                throw new Error(data.error || 'Generation failed');
            } else {
                pollTimer = setTimeout(function () { pollStatus(prompt); }, 3000);
            }
        }).catch(function (err) {
            showError(err.message);
            generateBtn.disabled = false;
            if (refineBtn) refineBtn.disabled = false;
            progress.hidden = true;
            statusText.hidden = true;
        });
    }

    function renderHistory() {
        historyEl.innerHTML = '';
        if (history.length <= 1) return;

        var label = document.createElement('label');
        label.textContent = 'Previous Generations';
        historyEl.appendChild(label);

        history.forEach(function (item, idx) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;';

            var num = document.createElement('span');
            num.className = 'hint';
            num.textContent = '#' + (idx + 1);
            num.style.minWidth = '24px';
            row.appendChild(num);

            var playBtn = document.createElement('button');
            playBtn.className = 'btn btn-secondary btn-small';
            playBtn.textContent = (idx === history.length - 1) ? 'Playing' : 'Play';
            playBtn.disabled = (idx === history.length - 1);
            playBtn.addEventListener('click', function () {
                audioEl.src = item.audio_url;
                audioEl.play();
                sessionId = item.session_id;
                historyEl.querySelectorAll('button').forEach(function (b) {
                    b.textContent = 'Play';
                    b.disabled = false;
                });
                playBtn.textContent = 'Playing';
                playBtn.disabled = true;
            });
            row.appendChild(playBtn);

            var promptSpan = document.createElement('span');
            promptSpan.className = 'hint';
            promptSpan.textContent = item.prompt.length > 50 ? item.prompt.substring(0, 50) + '...' : item.prompt;
            promptSpan.title = item.prompt;
            row.appendChild(promptSpan);

            historyEl.appendChild(row);
        });
    }

    // Save audio to asset library via save modal
    saveBtn.addEventListener('click', function () {
        if (!sessionId) return;
        if (typeof window.openSaveModal !== 'function') return;

        window.openSaveModal({
            mode: 'resource',
            defaultName: 'AI Music.wav',
            onSave: async function (assetId, resourceName) {
                var audioUrl = '/api/ai-music/audio/' + sessionId + '/output.wav';
                var audioResp = await fetch(audioUrl);
                var blob = await audioResp.blob();

                var filename = resourceName.endsWith('.wav') ? resourceName : resourceName + '.wav';
                var formData = new FormData();
                formData.append('file', blob, filename);

                var resp = await fetch('/api/assets/' + assetId + '/resources', {
                    method: 'POST',
                    body: formData,
                });
                var data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Failed to save');
            },
        });
    });

    // Download audio
    downloadBtn.addEventListener('click', function () {
        if (!sessionId) return;
        window.location.href = '/api/ai-music/audio/' + sessionId + '/output.wav';
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }
})();
