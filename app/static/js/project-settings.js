(function () {
    const modal = document.getElementById('project-settings-modal');
    const closeBtn = document.getElementById('project-settings-close');
    const saveBtn = document.getElementById('project-settings-save');
    const statusEl = document.getElementById('project-settings-status');
    const nameInput = document.getElementById('project-settings-name');
    const artStyleInput = document.getElementById('project-settings-art-style');
    const resWInput = document.getElementById('project-settings-res-w');
    const resHInput = document.getElementById('project-settings-res-h');
    const gearBtn = document.getElementById('header-settings-btn');

    // Tab switching
    const tabs = modal.querySelectorAll('.settings-tab');
    const tabContents = modal.querySelectorAll('.settings-tab-content');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.dataset.tab;
            tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === target); });
            tabContents.forEach(function (tc) {
                tc.classList.toggle('active', tc.id === 'settings-tab-' + target);
            });
            if (target === 'prompts') loadPromptLibrary();
        });
    });

    // Prompt Library CRUD
    const addPromptBtn = document.getElementById('settings-add-prompt-btn');
    const promptEditor = document.getElementById('settings-prompt-editor');
    const editorName = document.getElementById('settings-prompt-editor-name');
    const editorText = document.getElementById('settings-prompt-editor-text');
    const editorCategory = document.getElementById('settings-prompt-editor-category');
    const editorGenType = document.getElementById('settings-prompt-editor-gentype');
    const editorSave = document.getElementById('settings-prompt-editor-save');
    const editorCancel = document.getElementById('settings-prompt-editor-cancel');
    const promptList = document.getElementById('settings-prompt-list');

    let prompts = [];
    let editingId = null;

    async function loadPromptLibrary() {
        try {
            var resp = await fetch('/api/ai-generate/prompts');
            var data = await resp.json();
            prompts = data.prompts;
            renderPromptList();
        } catch (e) {
            promptList.innerHTML = '<div class="prompt-dropdown-empty">Failed to load prompts</div>';
        }
    }

    function renderPromptList() {
        promptList.innerHTML = '';
        if (prompts.length === 0) {
            promptList.innerHTML = '<div class="prompt-dropdown-empty">No prompts yet</div>';
            return;
        }
        prompts.forEach(function (p) {
            var item = document.createElement('div');
            item.className = 'prompt-item';
            item.title = p.prompt;

            var name = document.createElement('span');
            name.className = 'prompt-item-name';
            name.textContent = p.name;

            var meta = document.createElement('span');
            meta.className = 'prompt-item-meta';
            meta.textContent = (p.category || '') + ' / ' + (p.gen_type || 'image');

            var actions = document.createElement('div');
            actions.className = 'prompt-item-actions';

            var editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.title = 'Edit prompt';
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                openEditor(p);
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
            item.appendChild(meta);
            item.appendChild(actions);
            promptList.appendChild(item);
        });
    }

    function openEditor(p) {
        editingId = p ? p.id : null;
        editorName.value = p ? p.name : '';
        editorText.value = p ? p.prompt : '';
        editorCategory.value = p ? (p.category || 'characters') : 'characters';
        editorGenType.value = p ? (p.gen_type || 'image') : 'image';
        promptEditor.hidden = false;
        editorName.focus();
    }

    function closeEditor() {
        editingId = null;
        editorName.value = '';
        editorText.value = '';
        promptEditor.hidden = true;
    }

    addPromptBtn.addEventListener('click', function () { openEditor(null); });
    editorCancel.addEventListener('click', closeEditor);

    editorSave.addEventListener('click', async function () {
        var name = editorName.value.trim();
        var text = editorText.value.trim();
        if (!name || !text) return;

        editorSave.disabled = true;
        try {
            var body = {
                name: name,
                prompt: text,
                category: editorCategory.value,
                gen_type: editorGenType.value,
            };
            var resp;
            if (editingId) {
                resp = await fetch('/api/ai-generate/prompts/' + editingId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                resp = await fetch('/api/ai-generate/prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }
            if (!resp.ok) {
                var err = await resp.json();
                throw new Error(err.error || 'Save failed');
            }
            closeEditor();
            await loadPromptLibrary();
        } catch (e) {
            statusEl.textContent = 'Error: ' + e.message;
        } finally {
            editorSave.disabled = false;
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
            await loadPromptLibrary();
        } catch (e) {
            statusEl.textContent = 'Error: ' + e.message;
        }
    }

    // Open / Close settings
    gearBtn.addEventListener('click', openSettings);

    async function openSettings() {
        statusEl.textContent = '';
        // Reset to General tab
        tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === 'general'); });
        tabContents.forEach(function (tc) { tc.classList.toggle('active', tc.id === 'settings-tab-general'); });
        closeEditor();

        try {
            const resp = await fetch('/api/projects/default');
            const project = await resp.json();
            nameInput.value = project.name || '';
            artStyleInput.value = project.art_style || '';
            resWInput.value = (project.default_resolution && project.default_resolution.width) || 64;
            resHInput.value = (project.default_resolution && project.default_resolution.height) || 64;
        } catch (e) {
            nameInput.value = '';
            artStyleInput.value = '';
            resWInput.value = 64;
            resHInput.value = 64;
        }
        modal.hidden = false;
    }

    function closeSettings() {
        modal.hidden = true;
    }

    closeBtn.addEventListener('click', closeSettings);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeSettings();
    });

    saveBtn.addEventListener('click', async function () {
        saveBtn.disabled = true;
        statusEl.textContent = 'Saving...';
        try {
            const resp = await fetch('/api/projects/default', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.value.trim() || 'My Project',
                    art_style: artStyleInput.value.trim(),
                    default_resolution: {
                        width: parseInt(resWInput.value) || 64,
                        height: parseInt(resHInput.value) || 64,
                    },
                }),
            });
            if (!resp.ok) {
                const data = await resp.json();
                throw new Error(data.error || 'Save failed');
            }
            statusEl.textContent = 'Saved!';
            setTimeout(closeSettings, 600);
        } catch (e) {
            statusEl.textContent = 'Error: ' + e.message;
        } finally {
            saveBtn.disabled = false;
        }
    });
})();
