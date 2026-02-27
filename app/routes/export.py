import io
import os
import zipfile

from flask import Blueprint, current_app, jsonify, send_file, send_from_directory

export_bp = Blueprint('export', __name__)


@export_bp.route('/frames/<session_id>/<subfolder>/<filename>')
def serve_frame(session_id, subfolder, filename):
    output_dir = current_app.config['OUTPUT_FOLDER']
    frame_dir = os.path.join(output_dir, session_id, subfolder)

    if not os.path.isdir(frame_dir):
        return jsonify({'error': 'Not found'}), 404

    return send_from_directory(frame_dir, filename, mimetype='image/png')


@export_bp.route('/download/<session_id>')
def download_zip(session_id):
    output_dir = current_app.config['OUTPUT_FOLDER']
    session_dir = os.path.join(output_dir, session_id)

    # Prefer transparent frames if they exist, otherwise use originals
    transparent_dir = os.path.join(session_dir, 'transparent')
    original_dir = os.path.join(session_dir, 'original')

    if os.path.isdir(transparent_dir):
        frame_dir = transparent_dir
    elif os.path.isdir(original_dir):
        frame_dir = original_dir
    else:
        return jsonify({'error': 'Session not found'}), 404

    frames = sorted(f for f in os.listdir(frame_dir) if f.endswith('.png'))
    if not frames:
        return jsonify({'error': 'No frames found'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for frame_name in frames:
            filepath = os.path.join(frame_dir, frame_name)
            zf.write(filepath, frame_name)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'sprite_frames_{session_id[:8]}.zip',
    )
