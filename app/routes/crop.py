import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from PIL import Image

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
