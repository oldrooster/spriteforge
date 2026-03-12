(function () {
    // ── Select from Library Modal ──
    const modal = document.getElementById('library-modal');
    const modalTitle = document.getElementById('library-modal-title');
    const modalClose = document.getElementById('library-modal-close');
    const modalSprites = document.getElementById('library-modal-sprites');
    const modalLoops = document.getElementById('library-modal-loops');
    const modalBack = document.getElementById('library-modal-back');
    const modalInfo = document.getElementById('library-modal-info');
    const modalConfirm = document.getElementById('library-modal-confirm');

    let modalMode = null; // 'video', 'loops'
    let modalCallback = null;
    let modalSelectedAsset = null;
    let modalSelectedItems = []; // selected view IDs or resource
    let modalMultiSelect = false;

    function openLibraryModal(options) {
        // options: { mode: 'video'|'loops', title, onSelect, multiSelect }
        modalMode = options.mode;
        modalTitle.textContent = options.title || 'Select from Library';
        modalCallback = options.onSelect;
        modalMultiSelect = options.multiSelect || false;
        modalSelectedAsset = null;
        modalSelectedItems = [];
        modalConfirm.disabled = true;
        modalBack.hidden = true;
        modalInfo.textContent = '';

        showModalAssets();
        modal.hidden = false;
    }

    async function showModalAssets() {
        modalSprites.hidden = false;
        modalLoops.hidden = true;
        modalBack.hidden = true;
        modalSprites.innerHTML = '';
        modalInfo.textContent = 'Loading...';

        try {
            const resp = await fetch('/api/projects/default/assets');
            const assets = await resp.json();
            modalInfo.textContent = '';

            if (assets.length === 0) {
                modalSprites.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No assets in library</p>';
                return;
            }

            // Filter: for 'loops' mode, only show assets with views
            const filtered = modalMode === 'loops'
                ? assets.filter(a => (a.view_count || 0) > 0)
                : assets;

            if (filtered.length === 0) {
                const msg = modalMode === 'loops' ? 'No assets with views' : 'No assets with video resources';
                modalSprites.innerHTML = `<p class="hint" style="text-align:center;padding:20px;">${msg}</p>`;
                return;
            }

            filtered.forEach(a => {
                const card = document.createElement('div');
                card.className = 'modal-sprite-card';
                card.addEventListener('click', () => selectModalAsset(a.id));

                const thumb = document.createElement('img');
                thumb.src = `/api/assets/${a.id}/thumbnail?t=${Date.now()}`;

                const name = document.createElement('div');
                name.className = 'modal-sprite-name';
                name.textContent = a.name;

                card.appendChild(thumb);
                card.appendChild(name);
                modalSprites.appendChild(card);
            });
        } catch (e) {
            modalInfo.textContent = 'Failed to load library';
        }
    }

    async function selectModalAsset(assetId) {
        try {
            const resp = await fetch(`/api/assets/${assetId}`);
            modalSelectedAsset = await resp.json();
        } catch (e) {
            return;
        }

        if (modalMode === 'video') {
            showModalResources();
        } else {
            showModalViews();
        }
    }

    function showModalResources() {
        modalSprites.hidden = true;
        modalLoops.hidden = false;
        modalBack.hidden = false;
        modalLoops.innerHTML = '';
        modalSelectedItems = [];
        modalConfirm.disabled = true;

        const resources = (modalSelectedAsset.resources || []).filter(r => r.type === 'video');
        if (resources.length === 0) {
            modalLoops.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No video resources in this asset</p>';
            return;
        }

        resources.forEach(r => {
            const item = document.createElement('div');
            item.className = 'modal-loop-item';
            item.addEventListener('click', () => {
                modalLoops.querySelectorAll('.modal-loop-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                modalSelectedItems = [r];
                modalConfirm.disabled = false;
                modalInfo.textContent = r.filename;
            });

            const icon = document.createElement('span');
            icon.textContent = '\uD83C\uDFAC';
            const name = document.createElement('span');
            name.textContent = r.filename;

            item.appendChild(icon);
            item.appendChild(name);
            modalLoops.appendChild(item);
        });
    }

    function showModalViews() {
        modalSprites.hidden = true;
        modalLoops.hidden = false;
        modalBack.hidden = false;
        modalLoops.innerHTML = '';
        modalSelectedItems = [];
        modalConfirm.disabled = true;

        const views = modalSelectedAsset.views || [];
        if (views.length === 0) {
            modalLoops.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No views in this asset</p>';
            return;
        }

        views.forEach(view => {
            const item = document.createElement('div');
            item.className = 'modal-loop-item';
            item.addEventListener('click', () => {
                if (modalMultiSelect) {
                    item.classList.toggle('selected');
                    if (item.classList.contains('selected')) {
                        modalSelectedItems.push(view);
                    } else {
                        modalSelectedItems = modalSelectedItems.filter(v => v.id !== view.id);
                    }
                } else {
                    modalLoops.querySelectorAll('.modal-loop-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    modalSelectedItems = [view];
                }
                modalConfirm.disabled = modalSelectedItems.length === 0;
                modalInfo.textContent = `${modalSelectedItems.length} selected`;
            });

            const info = document.createElement('div');
            info.className = 'modal-loop-info';
            const title = document.createElement('strong');
            title.textContent = view.name;
            const meta = document.createElement('span');
            meta.className = 'hint';
            meta.textContent = ` ${view.frame_count} frames, ${view.width}x${view.height}`;
            info.appendChild(title);
            info.appendChild(meta);

            // Mini filmstrip (up to 8 frames)
            const strip = document.createElement('div');
            strip.className = 'modal-filmstrip';
            const maxShow = Math.min(view.frame_count, 8);
            for (let i = 1; i <= maxShow; i++) {
                const img = document.createElement('img');
                img.src = `/api/assets/${modalSelectedAsset.id}/views/${view.id}/frames/frame_${String(i).padStart(4, '0')}.png`;
                strip.appendChild(img);
            }
            if (view.frame_count > 8) {
                const more = document.createElement('span');
                more.className = 'hint';
                more.textContent = `+${view.frame_count - 8}`;
                strip.appendChild(more);
            }

            item.appendChild(info);
            item.appendChild(strip);
            modalLoops.appendChild(item);
        });
    }

    modalBack.addEventListener('click', () => {
        showModalAssets();
        modalSelectedItems = [];
        modalConfirm.disabled = true;
    });

    modalClose.addEventListener('click', () => {
        modal.hidden = true;
        modalCallback = null;
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.hidden = true;
            modalCallback = null;
        }
    });

    modalConfirm.addEventListener('click', () => {
        if (modalCallback && modalSelectedItems.length > 0) {
            modalCallback({
                sprite: modalSelectedAsset,
                items: modalSelectedItems,
            });
        }
        modal.hidden = true;
        modalCallback = null;
    });

    // ── Save to Library Modal ──

    const saveModal = document.getElementById('save-library-modal');
    const saveModalClose = document.getElementById('save-library-modal-close');
    const saveAssetSelect = document.getElementById('save-library-sprite-select');
    const saveNewAssetName = document.getElementById('save-library-new-sprite-name');
    const saveViewName = document.getElementById('save-library-loop-name');
    const saveConfirm = document.getElementById('save-library-confirm');
    const saveStatus = document.getElementById('save-library-status');

    let saveCallback = null;

    async function openSaveModal(options) {
        // options: { onSave(assetId, viewName), defaultLoopName }
        saveCallback = options.onSave;
        saveStatus.textContent = '';
        saveViewName.value = options.defaultLoopName || 'Untitled View';

        // Load assets for dropdown
        try {
            const resp = await fetch('/api/projects/default/assets');
            const assets = await resp.json();
            saveAssetSelect.innerHTML = '';
            assets.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                saveAssetSelect.appendChild(opt);
            });

            if (assets.length === 0) {
                document.querySelector('input[name="save-lib-sprite-mode"][value="new"]').checked = true;
                saveAssetSelect.hidden = true;
                saveNewAssetName.hidden = false;
            } else {
                // Pre-select current asset if available
                if (state.currentAssetId) {
                    saveAssetSelect.value = state.currentAssetId;
                }
                document.querySelector('input[name="save-lib-sprite-mode"][value="existing"]').checked = true;
                saveAssetSelect.hidden = false;
                saveNewAssetName.hidden = true;
            }
        } catch (e) {
            saveAssetSelect.innerHTML = '';
            document.querySelector('input[name="save-lib-sprite-mode"][value="new"]').checked = true;
            saveAssetSelect.hidden = true;
            saveNewAssetName.hidden = false;
        }

        saveModal.hidden = false;
    }

    document.querySelectorAll('input[name="save-lib-sprite-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = document.querySelector('input[name="save-lib-sprite-mode"]:checked').value;
            saveAssetSelect.hidden = mode !== 'existing';
            saveNewAssetName.hidden = mode !== 'new';
        });
    });

    saveModalClose.addEventListener('click', () => {
        saveModal.hidden = true;
        saveCallback = null;
    });

    saveModal.addEventListener('click', (e) => {
        if (e.target === saveModal) {
            saveModal.hidden = true;
            saveCallback = null;
        }
    });

    saveConfirm.addEventListener('click', async () => {
        const mode = document.querySelector('input[name="save-lib-sprite-mode"]:checked').value;
        const viewName = saveViewName.value.trim() || 'Untitled View';
        let assetId;

        saveConfirm.disabled = true;
        saveStatus.textContent = 'Saving...';

        try {
            if (mode === 'new') {
                const assetName = saveNewAssetName.value.trim();
                if (!assetName) {
                    saveStatus.textContent = 'Enter an asset name';
                    saveConfirm.disabled = false;
                    return;
                }
                const resp = await fetch('/api/projects/default/assets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: assetName }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error);
                assetId = data.id;
            } else {
                assetId = saveAssetSelect.value;
                if (!assetId) {
                    saveStatus.textContent = 'Select an asset';
                    saveConfirm.disabled = false;
                    return;
                }
            }

            if (saveCallback) {
                await saveCallback(assetId, viewName);
            }

            saveStatus.textContent = 'Saved!';
            setTimeout(() => {
                saveModal.hidden = true;
                saveCallback = null;
            }, 800);
        } catch (e) {
            saveStatus.textContent = 'Error: ' + e.message;
        } finally {
            saveConfirm.disabled = false;
        }
    });

    // Expose globally
    window.openLibraryModal = openLibraryModal;
    window.openSaveModal = openSaveModal;
})();
