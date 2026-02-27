(function () {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const uploadProgress = document.getElementById('upload-progress');
    const videoPreview = document.getElementById('video-preview');
    const player = document.getElementById('preview-player');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            uploadFile(fileInput.files[0]);
        }
    });

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('video', file);

        dropzone.hidden = true;
        uploadProgress.hidden = false;

        const progressFill = uploadProgress.querySelector('.progress-fill');

        try {
            const xhr = new XMLHttpRequest();
            const response = await new Promise((resolve, reject) => {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const pct = (e.loaded / e.total) * 100;
                        progressFill.style.width = pct + '%';
                    }
                });
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.error || 'Upload failed'));
                    }
                });
                xhr.addEventListener('error', () => reject(new Error('Upload failed')));
                xhr.open('POST', '/api/upload');
                xhr.send(formData);
            });

            state.videoId = response.video_id;
            state.videoMeta = response;

            player.src = response.preview_url;
            document.getElementById('meta-duration').textContent = `Duration: ${response.duration.toFixed(2)}s`;
            document.getElementById('meta-resolution').textContent = `Resolution: ${response.width}x${response.height}`;
            document.getElementById('meta-fps').textContent = `FPS: ${response.fps}`;

            uploadProgress.hidden = true;
            videoPreview.hidden = false;

            // Set up extract step player
            document.getElementById('extract-player').src = response.preview_url;

            completeStep(0);
        } catch (err) {
            uploadProgress.hidden = true;
            dropzone.hidden = false;
            alert('Upload failed: ' + err.message);
        }
    }
})();
