(function () {
    var toolPanel = document.getElementById('tool-scene-map');
    var canvas = document.getElementById('scene-map-canvas');
    var ctx = canvas.getContext('2d');
    var canvasWrap = document.getElementById('scene-map-canvas-wrap');
    var emptyState = document.getElementById('scene-map-empty');

    // Tabs
    var tabMap = document.getElementById('scene-map-tab-map');
    var tabLocation = document.getElementById('scene-map-tab-location');

    // Map settings
    var settingsMap = document.getElementById('scene-map-settings-map');
    var modelSelect = document.getElementById('scene-map-model');
    var mapThumbWrap = document.getElementById('scene-map-map-thumb');
    var mapUpload = document.getElementById('scene-map-upload');
    var generateMapBtn = document.getElementById('scene-map-generate-map-btn');
    var generateMapForm = document.getElementById('scene-map-generate-map-form');
    var mapPrompt = document.getElementById('scene-map-map-prompt');
    var mapGoBtn = document.getElementById('scene-map-map-go-btn');
    var styleTextarea = document.getElementById('scene-map-style');
    var extractStyleBtn = document.getElementById('scene-map-extract-style-btn');
    var locationList = document.getElementById('scene-map-location-list');
    var addLocationBtn = document.getElementById('scene-map-add-location-btn');

    // Location settings
    var settingsLocation = document.getElementById('scene-map-settings-location');
    var backToMapBtn = document.getElementById('scene-map-back-to-map');
    var locNameInput = document.getElementById('scene-map-loc-name');
    var locThumbWrap = document.getElementById('scene-map-loc-thumb');
    var locNoBg = document.getElementById('scene-map-loc-no-bg');
    var locModelSelect = document.getElementById('scene-map-loc-model');
    var locPromptInput = document.getElementById('scene-map-loc-prompt');
    var locGenerateBtn = document.getElementById('scene-map-loc-generate-btn');
    var locProgress = document.getElementById('scene-map-loc-progress');
    var locError = document.getElementById('scene-map-loc-error');

    var mapProgress = document.getElementById('scene-map-progress');
    var mapError = document.getElementById('scene-map-error');

    // State
    var assetId = null;
    var sceneMap = null;
    var mapImage = null;          // Image object for the map
    var selectedLocationId = null;
    var addingLocation = false;   // true when in pin-placement mode
    var draggingPin = null;       // location id being dragged
    var dragOffset = { x: 0, y: 0 };
    var activeTab = 'map';        // 'map' or 'location'
    var locationBgImage = null;   // Image object for location background
    var modelsLoaded = false;

    var PIN_RADIUS = 10;

    // ── Initialization ──

    var observer = new MutationObserver(function () {
        if (toolPanel.classList.contains('active')) {
            var newAssetId = state.currentAssetId;
            if (newAssetId && newAssetId !== assetId) {
                assetId = newAssetId;
                init();
            }
            if (!modelsLoaded) {
                loadModels();
                modelsLoaded = true;
            }
        }
    });
    observer.observe(toolPanel, { attributes: true, attributeFilter: ['class'] });

    async function loadModels() {
        try {
            var resp = await fetch('/api/ai-generate/models');
            var data = await resp.json();
            [modelSelect, locModelSelect].forEach(function (sel) {
                sel.innerHTML = '';
                data.models.forEach(function (m) {
                    var opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    if (m.default) opt.selected = true;
                    sel.appendChild(opt);
                });
            });
        } catch (e) {
            showError('Failed to load models');
        }
    }

    async function init() {
        selectedLocationId = null;
        addingLocation = false;
        activeTab = 'map';
        showTab('map');

        // Try to load existing scene map
        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map');
            if (resp.ok) {
                sceneMap = await resp.json();
            } else {
                // Create one
                var createResp = await fetch('/api/assets/' + assetId + '/scene-map', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                sceneMap = await createResp.json();
            }
        } catch (e) {
            showError('Failed to load scene map');
            return;
        }

        styleTextarea.value = sceneMap.style_prompt || '';

        if (sceneMap.map_resource_id) {
            loadMapImage();
        } else {
            mapImage = null;
            canvasWrap.hidden = true;
            emptyState.hidden = false;
            mapThumbWrap.hidden = true;
        }

        renderLocationList();
    }

    function loadMapImage() {
        if (!sceneMap || !sceneMap.map_resource_id) return;
        var url = '/api/assets/' + assetId + '/resources/' + sceneMap.map_resource_id + '/file';
        var img = new Image();
        img.onload = function () {
            mapImage = img;
            canvasWrap.hidden = false;
            emptyState.hidden = true;
            // Show thumbnail
            mapThumbWrap.innerHTML = '';
            var thumb = document.createElement('img');
            thumb.src = url;
            thumb.style.maxWidth = '100%';
            thumb.style.borderRadius = '4px';
            mapThumbWrap.appendChild(thumb);
            mapThumbWrap.hidden = false;
            renderCanvas();
        };
        img.src = url;
    }

    // ── Tab Switching ──

    function showTab(tab) {
        activeTab = tab;
        tabMap.classList.toggle('active', tab === 'map');
        tabLocation.classList.toggle('active', tab === 'location');

        if (tab === 'map') {
            settingsMap.hidden = false;
            settingsLocation.hidden = true;
            renderCanvas();
        } else {
            settingsMap.hidden = true;
            settingsLocation.hidden = false;
            renderLocationView();
        }
    }

    tabMap.addEventListener('click', function () {
        selectedLocationId = null;
        showTab('map');
        renderLocationList();
    });

    tabLocation.addEventListener('click', function () {
        if (selectedLocationId) {
            showTab('location');
        }
    });

    // ── Canvas Rendering ──

    function renderCanvas() {
        if (activeTab !== 'map') return;
        if (!mapImage) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        canvas.width = mapImage.naturalWidth;
        canvas.height = mapImage.naturalHeight;
        ctx.drawImage(mapImage, 0, 0);

        // Draw location pins
        if (sceneMap && sceneMap.locations) {
            sceneMap.locations.forEach(function (loc) {
                var px = loc.x * canvas.width;
                var py = loc.y * canvas.height;
                var hasBg = !!loc.background_resource_id;

                // Pin circle
                ctx.beginPath();
                ctx.arc(px, py, PIN_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = hasBg ? '#4caf50' : '#e94560';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Selected highlight
                if (loc.id === selectedLocationId) {
                    ctx.beginPath();
                    ctx.arc(px, py, PIN_RADIUS + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = '#ffeb3b';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // Label
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 3;
                ctx.strokeText(loc.name, px, py - PIN_RADIUS - 6);
                ctx.fillText(loc.name, px, py - PIN_RADIUS - 6);
            });
        }

        // Add-location mode cursor hint
        if (addingLocation) {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'default';
        }
    }

    function renderLocationView() {
        if (activeTab !== 'location') return;
        var loc = getLocation(selectedLocationId);
        if (!loc || !loc.background_resource_id) {
            if (mapImage) {
                canvas.width = mapImage.naturalWidth;
                canvas.height = mapImage.naturalHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#a0a0b0';
                ctx.fillText('No background generated yet', canvas.width / 2, canvas.height / 2);
            }
            return;
        }

        var url = '/api/assets/' + assetId + '/resources/' + loc.background_resource_id + '/file';
        var img = new Image();
        img.onload = function () {
            locationBgImage = img;
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
        };
        img.src = url;
    }

    // ── Location List ──

    function renderLocationList() {
        locationList.innerHTML = '';
        if (!sceneMap || !sceneMap.locations || sceneMap.locations.length === 0) {
            locationList.innerHTML = '<span class="hint">No locations yet</span>';
            return;
        }

        sceneMap.locations.forEach(function (loc) {
            var item = document.createElement('div');
            item.className = 'scene-map-location-item' + (loc.id === selectedLocationId ? ' active' : '');

            var dot = document.createElement('span');
            dot.className = 'scene-map-loc-dot';
            dot.style.background = loc.background_resource_id ? '#4caf50' : '#e94560';

            var name = document.createElement('span');
            name.className = 'scene-map-loc-name';
            name.textContent = loc.name;

            var removeBtn = document.createElement('button');
            removeBtn.className = 'scene-map-loc-remove';
            removeBtn.textContent = '\u00D7';
            removeBtn.title = 'Remove location';
            removeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteLocation(loc.id);
            });

            item.appendChild(dot);
            item.appendChild(name);
            item.appendChild(removeBtn);

            item.addEventListener('click', function () {
                selectLocation(loc.id);
            });

            locationList.appendChild(item);
        });
    }

    function selectLocation(locId) {
        selectedLocationId = locId;
        var loc = getLocation(locId);
        if (!loc) return;

        // Populate location settings
        locNameInput.value = loc.name;
        locError.hidden = true;

        // Background thumbnail
        if (loc.background_resource_id) {
            locThumbWrap.innerHTML = '';
            var thumb = document.createElement('img');
            thumb.src = '/api/assets/' + assetId + '/resources/' + loc.background_resource_id + '/file';
            thumb.style.maxWidth = '100%';
            thumb.style.borderRadius = '4px';
            locThumbWrap.appendChild(thumb);
            locThumbWrap.hidden = false;
            locNoBg.hidden = true;
        } else {
            locThumbWrap.hidden = true;
            locNoBg.hidden = false;
        }

        // Pre-fill prompt
        if (loc.generation_prompt) {
            locPromptInput.value = loc.generation_prompt;
        } else {
            var style = sceneMap.style_prompt || '';
            locPromptInput.value = 'A detailed point and click adventure game background of ' + loc.name + '. ' +
                (style ? style + '. ' : '') +
                'Wide scene, detailed environment, suitable for a point and click adventure game.';
        }

        showTab('location');
        renderLocationList();
        renderCanvas();
    }

    function getLocation(locId) {
        if (!sceneMap || !sceneMap.locations) return null;
        for (var i = 0; i < sceneMap.locations.length; i++) {
            if (sceneMap.locations[i].id === locId) return sceneMap.locations[i];
        }
        return null;
    }

    // ── Location CRUD ──

    addLocationBtn.addEventListener('click', function () {
        if (!mapImage) {
            showError('Upload or generate a map image first');
            return;
        }
        addingLocation = true;
        addLocationBtn.textContent = 'Click on map to place...';
        addLocationBtn.disabled = true;
        renderCanvas();
    });

    async function createLocation(x, y) {
        var name = prompt('Location name:');
        if (!name || !name.trim()) {
            addingLocation = false;
            addLocationBtn.textContent = '+ Add Location';
            addLocationBtn.disabled = false;
            renderCanvas();
            return;
        }

        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), x: x, y: y }),
            });
            var loc = await resp.json();
            if (!resp.ok) throw new Error(loc.error || 'Failed to add location');
            sceneMap.locations.push(loc);
            renderLocationList();
            renderCanvas();
        } catch (e) {
            showError(e.message);
        }

        addingLocation = false;
        addLocationBtn.textContent = '+ Add Location';
        addLocationBtn.disabled = false;
    }

    async function deleteLocation(locId) {
        if (!confirm('Remove this location?')) return;
        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map/locations/' + locId, {
                method: 'DELETE',
            });
            if (!resp.ok) throw new Error('Failed to delete');
            sceneMap.locations = sceneMap.locations.filter(function (l) { return l.id !== locId; });
            if (selectedLocationId === locId) {
                selectedLocationId = null;
                showTab('map');
            }
            renderLocationList();
            renderCanvas();
        } catch (e) {
            showError(e.message);
        }
    }

    // ── Canvas Interaction ──

    function getCanvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function hitTestPin(px, py) {
        if (!sceneMap || !sceneMap.locations) return null;
        for (var i = sceneMap.locations.length - 1; i >= 0; i--) {
            var loc = sceneMap.locations[i];
            var lx = loc.x * canvas.width;
            var ly = loc.y * canvas.height;
            var dist = Math.sqrt((px - lx) * (px - lx) + (py - ly) * (py - ly));
            if (dist <= PIN_RADIUS + 4) return loc;
        }
        return null;
    }

    canvas.addEventListener('mousedown', function (e) {
        if (activeTab !== 'map' || !mapImage) return;
        var pos = getCanvasPos(e);

        if (addingLocation) {
            var nx = pos.x / canvas.width;
            var ny = pos.y / canvas.height;
            createLocation(nx, ny);
            return;
        }

        var hit = hitTestPin(pos.x, pos.y);
        if (hit) {
            // Start dragging
            draggingPin = hit.id;
            var pinX = hit.x * canvas.width;
            var pinY = hit.y * canvas.height;
            dragOffset = { x: pos.x - pinX, y: pos.y - pinY };
            canvas.style.cursor = 'grabbing';
        }
    });

    canvas.addEventListener('mousemove', function (e) {
        if (activeTab !== 'map' || !mapImage) return;
        var pos = getCanvasPos(e);

        if (draggingPin) {
            var loc = getLocation(draggingPin);
            if (loc) {
                loc.x = Math.max(0, Math.min(1, (pos.x - dragOffset.x) / canvas.width));
                loc.y = Math.max(0, Math.min(1, (pos.y - dragOffset.y) / canvas.height));
                renderCanvas();
            }
            return;
        }

        // Hover cursor
        if (!addingLocation) {
            var hit = hitTestPin(pos.x, pos.y);
            canvas.style.cursor = hit ? 'grab' : 'default';
        }
    });

    canvas.addEventListener('mouseup', function (e) {
        if (draggingPin) {
            var loc = getLocation(draggingPin);
            if (loc) {
                // Save new position
                fetch('/api/assets/' + assetId + '/scene-map/locations/' + draggingPin, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: loc.x, y: loc.y }),
                });
            }
            draggingPin = null;
            canvas.style.cursor = 'default';
            return;
        }

        // Click on pin to select (only if we didn't drag)
        if (activeTab === 'map' && mapImage && !addingLocation) {
            var pos = getCanvasPos(e);
            var hit = hitTestPin(pos.x, pos.y);
            if (hit) {
                selectLocation(hit.id);
            }
        }
    });

    // ── Map Image Upload ──

    mapUpload.addEventListener('change', async function () {
        if (!mapUpload.files.length || !assetId) return;

        var file = mapUpload.files[0];
        mapUpload.value = '';

        mapProgress.hidden = false;
        mapError.hidden = true;

        try {
            // Upload as asset resource
            var formData = new FormData();
            formData.append('file', file);
            var resp = await fetch('/api/assets/' + assetId + '/resources', {
                method: 'POST',
                body: formData,
            });
            var resource = await resp.json();
            if (!resp.ok) throw new Error(resource.error || 'Upload failed');

            // Set as map resource
            await fetch('/api/assets/' + assetId + '/scene-map', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ map_resource_id: resource.id }),
            });
            sceneMap.map_resource_id = resource.id;
            loadMapImage();
        } catch (e) {
            showError(e.message);
        } finally {
            mapProgress.hidden = true;
        }
    });

    // ── Generate Map Image ──

    generateMapBtn.addEventListener('click', function () {
        generateMapForm.hidden = !generateMapForm.hidden;
    });

    mapGoBtn.addEventListener('click', async function () {
        var promptText = mapPrompt.value.trim();
        if (!promptText || !assetId) return;

        mapGoBtn.disabled = true;
        mapProgress.hidden = false;
        mapError.hidden = true;

        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map/generate-map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptText, model: modelSelect.value }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Generation failed');

            sceneMap = data.scene_map;
            loadMapImage();
            generateMapForm.hidden = true;
        } catch (e) {
            showError(e.message);
        } finally {
            mapGoBtn.disabled = false;
            mapProgress.hidden = true;
        }
    });

    // ── Extract Style ──

    extractStyleBtn.addEventListener('click', async function () {
        if (!sceneMap || !sceneMap.map_resource_id) {
            showError('Upload or generate a map image first');
            return;
        }

        extractStyleBtn.disabled = true;
        mapProgress.hidden = false;
        mapError.hidden = true;

        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map/extract-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelSelect.value }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Style extraction failed');

            styleTextarea.value = data.style_prompt;
            sceneMap.style_prompt = data.style_prompt;

            // Save to backend
            await fetch('/api/assets/' + assetId + '/scene-map', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ style_prompt: data.style_prompt }),
            });
        } catch (e) {
            showError(e.message);
        } finally {
            extractStyleBtn.disabled = false;
            mapProgress.hidden = true;
        }
    });

    // Save style on blur
    styleTextarea.addEventListener('blur', function () {
        if (!sceneMap || !assetId) return;
        var val = styleTextarea.value.trim();
        if (val !== sceneMap.style_prompt) {
            sceneMap.style_prompt = val;
            fetch('/api/assets/' + assetId + '/scene-map', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ style_prompt: val }),
            });
        }
    });

    // ── Location Settings ──

    backToMapBtn.addEventListener('click', function () {
        selectedLocationId = null;
        showTab('map');
        renderLocationList();
    });

    locNameInput.addEventListener('blur', function () {
        if (!selectedLocationId) return;
        var loc = getLocation(selectedLocationId);
        if (!loc) return;
        var newName = locNameInput.value.trim();
        if (newName && newName !== loc.name) {
            loc.name = newName;
            fetch('/api/assets/' + assetId + '/scene-map/locations/' + selectedLocationId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            });
            renderLocationList();
            renderCanvas();
        }
    });

    // ── Generate Location Background ──

    locGenerateBtn.addEventListener('click', async function () {
        if (!selectedLocationId || !assetId) return;
        var promptText = locPromptInput.value.trim();
        if (!promptText) {
            showLocError('Enter a prompt first');
            return;
        }

        locGenerateBtn.disabled = true;
        locProgress.hidden = false;
        locError.hidden = true;

        try {
            var resp = await fetch('/api/assets/' + assetId + '/scene-map/locations/' + selectedLocationId + '/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptText, model: locModelSelect.value }),
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Generation failed');

            // Update local state
            var loc = getLocation(selectedLocationId);
            if (loc) {
                loc.background_resource_id = data.resource.id;
                loc.generation_prompt = promptText;
            }

            // Show thumbnail
            locThumbWrap.innerHTML = '';
            var thumb = document.createElement('img');
            thumb.src = data.image_url;
            thumb.style.maxWidth = '100%';
            thumb.style.borderRadius = '4px';
            locThumbWrap.appendChild(thumb);
            locThumbWrap.hidden = false;
            locNoBg.hidden = true;

            renderLocationList();
            renderCanvas();

            // Auto-switch to location view to show result
            renderLocationView();
        } catch (e) {
            showLocError(e.message);
        } finally {
            locGenerateBtn.disabled = false;
            locProgress.hidden = true;
        }
    });

    // ── Error Display ──

    function showError(msg) {
        mapError.textContent = msg;
        mapError.hidden = false;
    }

    function showLocError(msg) {
        locError.textContent = msg;
        locError.hidden = false;
    }
})();
