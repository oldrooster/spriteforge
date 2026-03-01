import io
import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file
from PIL import Image

from app.services.image import apply_rembg, apply_transparency

image_transparent_bp = Blueprint('image_transparent', __name__)


@image_transparent_bp.route('/upload-image', methods=['POST'])
def upload_image():
    image = request.files.get('image')
    if not image:
        return jsonify({'error': 'No image provided'}), 400

    session_id = str(uuid.uuid4())
    original_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'original')
    os.makedirs(original_dir, exist_ok=True)

    # Save as PNG for consistency
    img = Image.open(image.stream)
    if img.mode not in ('RGBA', 'RGB'):
        img = img.convert('RGBA') if 'A' in (img.mode or '') else img.convert('RGB')
    elif img.mode == 'RGB':
        img = img.convert('RGBA')

    out_path = os.path.join(original_dir, 'frame_0001.png')
    img.save(out_path, 'PNG')

    return jsonify({
        'session_id': session_id,
        'frame_url': f'/api/frames/{session_id}/original/frame_0001.png',
        'width': img.width,
        'height': img.height,
    })


@image_transparent_bp.route('/download-image/<session_id>')
def download_image(session_id):
    output_base = current_app.config['OUTPUT_FOLDER']

    # Prefer transparent version, fall back to original
    transparent_dir = os.path.join(output_base, session_id, 'transparent')
    original_dir = os.path.join(output_base, session_id, 'original')

    if os.path.isdir(transparent_dir):
        frame_dir = transparent_dir
    elif os.path.isdir(original_dir):
        frame_dir = original_dir
    else:
        return jsonify({'error': 'Session not found'}), 404

    file_path = os.path.join(frame_dir, 'frame_0001.png')
    if not os.path.isfile(file_path):
        return jsonify({'error': 'Image not found'}), 404

    return send_file(
        file_path,
        mimetype='image/png',
        as_attachment=True,
        download_name=f'transparent_{session_id[:8]}.png',
    )
