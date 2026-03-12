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

    gearBtn.addEventListener('click', openSettings);

    async function openSettings() {
        statusEl.textContent = '';
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
