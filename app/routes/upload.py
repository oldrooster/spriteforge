import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file

from app.services.video import probe_video

upload_bp = Blueprint('upload', __name__)

ALLOWED_EXTENSIONS = {'.mp4', '.webm', '.mov', '.avi', '.mkv'}


@upload_bp.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    file = request.files['video']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'Unsupported format. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    video_id = str(uuid.uuid4())
    filename = f'{video_id}{ext}'
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        meta = probe_video(filepath)
    except RuntimeError as e:
        os.remove(filepath)
        return jsonify({'error': str(e)}), 400

    return jsonify({
        'video_id': video_id,
        'filename': file.filename,
        'duration': meta['duration'],
        'width': meta['width'],
        'height': meta['height'],
        'fps': meta['fps'],
        'preview_url': f'/api/video/{video_id}',
    })


@upload_bp.route('/video/<video_id>')
def serve_video(video_id):
    upload_dir = current_app.config['UPLOAD_FOLDER']
    for ext in ALLOWED_EXTENSIONS:
        filepath = os.path.join(upload_dir, f'{video_id}{ext}')
        if os.path.exists(filepath):
            return send_file(filepath, conditional=True)
    return jsonify({'error': 'Video not found'}), 404
