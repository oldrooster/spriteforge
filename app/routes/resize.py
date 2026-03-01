import io
import os
import uuid
import zipfile

from flask import Blueprint, current_app, jsonify, request, send_file
from PIL import Image

resize_bp = Blueprint('resize', __name__)

INTERPOLATION_MAP = {
    'nearest': Image.NEAREST,
    'bilinear': Image.BILINEAR,
    'bicubic': Image.BICUBIC,
    'lanczos': Image.LANCZOS,
}


@resize_bp.route('/resize', methods=['POST'])
def resize():
    images = request.files.getlist('images')
    if not images:
        return jsonify({'error': 'No images provided'}), 400

    width = request.form.get('width')
    height = request.form.get('height')
    scale = request.form.get('scale')
    interp_name = request.form.get('interpolation', 'bicubic')
    interp = INTERPOLATION_MAP.get(interp_name, Image.BICUBIC)
    flip_h = request.form.get('flip_h') == 'true'
    flip_v = request.form.get('flip_v') == 'true'

    session_id = str(uuid.uuid4())
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'resized')
    os.makedirs(output_dir, exist_ok=True)

    results = []
    for img_file in images:
        img = Image.open(img_file.stream)
        if img.mode not in ('RGBA', 'RGB'):
            img = img.convert('RGBA') if 'A' in (img.mode or '') else img.convert('RGB')

        if scale:
            s = int(scale) / 100.0
            new_w = max(1, round(img.width * s))
            new_h = max(1, round(img.height * s))
        else:
            new_w = int(width)
            new_h = int(height)

        resized = img.resize((new_w, new_h), interp)

        if flip_h:
            resized = resized.transpose(Image.FLIP_LEFT_RIGHT)
        if flip_v:
            resized = resized.transpose(Image.FLIP_TOP_BOTTOM)

        # Preserve original extension but always save as PNG for transparency support
        base_name = os.path.splitext(img_file.filename)[0]
        out_name = f'{base_name}.png'
        out_path = os.path.join(output_dir, out_name)
        resized.save(out_path, 'PNG')
        results.append(out_name)

    return jsonify({
        'session_id': session_id,
        'files': results,
        'count': len(results),
    })


@resize_bp.route('/download-resized/<session_id>')
def download_resized(session_id):
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'resized')
    if not os.path.isdir(output_dir):
        return jsonify({'error': 'Session not found'}), 404

    files = sorted(f for f in os.listdir(output_dir) if not f.startswith('.'))
    if not files:
        return jsonify({'error': 'No files found'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(os.path.join(output_dir, f), f)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'resized_images_{session_id[:8]}.zip',
    )
