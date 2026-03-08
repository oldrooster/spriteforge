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
    let modalSelectedSprite = null;
    let modalSelectedItems = []; // selected loop IDs or resource
    let modalMultiSelect = false;

    function openLibraryModal(options) {
        // options: { mode: 'video'|'loops', title, onSelect, multiSelect }
        modalMode = options.mode;
        modalTitle.textContent = options.title || 'Select from Library';
        modalCallback = options.onSelect;
        modalMultiSelect = options.multiSelect || false;
        modalSelectedSprite = null;
        modalSelectedItems = [];
        modalConfirm.disabled = true;
        modalBack.hidden = true;
        modalInfo.textContent = '';

        showModalSprites();
        modal.hidden = false;
    }

    async function showModalSprites() {
        modalSprites.hidden = false;
        modalLoops.hidden = true;
        modalBack.hidden = true;
        modalSprites.innerHTML = '';
        modalInfo.textContent = 'Loading...';

        try {
            const resp = await fetch('/api/library');
            const sprites = await resp.json();
            modalInfo.textContent = '';

            if (sprites.length === 0) {
                modalSprites.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No sprites in library</p>';
                return;
            }

            // Filter: for 'video' mode, show all sprites (they can have video resources)
            // For 'loops' mode, only show sprites with loops
            const filtered = modalMode === 'loops'
                ? sprites.filter(s => (s.loop_count || 0) > 0)
                : sprites;

            if (filtered.length === 0) {
                const msg = modalMode === 'loops' ? 'No sprites with loops' : 'No sprites with video resources';
                modalSprites.innerHTML = `<p class="hint" style="text-align:center;padding:20px;">${msg}</p>`;
                return;
            }

            filtered.forEach(s => {
                const card = document.createElement('div');
                card.className = 'modal-sprite-card';
                card.addEventListener('click', () => selectModalSprite(s.id));

                const thumb = document.createElement('img');
                thumb.src = `/api/library/${s.id}/thumbnail?t=${Date.now()}`;

                const name = document.createElement('div');
                name.className = 'modal-sprite-name';
                name.textContent = s.name;

                card.appendChild(thumb);
                card.appendChild(name);
                modalSprites.appendChild(card);
            });
        } catch (e) {
            modalInfo.textContent = 'Failed to load library';
        }
    }

    async function selectModalSprite(spriteId) {
        try {
            const resp = await fetch(`/api/library/${spriteId}`);
            modalSelectedSprite = await resp.json();
        } catch (e) {
            return;
        }

        if (modalMode === 'video') {
            showModalResources();
        } else {
            showModalLoops();
        }
    }

    function showModalResources() {
        modalSprites.hidden = true;
        modalLoops.hidden = false;
        modalBack.hidden = false;
        modalLoops.innerHTML = '';
        modalSelectedItems = [];
        modalConfirm.disabled = true;

        const resources = (modalSelectedSprite.resources || []).filter(r => r.type === 'video');
        if (resources.length === 0) {
            modalLoops.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No video resources in this sprite</p>';
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
            icon.textContent = '🎬';
            const name = document.createElement('span');
            name.textContent = r.filename;

            item.appendChild(icon);
            item.appendChild(name);
            modalLoops.appendChild(item);
        });
    }

    function showModalLoops() {
        modalSprites.hidden = true;
        modalLoops.hidden = false;
        modalBack.hidden = false;
        modalLoops.innerHTML = '';
        modalSelectedItems = [];
        modalConfirm.disabled = true;

        const loops = modalSelectedSprite.loops || [];
        if (loops.length === 0) {
            modalLoops.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No loops in this sprite</p>';
            return;
        }

        loops.forEach(loop => {
            const item = document.createElement('div');
            item.className = 'modal-loop-item';
            item.addEventListener('click', () => {
                if (modalMultiSelect) {
                    item.classList.toggle('selected');
                    if (item.classList.contains('selected')) {
                        modalSelectedItems.push(loop);
                    } else {
                        modalSelectedItems = modalSelectedItems.filter(l => l.id !== loop.id);
                    }
                } else {
                    modalLoops.querySelectorAll('.modal-loop-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    modalSelectedItems = [loop];
                }
                modalConfirm.disabled = modalSelectedItems.length === 0;
                modalInfo.textContent = `${modalSelectedItems.length} selected`;
            });

            const info = document.createElement('div');
            info.className = 'modal-loop-info';
            const title = document.createElement('strong');
            title.textContent = loop.name;
            const meta = document.createElement('span');
            meta.className = 'hint';
            meta.textContent = ` ${loop.frame_count} frames, ${loop.width}x${loop.height}`;
            info.appendChild(title);
            info.appendChild(meta);

            // Mini filmstrip (up to 8 frames)
            const strip = document.createElement('div');
            strip.className = 'modal-filmstrip';
            const maxShow = Math.min(loop.frame_count, 8);
            for (let i = 1; i <= maxShow; i++) {
                const img = document.createElement('img');
                img.src = `/api/library/${modalSelectedSprite.id}/loops/${loop.id}/frames/frame_${String(i).padStart(4, '0')}.png`;
                strip.appendChild(img);
            }
            if (loop.frame_count > 8) {
                const more = document.createElement('span');
                more.className = 'hint';
                more.textContent = `+${loop.frame_count - 8}`;
                strip.appendChild(more);
            }

            item.appendChild(info);
            item.appendChild(strip);
            modalLoops.appendChild(item);
        });
    }

    modalBack.addEventListener('click', () => {
        showModalSprites();
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
                sprite: modalSelectedSprite,
                items: modalSelectedItems,
            });
        }
        modal.hidden = true;
        modalCallback = null;
    });

    // ── Save to Library Modal ──

    const saveModal = document.getElementById('save-library-modal');
    const saveModalClose = document.getElementById('save-library-modal-close');
    const saveSpriteSelect = document.getElementById('save-library-sprite-select');
    const saveNewSpriteName = document.getElementById('save-library-new-sprite-name');
    const saveLoopName = document.getElementById('save-library-loop-name');
    const saveConfirm = document.getElementById('save-library-confirm');
    const saveStatus = document.getElementById('save-library-status');

    let saveCallback = null;

    async function openSaveModal(options) {
        // options: { onSave(spriteId, loopName) }
        saveCallback = options.onSave;
        saveStatus.textContent = '';
        saveLoopName.value = options.defaultLoopName || 'Untitled Loop';

        // Load sprites for dropdown
        try {
            const resp = await fetch('/api/library');
            const sprites = await resp.json();
            saveSpriteSelect.innerHTML = '';
            sprites.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                saveSpriteSelect.appendChild(opt);
            });

            if (sprites.length === 0) {
                // Default to new sprite mode
                document.querySelector('input[name="save-lib-sprite-mode"][value="new"]').checked = true;
                saveSpriteSelect.hidden = true;
                saveNewSpriteName.hidden = false;
            } else {
                document.querySelector('input[name="save-lib-sprite-mode"][value="existing"]').checked = true;
                saveSpriteSelect.hidden = false;
                saveNewSpriteName.hidden = true;
            }
        } catch (e) {
            saveSpriteSelect.innerHTML = '';
            document.querySelector('input[name="save-lib-sprite-mode"][value="new"]').checked = true;
            saveSpriteSelect.hidden = true;
            saveNewSpriteName.hidden = false;
        }

        saveModal.hidden = false;
    }

    document.querySelectorAll('input[name="save-lib-sprite-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = document.querySelector('input[name="save-lib-sprite-mode"]:checked').value;
            saveSpriteSelect.hidden = mode !== 'existing';
            saveNewSpriteName.hidden = mode !== 'new';
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
        const loopName = saveLoopName.value.trim() || 'Untitled Loop';
        let spriteId;

        saveConfirm.disabled = true;
        saveStatus.textContent = 'Saving...';

        try {
            if (mode === 'new') {
                const spriteName = saveNewSpriteName.value.trim();
                if (!spriteName) {
                    saveStatus.textContent = 'Enter a sprite name';
                    saveConfirm.disabled = false;
                    return;
                }
                const resp = await fetch('/api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: spriteName }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error);
                spriteId = data.id;
            } else {
                spriteId = saveSpriteSelect.value;
                if (!spriteId) {
                    saveStatus.textContent = 'Select a sprite';
                    saveConfirm.disabled = false;
                    return;
                }
            }

            if (saveCallback) {
                await saveCallback(spriteId, loopName);
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
