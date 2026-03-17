(function () {
    const selectBtn = document.getElementById('ai-animate-select-btn');
    const dropzone = document.getElementById('ai-animate-dropzone');
    const sourceWrap = document.getElementById('ai-animate-source-wrap');
    const startImg = document.getElementById('ai-animate-start-img');
    const endImg = document.getElementById('ai-animate-end-img');
    const endPlaceholder = document.getElementById('ai-animate-end-placeholder');
    const endPreview = document.getElementById('ai-animate-end-preview');
    const sourceInfo = document.getElementById('ai-animate-source-info');
    const modelSelect = document.getElementById('ai-animate-model');
    const promptInput = document.getElementById('ai-animate-prompt');
    const animateBtn = document.getElementById('ai-animate-btn');
    const progress = document.getElementById('ai-animate-progress');
    const statusText = document.getElementById('ai-animate-status-text');
    const resultSection = document.getElementById('ai-animate-result');
    const videoEl = document.getElementById('ai-animate-video');
    const actionsSection = document.getElementById('ai-animate-actions');
    const saveBtn = document.getElementById('ai-animate-save-btn');
    const downloadBtn = document.getElementById('ai-animate-download-btn');
    const errorEl = document.getElementById('ai-animate-error');

    // Start/End frame buttons
    const startMarkupBtn = document.getElementById('ai-animate-start-markup-btn');
    const startChangeBtn = document.getElementById('ai-animate-start-change-btn');
    const endMarkupBtn = document.getElementById('ai-animate-end-markup-btn');
    const endChangeBtn = document.getElementById('ai-animate-end-change-btn');
    const endRemoveBtn = document.getElementById('ai-animate-end-remove-btn');
    const swapBtn = document.getElementById('ai-animate-swap-btn');

    // Prompt dropdown elements
    const promptSearch = document.getElementById('ai-animate-prompt-search');
    const promptDropdown = document.getElementById('ai-animate-prompt-dropdown');
    const savePromptBtn = document.getElementById('ai-animate-save-prompt-btn');

    let selectedSprite = null;
    let sessionId = null;
    let pollTimer = null;
    let prompts = [];

    // Track start/end frame data — always blob-based now
    let startFrameBlob = null;
    let startFrameSrc = null;   // URL string (for img src when no blob)
    let endFrameBlob = null;
    let endFrameSrc = null;
    let hasEndFrame = false;

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
            // Consume pending resource from context menu
            if (state.pendingToolResource) {
                var pending = state.pendingToolResource;
                state.pendingToolResource = null;
                selectedSprite = {
                    asset_id: pending.asset_id,
                    asset_name: pending.filename,
                    resource_id: pending.resource_id,
                };
                startFrameBlob = null;
                startFrameSrc = pending.resource_url;
                startImg.src = pending.resource_url;
                sourceWrap.hidden = false;
                dropzone.hidden = true;
                sourceInfo.textContent = pending.filename;
                animateBtn.disabled = false;
                document.getElementById('ai-animate-frame-picker').innerHTML = '';
            }
            // Consume markup result for start or end frame
            if (window.pendingAnimateMarkupBlob) {
                var target = window.pendingAnimateMarkupTarget || 'start';
                var blob = window.pendingAnimateMarkupBlob;
                window.pendingAnimateMarkupBlob = null;
                window.pendingAnimateMarkupTarget = null;

                if (target === 'start') {
                    startFrameBlob = blob;
                    startFrameSrc = null;
                    startImg.src = URL.createObjectURL(blob);
                } else {
                    setEndFrame(blob, null);
                }
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    function setEndFrame(blob, src) {
        endFrameBlob = blob;
        endFrameSrc = src;
        endImg.src = blob ? URL.createObjectURL(blob) : src;
        endImg.hidden = false;
        endPlaceholder.hidden = true;
        endMarkupBtn.hidden = false;
        endChangeBtn.hidden = false;
        endRemoveBtn.hidden = false;
        hasEndFrame = true;
    }

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

    document.addEventListener('click', function (e) {
        if (!promptSearch.contains(e.target) && !promptDropdown.contains(e.target)) {
            promptDropdown.hidden = true;
        }
    });

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

    // Helper: open library modal to pick an image resource and return a blob
    function pickImageFromLibrary(callback) {
        if (typeof window.openLibraryModal !== 'function') return;

        window.openLibraryModal({
            mode: 'image-resources',
            title: 'Select Image',
            onSelect: async function (result) {
                var resource = result.items[0];
                var sprite = result.sprite;
                var url = '/api/assets/' + sprite.id + '/resources/' + resource.id + '/file';
                try {
                    var resp = await fetch(url);
                    var blob = await resp.blob();
                    callback(blob, url, sprite, resource);
                } catch (e) {
                    showError('Failed to load image');
                }
            },
        });
    }

    // Select source from library (sets start frame)
    selectBtn.addEventListener('click', function () {
        if (typeof window.openLibraryModal !== 'function') return;

        window.openLibraryModal({
            mode: 'image-resources',
            title: 'Select Start Image',
            onSelect: async function (result) {
                var resource = result.items[0];
                var sprite = result.sprite;
                var url = '/api/assets/' + sprite.id + '/resources/' + resource.id + '/file';

                selectedSprite = {
                    asset_id: sprite.id,
                    asset_name: sprite.name,
                    resource_id: resource.id,
                };

                startFrameBlob = null;
                startFrameSrc = url;
                startImg.src = url;
                sourceWrap.hidden = false;
                dropzone.hidden = true;
                sourceInfo.textContent = sprite.name + ' - ' + resource.filename;
                animateBtn.disabled = false;

                // Reset end frame
                clearEndFrame();

                // Clear filmstrip (not used for resources)
                framePicker.innerHTML = '';
            },
        });
    });

    // ── Start frame actions ──
    startChangeBtn.addEventListener('click', function () {
        pickImageFromLibrary(function (blob, url) {
            startFrameBlob = blob;
            startFrameSrc = null;
            startImg.src = URL.createObjectURL(blob);
        });
    });

    startMarkupBtn.addEventListener('click', function () {
        getFrameBlob('start', function (blob) {
            window.pendingAnimateMarkupTarget = 'start';
            window.markupReturnToAiAnimate = function (editedBlob) {
                window.pendingAnimateMarkupBlob = editedBlob;
                window.pendingAnimateMarkupTarget = 'start';
            };
            window.pendingToolResource = null;
            state.pendingToolView = null;

            window.pendingMarkupBlob = blob;
            if (state.currentAssetId) {
                navigate('#/asset/' + state.currentAssetId + '/tool/markup');
            } else {
                navigate('#/tool/markup');
            }
        });
    });

    // ── End frame actions ──
    endPlaceholder.addEventListener('click', function () {
        pickImageFromLibrary(function (blob, url) {
            setEndFrame(blob, null);
        });
    });

    endChangeBtn.addEventListener('click', function () {
        pickImageFromLibrary(function (blob, url) {
            setEndFrame(blob, null);
        });
    });

    endMarkupBtn.addEventListener('click', function () {
        getFrameBlob('end', function (blob) {
            window.pendingAnimateMarkupTarget = 'end';
            window.markupReturnToAiAnimate = function (editedBlob) {
                window.pendingAnimateMarkupBlob = editedBlob;
                window.pendingAnimateMarkupTarget = 'end';
            };
            window.pendingToolResource = null;
            state.pendingToolView = null;

            window.pendingMarkupBlob = blob;
            if (state.currentAssetId) {
                navigate('#/asset/' + state.currentAssetId + '/tool/markup');
            } else {
                navigate('#/tool/markup');
            }
        });
    });

    endRemoveBtn.addEventListener('click', function () {
        clearEndFrame();
    });

    // ── Swap start and end frames ──
    swapBtn.addEventListener('click', function () {
        if (!hasEndFrame) return;

        // Swap blobs
        var tmpBlob = startFrameBlob;
        var tmpSrc = startFrameSrc;
        startFrameBlob = endFrameBlob;
        startFrameSrc = endFrameSrc;
        endFrameBlob = tmpBlob;
        endFrameSrc = tmpSrc;

        // Swap visible images
        var startSrcVal = startImg.src;
        startImg.src = endImg.src;
        endImg.src = startSrcVal;
    });

    function clearEndFrame() {
        endFrameBlob = null;
        endFrameSrc = null;
        hasEndFrame = false;
        endImg.src = '';
        endImg.hidden = true;
        endPlaceholder.hidden = false;
        endMarkupBtn.hidden = true;
        endChangeBtn.hidden = true;
        endRemoveBtn.hidden = true;
    }

    // Helper to get a frame blob from its current src or stored blob
    function getFrameBlob(which, callback) {
        if (which === 'start' && startFrameBlob) {
            callback(startFrameBlob);
            return;
        }
        if (which === 'end' && endFrameBlob) {
            callback(endFrameBlob);
            return;
        }
        // Fetch from img src
        var img = which === 'start' ? startImg : endImg;
        fetch(img.src)
            .then(function (r) { return r.blob(); })
            .then(callback)
            .catch(function () { showError('Failed to load image'); });
    }

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
            // Always send as FormData — fetch start blob if needed
            var formData = new FormData();
            formData.append('prompt', promptInput.value.trim());
            formData.append('model', modelSelect.value);
            formData.append('duration', document.getElementById('ai-animate-duration').value);
            formData.append('asset_id', selectedSprite.asset_id);
            formData.append('generate_audio', document.getElementById('ai-animate-audio').checked ? 'true' : 'false');

            if (startFrameBlob) {
                formData.append('start_frame', startFrameBlob, 'start_frame.png');
            } else if (startFrameSrc) {
                // Fetch the image from URL and send as blob
                var startResp = await fetch(startFrameSrc);
                var startBlob = await startResp.blob();
                formData.append('start_frame', startBlob, 'start_frame.png');
            } else {
                formData.append('resource_id', selectedSprite.resource_id || '');
            }

            // End frame
            if (hasEndFrame) {
                if (endFrameBlob) {
                    formData.append('end_frame', endFrameBlob, 'end_frame.png');
                } else if (endFrameSrc) {
                    var endResp = await fetch(endFrameSrc);
                    var endBlob = await endResp.blob();
                    formData.append('end_frame', endBlob, 'end_frame.png');
                }
            }

            var resp = await fetch('/api/ai-animate', {
                method: 'POST',
                body: formData,
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

    // Save video to sprite library via save modal
    saveBtn.addEventListener('click', function () {
        if (!sessionId) return;
        if (typeof window.openSaveModal !== 'function') return;

        window.openSaveModal({
            mode: 'resource',
            defaultName: 'AI Animation.mp4',
            onSave: async function (assetId, resourceName) {
                var videoUrl = '/api/ai-animate/video/' + sessionId + '/output.mp4';
                var videoResp = await fetch(videoUrl);
                var blob = await videoResp.blob();

                var filename = resourceName.endsWith('.mp4') ? resourceName : resourceName + '.mp4';
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
