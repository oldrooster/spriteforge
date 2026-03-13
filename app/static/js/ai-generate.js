(function () {
    const canvas = document.getElementById('ai-generate-canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrap = document.getElementById('ai-generate-canvas-wrap');
    const emptyState = document.getElementById('ai-generate-empty');
    const modelSelect = document.getElementById('ai-generate-model');
    const promptInput = document.getElementById('ai-generate-prompt');
    const generateBtn = document.getElementById('ai-generate-btn');
    const progress = document.getElementById('ai-generate-progress');
    const refineSection = document.getElementById('ai-generate-refine-section');
    const refinePrompt = document.getElementById('ai-generate-refine-prompt');
    const refineBtn = document.getElementById('ai-generate-refine-btn');
    const actionsSection = document.getElementById('ai-generate-actions');
    const saveBtn = document.getElementById('ai-generate-save-btn');
    const downloadBtn = document.getElementById('ai-generate-download-btn');
    const historyStrip = document.getElementById('ai-generate-history');
    const errorEl = document.getElementById('ai-generate-error');

    // Prompt dropdown elements
    const promptSearch = document.getElementById('ai-generate-prompt-search');
    const promptDropdown = document.getElementById('ai-generate-prompt-dropdown');
    const savePromptBtn = document.getElementById('ai-generate-save-prompt-btn');

    let sessionId = null;
    let currentImageUrl = null;
    let history = [];
    let prompts = [];

    // Load models and prompts on first activation
    let modelsLoaded = false;
    const toolPanel = document.getElementById('tool-ai-generate');
    const observer = new MutationObserver(async () => {
        if (toolPanel.classList.contains('active')) {
            if (!modelsLoaded) {
                loadModels();
                loadPrompts();
                modelsLoaded = true;
            }
            // Phase C: consume pending resource from context menu
            if (state.pendingToolResource) {
                const pending = state.pendingToolResource;
                state.pendingToolResource = null;
                try {
                    const resp = await fetch(pending.resource_url);
                    referenceBlob = await resp.blob();
                    refImg.src = URL.createObjectURL(referenceBlob);
                    refPreview.hidden = false;
                    refClearBtn.hidden = false;
                } catch (e) {
                    showError('Failed to load reference image');
                }
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    async function loadModels() {
        try {
            const resp = await fetch('/api/ai-generate/models');
            const data = await resp.json();
            modelSelect.innerHTML = '';
            data.models.forEach(function (m) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                if (m.default) opt.selected = true;
                modelSelect.appendChild(opt);
            });
        } catch (e) {
            showError('Failed to load models');
        }
    }

    // Reference image handling
    const refUpload = document.getElementById('ai-generate-ref-upload');
    const refLibraryBtn = document.getElementById('ai-generate-ref-library-btn');
    const refClearBtn = document.getElementById('ai-generate-ref-clear-btn');
    const refPreview = document.getElementById('ai-generate-ref-preview');
    const refImg = document.getElementById('ai-generate-ref-img');

    let referenceBlob = null;

    refUpload.addEventListener('change', function () {
        if (refUpload.files.length > 0) {
            referenceBlob = refUpload.files[0];
            refImg.src = URL.createObjectURL(referenceBlob);
            refPreview.hidden = false;
            refClearBtn.hidden = false;
        }
        refUpload.value = '';
    });

    refLibraryBtn.addEventListener('click', function () {
        if (typeof window.openLibraryModal !== 'function') return;
        window.openLibraryModal({
            mode: 'loops',
            title: 'Select Reference Image',
            onSelect: async function (result) {
                var loop = result.items[0];
                var sprite = result.sprite;
                var imgUrl = '/api/assets/' + sprite.id + '/views/' + loop.id + '/frames/frame_0001.png';
                try {
                    var resp = await fetch(imgUrl);
                    referenceBlob = await resp.blob();
                    refImg.src = URL.createObjectURL(referenceBlob);
                    refPreview.hidden = false;
                    refClearBtn.hidden = false;
                } catch (e) {
                    showError('Failed to load reference image');
                }
            },
        });
    });

    refClearBtn.addEventListener('click', function () {
        referenceBlob = null;
        refPreview.hidden = true;
        refClearBtn.hidden = true;
        refImg.src = '';
    });

    // Paste image from clipboard
    document.addEventListener('paste', function (e) {
        var panel = document.getElementById('tool-ai-generate');
        if (!panel || !panel.classList.contains('active')) return;

        var items = (e.clipboardData || {}).items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                referenceBlob = items[i].getAsFile();
                refImg.src = URL.createObjectURL(referenceBlob);
                refPreview.hidden = false;
                refClearBtn.hidden = false;
                return;
            }
        }
    });

    // ── Prompt Library (filterable dropdown) ──
    async function loadPrompts() {
        try {
            var resp = await fetch('/api/ai-generate/prompts');
            var data = await resp.json();
            // Filter to image/both prompts
            prompts = data.prompts.filter(function (p) {
                return !p.gen_type || p.gen_type === 'image' || p.gen_type === 'both';
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
                body: JSON.stringify({ name: name.trim(), prompt: text, category: 'characters', gen_type: 'image' }),
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

    // Generate
    generateBtn.addEventListener('click', async function () {
        var prompt = promptInput.value.trim();
        if (!prompt) return;

        generateBtn.disabled = true;
        progress.hidden = false;
        errorEl.hidden = true;

        try {
            var resp;
            if (referenceBlob) {
                var formData = new FormData();
                formData.append('prompt', prompt);
                formData.append('model', modelSelect.value);
                formData.append('reference_image', referenceBlob, 'reference.png');
                if (state.currentAssetId) formData.append('asset_id', state.currentAssetId);
                resp = await fetch('/api/ai-generate', {
                    method: 'POST',
                    body: formData,
                });
            } else {
                resp = await fetch('/api/ai-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        model: modelSelect.value,
                        asset_id: state.currentAssetId || '',
                    }),
                });
            }
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Generation failed');

            sessionId = data.session_id;
            history = data.history;
            displayImage(data.image_url);
            renderHistory();

            refineSection.hidden = false;
            actionsSection.hidden = false;
            emptyState.hidden = true;
            canvasWrap.hidden = false;
        } catch (err) {
            showError(err.message);
        } finally {
            generateBtn.disabled = false;
            progress.hidden = true;
        }
    });

    // Refine
    refineBtn.addEventListener('click', async function () {
        var prompt = refinePrompt.value.trim();
        if (!prompt || !sessionId) return;

        refineBtn.disabled = true;
        progress.hidden = false;
        errorEl.hidden = true;

        try {
            var lastImage = history[history.length - 1].image;
            var resp = await fetch('/api/ai-generate/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    prompt: prompt,
                    model: modelSelect.value,
                    reference_image: lastImage,
                    asset_id: state.currentAssetId || '',
                }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Refinement failed');

            history = data.history;
            displayImage(data.image_url);
            renderHistory();
            refinePrompt.value = '';
        } catch (err) {
            showError(err.message);
        } finally {
            refineBtn.disabled = false;
            progress.hidden = true;
        }
    });

    function displayImage(url) {
        currentImageUrl = url;
        var img = new Image();
        img.onload = function () {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
        };
        img.src = url;
    }

    function renderHistory() {
        historyStrip.innerHTML = '';
        history.forEach(function (entry, i) {
            var thumb = document.createElement('img');
            thumb.src = '/api/ai-generate/image/' + sessionId + '/' + entry.image;
            thumb.title = entry.prompt;
            thumb.className = 'ai-history-thumb' + (i === history.length - 1 ? ' active' : '');
            thumb.addEventListener('click', function () {
                displayImage(thumb.src);
                currentImageUrl = thumb.src;
                historyStrip.querySelectorAll('.ai-history-thumb').forEach(function (t, j) {
                    t.classList.toggle('active', j === i);
                });
            });
            historyStrip.appendChild(thumb);
        });
    }

    // Save to Sprite Library
    saveBtn.addEventListener('click', function () {
        if (!currentImageUrl) return;
        if (typeof window.openSaveModal !== 'function') return;

        window.openSaveModal({
            mode: 'resource',
            defaultName: 'AI Generated.png',
            onSave: async function (assetId, resourceName) {
                var imgResp = await fetch(currentImageUrl);
                var blob = await imgResp.blob();

                var filename = resourceName.endsWith('.png') ? resourceName : resourceName + '.png';
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

    // Edit in Markup - opens markup tool with current image, returns edited version as reference
    const markupBtn = document.getElementById('ai-generate-markup-btn');
    if (markupBtn) {
        markupBtn.addEventListener('click', async function () {
            if (!currentImageUrl) return;
            // Navigate to markup tool and load the image
            if (typeof window.markupTool === 'undefined') {
                showError('Markup tool not available');
                return;
            }
            // Set a callback so markup can return the edited image
            window.markupReturnToAiGenerate = async function (blob) {
                // Use the edited image as the reference image for next generation
                referenceBlob = blob;
                refImg.src = URL.createObjectURL(blob);
                refPreview.hidden = false;
                refClearBtn.hidden = false;
                // Navigate back to AI Generate
                navigate('#/asset/' + (state.currentAssetId || '') + '/tool/ai-generate');
            };
            navigate('#/asset/' + (state.currentAssetId || '') + '/tool/markup');
            // Wait for panel to activate, then load the image
            setTimeout(function () {
                window.markupTool.loadImageFromUrl(currentImageUrl, null);
            }, 100);
        });
    }

    // Download
    downloadBtn.addEventListener('click', function () {
        if (!currentImageUrl) return;
        var a = document.createElement('a');
        a.href = currentImageUrl;
        a.download = 'sprite.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }
})();
