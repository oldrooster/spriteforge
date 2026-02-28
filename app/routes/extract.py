import os
import uuid

from flask import Blueprint, current_app, jsonify, request

from app.services.image import apply_rembg, apply_transparency
from app.services.video import extract_frames

extract_bp = Blueprint('extract', __name__)


@extract_bp.route('/extract', methods=['POST'])
def extract():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    video_id = data.get('video_id')
    start_time = float(data.get('start_time', 0))
    end_time = float(data.get('end_time', 0))
    frame_count = int(data.get('frame_count', 10))
    width = int(data.get('width', 128))
    height = int(data.get('height', 128))

    # Crop coordinates (optional - from sprite selector overlay)
    crop_x = int(data['crop_x']) if 'crop_x' in data else None
    crop_y = int(data['crop_y']) if 'crop_y' in data else None
    crop_w = int(data['crop_w']) if 'crop_w' in data else None
    crop_h = int(data['crop_h']) if 'crop_h' in data else None

    if end_time <= start_time:
        return jsonify({'error': 'end_time must be greater than start_time'}), 400
    if frame_count < 1 or frame_count > 120:
        return jsonify({'error': 'frame_count must be between 1 and 120'}), 400

    upload_dir = current_app.config['UPLOAD_FOLDER']
    video_path = None
    for ext in ['.mp4', '.webm', '.mov', '.avi', '.mkv']:
        candidate = os.path.join(upload_dir, f'{video_id}{ext}')
        if os.path.exists(candidate):
            video_path = candidate
            break

    if not video_path:
        return jsonify({'error': 'Video not found'}), 404

    session_id = str(uuid.uuid4())
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'original')

    try:
        frames = extract_frames(video_path, start_time, end_time, frame_count, width, height, output_dir,
                                crop_x=crop_x, crop_y=crop_y, crop_w=crop_w, crop_h=crop_h)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 500

    frame_urls = [f'/api/frames/{session_id}/original/{f}' for f in frames]

    return jsonify({
        'session_id': session_id,
        'frames': frame_urls,
        'count': len(frames),
    })


@extract_bp.route('/transparency', methods=['POST'])
def transparency():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    session_id = data.get('session_id')
    color = data.get('color', [255, 255, 255])
    tolerance = int(data.get('tolerance', 30))
    edges_only = data.get('edges_only', True)

    if not session_id:
        return jsonify({'error': 'session_id required'}), 400

    output_base = current_app.config['OUTPUT_FOLDER']
    original_dir = os.path.join(output_base, session_id, 'original')
    transparent_dir = os.path.join(output_base, session_id, 'transparent')

    if not os.path.isdir(original_dir):
        return jsonify({'error': 'Session not found'}), 404

    os.makedirs(transparent_dir, exist_ok=True)

    frames = sorted(f for f in os.listdir(original_dir) if f.endswith('.png'))
    for frame_name in frames:
        src = os.path.join(original_dir, frame_name)
        dst = os.path.join(transparent_dir, frame_name)
        apply_transparency(src, dst, tuple(color), tolerance, edges_only=edges_only)

    frame_urls = [f'/api/frames/{session_id}/transparent/{f}' for f in frames]

    return jsonify({
        'session_id': session_id,
        'frames': frame_urls,
        'count': len(frames),
    })


@extract_bp.route('/save-frame', methods=['POST'])
def save_frame():
    session_id = request.form.get('session_id')
    frame_index = request.form.get('frame_index')
    image = request.files.get('image')

    if not session_id or frame_index is None or not image:
        return jsonify({'error': 'session_id, frame_index, and image required'}), 400

    frame_index = int(frame_index)
    output_base = current_app.config['OUTPUT_FOLDER']

    transparent_dir = os.path.join(output_base, session_id, 'transparent')
    original_dir = os.path.join(output_base, session_id, 'original')

    if os.path.isdir(transparent_dir):
        frame_dir = transparent_dir
    elif os.path.isdir(original_dir):
        # First manual edit without prior transparency - copy originals to transparent dir
        import shutil
        os.makedirs(transparent_dir, exist_ok=True)
        for f in sorted(os.listdir(original_dir)):
            if f.endswith('.png'):
                shutil.copy2(os.path.join(original_dir, f), os.path.join(transparent_dir, f))
        frame_dir = transparent_dir
    else:
        return jsonify({'error': 'Session not found'}), 404

    frames = sorted(f for f in os.listdir(frame_dir) if f.endswith('.png'))
    if frame_index < 0 or frame_index >= len(frames):
        return jsonify({'error': 'Invalid frame index'}), 400

    dst = os.path.join(frame_dir, frames[frame_index])
    image.save(dst)

    return jsonify({'ok': True})


@extract_bp.route('/rembg', methods=['POST'])
def rembg_remove():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id required'}), 400

    output_base = current_app.config['OUTPUT_FOLDER']
    original_dir = os.path.join(output_base, session_id, 'original')
    transparent_dir = os.path.join(output_base, session_id, 'transparent')

    if not os.path.isdir(original_dir):
        return jsonify({'error': 'Session not found'}), 404

    os.makedirs(transparent_dir, exist_ok=True)

    frames = sorted(f for f in os.listdir(original_dir) if f.endswith('.png'))
    for frame_name in frames:
        src = os.path.join(original_dir, frame_name)
        dst = os.path.join(transparent_dir, frame_name)
        apply_rembg(src, dst)

    frame_urls = [f'/api/frames/{session_id}/transparent/{f}' for f in frames]

    return jsonify({
        'session_id': session_id,
        'frames': frame_urls,
        'count': len(frames),
    })
