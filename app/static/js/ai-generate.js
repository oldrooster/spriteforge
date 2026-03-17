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

    const MAX_REFS = 4;

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
            // Consume prompt from chat assistant
            if (window.pendingChatPrompt) {
                promptInput.value = window.pendingChatPrompt;
                window.pendingChatPrompt = null;
            }
            // Consume reference blob from markup tool
            if (window.pendingReferenceBlob) {
                addReferenceBlob(window.pendingReferenceBlob);
                window.pendingReferenceBlob = null;
            }
            // Consume pending resource from context menu
            if (state.pendingToolResource) {
                const pending = state.pendingToolResource;
                state.pendingToolResource = null;
                try {
                    const resp = await fetch(pending.resource_url);
                    var blob = await resp.blob();
                    addReferenceBlob(blob);
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

    // ── Multiple Reference Images ──
    const refUpload = document.getElementById('ai-generate-ref-upload');
    const refLibraryBtn = document.getElementById('ai-generate-ref-library-btn');
    const refClearBtn = document.getElementById('ai-generate-ref-clear-btn');
    const refGrid = document.getElementById('ai-generate-ref-grid');
    const refControls = document.getElementById('ai-generate-ref-controls');

    let referenceBlobs = [];

    function addReferenceBlob(blob) {
        if (referenceBlobs.length >= MAX_REFS) {
            showError('Maximum ' + MAX_REFS + ' reference images allowed');
            return;
        }
        referenceBlobs.push(blob);
        renderRefGrid();
    }

    function removeReference(index) {
        referenceBlobs.splice(index, 1);
        renderRefGrid();
    }

    function clearAllReferences() {
        referenceBlobs = [];
        renderRefGrid();
    }

    function renderRefGrid() {
        refGrid.innerHTML = '';
        referenceBlobs.forEach(function (blob, i) {
            var item = document.createElement('div');
            item.className = 'ai-ref-item';

            var img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.alt = 'Reference ' + (i + 1);
            item.appendChild(img);

            var removeBtn = document.createElement('button');
            removeBtn.className = 'ai-ref-item-remove';
            removeBtn.textContent = '\u00D7';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                removeReference(i);
            });
            item.appendChild(removeBtn);

            refGrid.appendChild(item);
        });

        refClearBtn.hidden = referenceBlobs.length === 0;

        // Hide upload controls if at max
        if (referenceBlobs.length >= MAX_REFS) {
            refUpload.closest('label').hidden = true;
            refLibraryBtn.hidden = true;
        } else {
            refUpload.closest('label').hidden = false;
            refLibraryBtn.hidden = false;
        }
    }

    refUpload.addEventListener('change', function () {
        for (var i = 0; i < refUpload.files.length; i++) {
            if (referenceBlobs.length >= MAX_REFS) break;
            addReferenceBlob(refUpload.files[i]);
        }
        refUpload.value = '';
    });

    refLibraryBtn.addEventListener('click', function () {
        if (typeof window.openLibraryModal !== 'function') return;
        window.openLibraryModal({
            mode: 'image-resources',
            title: 'Select Reference Image',
            onSelect: async function (result) {
                var resource = result.items[0];
                var sprite = result.sprite;
                var url = '/api/assets/' + sprite.id + '/resources/' + resource.id + '/file';
                try {
                    var resp = await fetch(url);
                    var blob = await resp.blob();
                    addReferenceBlob(blob);
                } catch (e) {
                    showError('Failed to load reference image');
                }
            },
        });
    });

    refClearBtn.addEventListener('click', function () {
        clearAllReferences();
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
                addReferenceBlob(items[i].getAsFile());
                return;
            }
        }
    });

    // ── Prompt Library (filterable dropdown) ──
    async function loadPrompts() {
        try {
            var resp = await fetch('/api/ai-generate/prompts');
            var data = await resp.json();
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
        var promptText = promptInput.value.trim();
        if (!promptText) return;

        generateBtn.disabled = true;
        progress.hidden = false;
        errorEl.hidden = true;

        try {
            var resp;
            if (referenceBlobs.length > 0) {
                var formData = new FormData();
                formData.append('prompt', promptText);
                formData.append('model', modelSelect.value);
                if (state.currentAssetId) formData.append('asset_id', state.currentAssetId);
                referenceBlobs.forEach(function (blob, i) {
                    formData.append('reference_images', blob, 'reference_' + i + '.png');
                });
                resp = await fetch('/api/ai-generate', {
                    method: 'POST',
                    body: formData,
                });
            } else {
                resp = await fetch('/api/ai-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: promptText,
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
        var promptText = refinePrompt.value.trim();
        if (!promptText || !sessionId) return;

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
                    prompt: promptText,
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

    // Edit in Markup
    const markupBtn = document.getElementById('ai-generate-markup-btn');
    if (markupBtn) {
        markupBtn.addEventListener('click', async function () {
            if (!currentImageUrl) return;
            if (typeof window.markupTool === 'undefined') {
                showError('Markup tool not available');
                return;
            }
            window.markupReturnToAiGenerate = async function (blob) {
                addReferenceBlob(blob);
                navigate('#/asset/' + (state.currentAssetId || '') + '/tool/ai-generate');
            };
            navigate('#/asset/' + (state.currentAssetId || '') + '/tool/markup');
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
