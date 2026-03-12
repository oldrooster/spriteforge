(function () {
    const selectBtn = document.getElementById('ai-animate-select-btn');
    const dropzone = document.getElementById('ai-animate-dropzone');
    const sourceWrap = document.getElementById('ai-animate-source-wrap');
    const sourceImg = document.getElementById('ai-animate-source-img');
    const sourceInfo = document.getElementById('ai-animate-source-info');
    const modelSelect = document.getElementById('ai-animate-model');
    const promptInput = document.getElementById('ai-animate-prompt');
    const animateBtn = document.getElementById('ai-animate-btn');
    const progress = document.getElementById('ai-animate-progress');
    const statusText = document.getElementById('ai-animate-status-text');
    const resultSection = document.getElementById('ai-animate-result');
    const videoEl = document.getElementById('ai-animate-video');
    const actionsSection = document.getElementById('ai-animate-actions');
    const videoNameInput = document.getElementById('ai-animate-video-name');
    const saveBtn = document.getElementById('ai-animate-save-btn');
    const downloadBtn = document.getElementById('ai-animate-download-btn');
    const errorEl = document.getElementById('ai-animate-error');

    // Prompt dropdown elements
    const promptSearch = document.getElementById('ai-animate-prompt-search');
    const promptDropdown = document.getElementById('ai-animate-prompt-dropdown');
    const savePromptBtn = document.getElementById('ai-animate-save-prompt-btn');

    let selectedSprite = null;
    let sessionId = null;
    let pollTimer = null;
    let prompts = [];

    // Load models and prompts on first activation
    let modelsLoaded = false;
    const toolPanel = document.getElementById('tool-ai-animate');
    const observer = new MutationObserver(async function () {
        if (toolPanel.classList.contains('active')) {
            if (!modelsLoaded) {
                loadModels();
                loadPrompts();
                modelsLoaded = true;
            }
            // Phase C: consume pending resource from context menu
            if (state.pendingToolResource) {
                var pending = state.pendingToolResource;
                state.pendingToolResource = null;
                selectedSprite = {
                    asset_id: pending.asset_id,
                    asset_name: pending.filename,
                    view_id: null,
                    view_name: pending.filename,
                    frame_index: 1,
                    frame_count: 1,
                };
                sourceImg.src = pending.resource_url;
                sourceWrap.hidden = false;
                dropzone.hidden = true;
                sourceInfo.textContent = pending.filename;
                animateBtn.disabled = false;
                framePicker.innerHTML = '';
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    async function loadModels() {
        try {
            var resp = await fetch('/api/ai-animate/models');
            var data = await resp.json();
            modelSelect.innerHTML = '';
            data.models.forEach(function (m) {
                var opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                if (m.default) opt.selected = true;
                modelSelect.appendChild(opt);
            });
        } catch (e) {
            showError('Failed to load models');
        }
    }

    // ── Prompt Library (filterable dropdown) ──
    async function loadPrompts() {
        try {
            var resp = await fetch('/api/ai-generate/prompts');
            var data = await resp.json();
            // Filter to video/both prompts
            prompts = data.prompts.filter(function (p) {
                return p.gen_type === 'video' || p.gen_type === 'both';
            });
        } catch (e) {
            console.error('Failed to load prompts:', e);
        }
    }

    function renderDropdown(filter) {
        promptDropdown.innerHTML = '';
        var query = (filter || '').toLowerCase();
        var filtered = prompts.filter(function (p) {
            return p.name.toLowerCase().includes(query) || p.prompt.toLowerCase().includes(query);
        });
        if (filtered.length === 0) {
            promptDropdown.innerHTML = '<div class="prompt-dropdown-empty">No matching prompts</div>';
            promptDropdown.hidden = false;
            return;
        }
        filtered.forEach(function (p) {
            var item = document.createElement('div');
            item.className = 'prompt-dropdown-item';

            var nameEl = document.createElement('div');
            nameEl.className = 'prompt-dropdown-item-name';
            nameEl.textContent = p.name;

            var textEl = document.createElement('div');
            textEl.className = 'prompt-dropdown-item-text';
            textEl.textContent = p.prompt;

            item.appendChild(nameEl);
            item.appendChild(textEl);

            item.addEventListener('click', function () {
                selectPrompt(p.prompt);
                promptDropdown.hidden = true;
                promptSearch.value = '';
            });

            promptDropdown.appendChild(item);
        });
        promptDropdown.hidden = false;
    }

    function selectPrompt(text) {
        var current = promptInput.value.trim();
        if (!current) {
            promptInput.value = text;
        } else {
            if (confirm('Replace current prompt? (Cancel to append)')) {
                promptInput.value = text;
            } else {
                promptInput.value = current + '\n' + text;
            }
        }
        promptInput.focus();
    }

    promptSearch.addEventListener('focus', function () {
        renderDropdown(promptSearch.value);
    });

    promptSearch.addEventListener('input', function () {
        renderDropdown(promptSearch.value);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (!promptSearch.contains(e.target) && !promptDropdown.contains(e.target)) {
            promptDropdown.hidden = true;
        }
    });

    // Save current prompt
    savePromptBtn.addEventListener('click', async function () {
        var text = promptInput.value.trim();
        if (!text) { showError('Enter a prompt first'); return; }

        var name = prompt('Prompt name:');
        if (!name || !name.trim()) return;

        savePromptBtn.disabled = true;
        try {
            var resp = await fetch('/api/ai-generate/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), prompt: text, category: 'characters', gen_type: 'video' }),
            });
            if (!resp.ok) {
                var err = await resp.json();
                throw new Error(err.error || 'Save failed');
            }
            await loadPrompts();
        } catch (e) {
            showError(e.message);
        } finally {
            savePromptBtn.disabled = false;
        }
    });

    const framePicker = document.getElementById('ai-animate-frame-picker');

    // Select sprite from library
    selectBtn.addEventListener('click', function () {
        if (typeof window.openLibraryModal !== 'function') return;

        window.openLibraryModal({
            mode: 'loops',
            title: 'Select Sprite to Animate',
            onSelect: function (result) {
                var loop = result.items[0];
                var sprite = result.sprite;
                selectedSprite = {
                    asset_id: sprite.id,
                    asset_name: sprite.name,
                    view_id: loop.id,
                    view_name: loop.name,
                    frame_index: 1,
                    frame_count: loop.frame_count || 1,
                };

                var baseUrl = '/api/assets/' + sprite.id + '/views/' + loop.id + '/frames/';
                sourceImg.src = baseUrl + 'frame_0001.png';
                sourceWrap.hidden = false;
                dropzone.hidden = true;
                sourceInfo.textContent = sprite.name + ' - ' + loop.name + ' (Frame 1 of ' + loop.frame_count + ')';
                animateBtn.disabled = false;

                // Build frame picker filmstrip
                framePicker.innerHTML = '';
                for (var i = 1; i <= loop.frame_count; i++) {
                    (function (idx) {
                        var frameName = 'frame_' + String(idx).padStart(4, '0') + '.png';
                        var thumb = document.createElement('img');
                        thumb.src = baseUrl + frameName;
                        thumb.className = 'filmstrip-frame' + (idx === 1 ? ' active' : '');
                        thumb.title = 'Frame ' + idx;
                        thumb.addEventListener('click', function () {
                            selectedSprite.frame_index = idx;
                            sourceImg.src = baseUrl + frameName;
                            sourceInfo.textContent = sprite.name + ' - ' + loop.name + ' (Frame ' + idx + ' of ' + loop.frame_count + ')';
                            framePicker.querySelectorAll('.filmstrip-frame').forEach(function (f) {
                                f.classList.remove('active');
                            });
                            thumb.classList.add('active');
                        });
                        framePicker.appendChild(thumb);
                    })(i);
                }
            },
        });
    });

    // Generate animation
    animateBtn.addEventListener('click', async function () {
        if (!selectedSprite || !promptInput.value.trim()) return;

        animateBtn.disabled = true;
        progress.hidden = false;
        statusText.hidden = false;
        errorEl.hidden = true;
        resultSection.hidden = true;
        actionsSection.hidden = true;

        try {
            var resp = await fetch('/api/ai-animate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptInput.value.trim(),
                    model: modelSelect.value,
                    duration: parseInt(document.getElementById('ai-animate-duration').value, 10),
                    asset_id: selectedSprite.asset_id,
                    view_id: selectedSprite.view_id,
                    frame_index: selectedSprite.frame_index,
                    generate_audio: document.getElementById('ai-animate-audio').checked,
                }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Generation failed');

            sessionId = data.session_id;
            pollStatus();
        } catch (err) {
            showError(err.message);
            animateBtn.disabled = false;
            progress.hidden = true;
            statusText.hidden = true;
        }
    });

    async function pollStatus() {
        try {
            var resp = await fetch('/api/ai-animate/status/' + sessionId);
            var data = await resp.json();

            if (data.status === 'completed') {
                progress.hidden = true;
                statusText.hidden = true;
                animateBtn.disabled = false;

                videoEl.src = data.video_url;
                resultSection.hidden = false;
                actionsSection.hidden = false;
            } else if (data.status === 'failed') {
                throw new Error(data.error || 'Generation failed');
            } else {
                pollTimer = setTimeout(pollStatus, 5000);
            }
        } catch (err) {
            showError(err.message);
            animateBtn.disabled = false;
            progress.hidden = true;
            statusText.hidden = true;
        }
    }

    // Save video to sprite library
    saveBtn.addEventListener('click', async function () {
        if (!sessionId || !selectedSprite) return;

        saveBtn.disabled = true;
        errorEl.hidden = true;

        try {
            var resp = await fetch('/api/ai-animate/save-video-to-library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    asset_id: selectedSprite.asset_id,
                    video_name: videoNameInput.value.trim() || 'AI Animation',
                }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to save');
            alert('Video saved to sprite library!');
        } catch (err) {
            showError(err.message);
        } finally {
            saveBtn.disabled = false;
        }
    });

    // Download video
    downloadBtn.addEventListener('click', function () {
        if (!sessionId) return;
        window.location.href = '/api/ai-animate/video/' + sessionId + '/output.mp4';
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }
})();
