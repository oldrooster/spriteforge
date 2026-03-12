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

    const promptSamples = document.getElementById('ai-generate-samples');
    const addPromptBtn = document.getElementById('ai-generate-add-prompt-btn');
    const promptEditor = document.getElementById('ai-prompt-editor');
    const promptEditorName = document.getElementById('ai-prompt-editor-name');
    const promptEditorText = document.getElementById('ai-prompt-editor-text');
    const promptEditorSave = document.getElementById('ai-prompt-editor-save');
    const promptEditorCancel = document.getElementById('ai-prompt-editor-cancel');

    let sessionId = null;
    let currentImageUrl = null;
    let history = [];
    let prompts = [];
    let editingPromptId = null; // null = adding new, string = editing existing

    // Load models and prompts on first activation
    let modelsLoaded = false;
    const toolPanel = document.getElementById('tool-ai-generate');
    const observer = new MutationObserver(() => {
        if (toolPanel.classList.contains('active') && !modelsLoaded) {
            loadModels();
            loadPrompts();
            modelsLoaded = true;
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

    let referenceBlob = null; // File or Blob of the reference image

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
        // Only handle if the AI Generate panel is visible
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

    // ── Prompt Library ──
    async function loadPrompts() {
        try {
            var resp = await fetch('/api/ai-generate/prompts');
            var data = await resp.json();
            prompts = data.prompts;
            renderPrompts();
        } catch (e) {
            console.error('Failed to load prompts:', e);
        }
    }

    function renderPrompts() {
        promptSamples.innerHTML = '';
        prompts.forEach(function (p) {
            var item = document.createElement('div');
            item.className = 'prompt-item';
            item.title = p.prompt;

            var name = document.createElement('span');
            name.className = 'prompt-item-name';
            name.textContent = p.name;

            var actions = document.createElement('div');
            actions.className = 'prompt-item-actions';

            var editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.title = 'Edit prompt';
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                openEditor(p.id, p.name, p.prompt);
            });

            var deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Del';
            deleteBtn.title = 'Delete prompt';
            deleteBtn.className = 'prompt-delete-btn';
            deleteBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                deletePrompt(p.id);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(name);
            item.appendChild(actions);

            item.addEventListener('click', function () {
                promptInput.value = p.prompt;
            });

            promptSamples.appendChild(item);
        });
    }

    function openEditor(id, name, text) {
        editingPromptId = id || null;
        promptEditorName.value = name || '';
        promptEditorText.value = text || '';
        promptEditor.hidden = false;
        promptEditorName.focus();
    }

    function closeEditor() {
        editingPromptId = null;
        promptEditorName.value = '';
        promptEditorText.value = '';
        promptEditor.hidden = true;
    }

    addPromptBtn.addEventListener('click', function () {
        openEditor(null, '', '');
    });

    promptEditorCancel.addEventListener('click', closeEditor);

    promptEditorSave.addEventListener('click', async function () {
        var name = promptEditorName.value.trim();
        var text = promptEditorText.value.trim();
        if (!name || !text) return;

        promptEditorSave.disabled = true;
        try {
            var resp;
            if (editingPromptId) {
                resp = await fetch('/api/ai-generate/prompts/' + editingPromptId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, prompt: text }),
                });
            } else {
                resp = await fetch('/api/ai-generate/prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, prompt: text }),
                });
            }
            if (!resp.ok) {
                var err = await resp.json();
                throw new Error(err.error || 'Save failed');
            }
            closeEditor();
            await loadPrompts();
        } catch (e) {
            showError(e.message);
        } finally {
            promptEditorSave.disabled = false;
        }
    });

    async function deletePrompt(id) {
        if (!confirm('Delete this prompt?')) return;
        try {
            var resp = await fetch('/api/ai-generate/prompts/' + id, { method: 'DELETE' });
            if (!resp.ok) {
                var err = await resp.json();
                throw new Error(err.error || 'Delete failed');
            }
            await loadPrompts();
        } catch (e) {
            showError(e.message);
        }
    }

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
            defaultViewName: 'AI Generated',
            onSave: async function (assetId, viewName) {
                // Fetch the current image as a blob
                var imgResp = await fetch(currentImageUrl);
                var blob = await imgResp.blob();

                var formData = new FormData();
                formData.append('name', viewName);
                formData.append('delay', 100);
                formData.append('frames', blob, 'frame_0001.png');

                var resp = await fetch('/api/assets/' + assetId + '/views', {
                    method: 'POST',
                    body: formData,
                });
                var data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Failed to save');
            },
        });
    });

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
