import io
import os
import uuid
import zipfile

from flask import Blueprint, current_app, jsonify, request, send_file, send_from_directory
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
    fit_mode = request.form.get('fit', 'stretch')  # stretch, fit, crop

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
            resized = img.resize((new_w, new_h), interp)
        elif fit_mode == 'fit':
            # Scale to fit: entire image visible, transparent letterbox
            new_w = int(width)
            new_h = int(height)
            scale_x = new_w / img.width
            scale_y = new_h / img.height
            s = min(scale_x, scale_y)
            fit_w = max(1, round(img.width * s))
            fit_h = max(1, round(img.height * s))
            scaled = img.resize((fit_w, fit_h), interp)
            resized = Image.new('RGBA', (new_w, new_h), (0, 0, 0, 0))
            offset_x = (new_w - fit_w) // 2
            offset_y = (new_h - fit_h) // 2
            resized.paste(scaled, (offset_x, offset_y))
        elif fit_mode == 'crop':
            # Crop to fill: image fills target, excess cropped from center
            new_w = int(width)
            new_h = int(height)
            scale_x = new_w / img.width
            scale_y = new_h / img.height
            s = max(scale_x, scale_y)
            scaled_w = max(1, round(img.width * s))
            scaled_h = max(1, round(img.height * s))
            scaled = img.resize((scaled_w, scaled_h), interp)
            crop_x = (scaled_w - new_w) // 2
            crop_y = (scaled_h - new_h) // 2
            resized = scaled.crop((crop_x, crop_y, crop_x + new_w, crop_y + new_h))
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


@resize_bp.route('/save-resized-to-library', methods=['POST'])
def save_resized_to_library():
    """Save resized images back to their original sprite library locations."""
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    asset_id = data.get('asset_id')
    frames = data.get('frames', [])  # [{ view_id, filename }, ...]

    if not session_id or not asset_id or not frames:
        return jsonify({'error': 'Missing required fields'}), 400

    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'resized')
    if not os.path.isdir(output_dir):
        return jsonify({'error': 'Session not found'}), 404

    resized_files = sorted(f for f in os.listdir(output_dir) if not f.startswith('.'))
    if len(resized_files) != len(frames):
        return jsonify({'error': f'Mismatch: {len(resized_files)} resized files vs {len(frames)} library frames'}), 400

    lib_root = current_app.config['LIBRARY_FOLDER']
    count = 0
    for resized_name, frame_info in zip(resized_files, frames):
        src_path = os.path.join(output_dir, resized_name)
        dest_dir = os.path.join(lib_root, 'assets', asset_id, 'views', frame_info['view_id'])
        dest_path = os.path.join(dest_dir, frame_info['filename'])
        if os.path.isdir(dest_dir) and os.path.exists(dest_path):
            img = Image.open(src_path)
            img.save(dest_path, 'PNG')
            count += 1

    return jsonify({'ok': True, 'count': count})


@resize_bp.route('/download-resized/<session_id>')
def download_resized(session_id):
    output_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'resized')
    if not os.path.isdir(output_dir):
        return jsonify({'error': 'Session not found'}), 404

    files = sorted(f for f in os.listdir(output_dir) if not f.startswith('.'))
    if not files:
        return jsonify({'error': 'No files found'}), 404

    # Single file: return PNG directly
    fmt = request.args.get('format')
    if fmt == 'single' and len(files) == 1:
        return send_from_directory(output_dir, files[0], as_attachment=True, download_name=files[0])

    # Multiple files: return ZIP
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
