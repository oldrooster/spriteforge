import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from PIL import Image

from .library import _read_json, _write_json, _asset_path, _view_dir, _generate_thumbnail

crop_bp = Blueprint('crop', __name__)


@crop_bp.route('/crop', methods=['POST'])
def crop():
    img_file = request.files.get('image')
    if not img_file:
        return jsonify({'error': 'No image provided'}), 400

    x = int(request.form.get('x', 0))
    y = int(request.form.get('y', 0))
    w = int(request.form.get('w', 0))
    h = int(request.form.get('h', 0))

    if w <= 0 or h <= 0:
        return jsonify({'error': 'Invalid crop dimensions'}), 400

    session_id = str(uuid.uuid4())
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'cropped')
    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(img_file.stream)
    if img.mode not in ('RGBA', 'RGB'):
        img = img.convert('RGBA') if 'A' in (img.mode or '') else img.convert('RGB')

    # Clamp crop region to image bounds
    x = max(0, min(x, img.width - 1))
    y = max(0, min(y, img.height - 1))
    w = min(w, img.width - x)
    h = min(h, img.height - y)

    cropped = img.crop((x, y, x + w, y + h))

    out_path = os.path.join(output_dir, 'cropped.png')
    cropped.save(out_path, 'PNG')

    return jsonify({
        'session_id': session_id,
        'width': cropped.width,
        'height': cropped.height,
    })


@crop_bp.route('/download-crop/<session_id>')
def download_crop(session_id):
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'cropped')
    if not os.path.isdir(output_dir):
        return jsonify({'error': 'Session not found'}), 404
    return send_from_directory(output_dir, 'cropped.png', as_attachment=True, download_name='cropped.png')


@crop_bp.route('/crop-preview/<session_id>')
def crop_preview(session_id):
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'cropped')
    if not os.path.isdir(output_dir):
        return jsonify({'error': 'Session not found'}), 404
    return send_from_directory(output_dir, 'cropped.png')


@crop_bp.route('/crop-view', methods=['POST'])
def crop_view():
    """Crop all frames in a view to the same region."""
    data = request.get_json(silent=True) or {}
    asset_id = data.get('asset_id')
    view_id = data.get('view_id')
    x = int(data.get('x', 0))
    y = int(data.get('y', 0))
    w = int(data.get('w', 0))
    h = int(data.get('h', 0))

    if not asset_id or not view_id:
        return jsonify({'error': 'asset_id and view_id required'}), 400
    if w <= 0 or h <= 0:
        return jsonify({'error': 'Invalid crop dimensions'}), 400

    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    view = None
    for v in asset.get('views', []):
        if v['id'] == view_id:
            view = v
            break
    if not view:
        return jsonify({'error': 'View not found'}), 404

    view_d = _view_dir(asset_id, view_id)
    if not os.path.isdir(view_d):
        return jsonify({'error': 'View directory not found'}), 404

    cropped_count = 0
    for i in range(1, view['frame_count'] + 1):
        frame_name = f'frame_{str(i).zfill(4)}.png'
        frame_path = os.path.join(view_d, frame_name)
        if not os.path.exists(frame_path):
            continue

        img = Image.open(frame_path)
        if img.mode not in ('RGBA', 'RGB'):
            img = img.convert('RGBA')

        cx = max(0, min(x, img.width - 1))
        cy = max(0, min(y, img.height - 1))
        cw = min(w, img.width - cx)
        ch = min(h, img.height - cy)

        cropped = img.crop((cx, cy, cx + cw, cy + ch))
        cropped.save(frame_path, 'PNG')
        cropped_count += 1

    # Update view metadata
    view['width'] = w
    view['height'] = h
    _write_json(_asset_path(asset_id), asset)
    _write_json(os.path.join(view_d, 'view.json'), view)
    _generate_thumbnail(asset_id)

    return jsonify({'ok': True, 'cropped': cropped_count, 'width': w, 'height': h})
