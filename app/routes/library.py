import io
import json
import os
import shutil
import uuid
import zipfile
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request, send_file, send_from_directory
from PIL import Image

library_bp = Blueprint('library', __name__)

SPRITES_INDEX = 'sprites.json'


def _lib_root():
    return current_app.config['LIBRARY_FOLDER']


def _read_index():
    path = os.path.join(_lib_root(), SPRITES_INDEX)
    if not os.path.exists(path):
        return []
    with open(path, 'r') as f:
        return json.load(f)


def _write_index(data):
    path = os.path.join(_lib_root(), SPRITES_INDEX)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def _read_sprite(sprite_id):
    path = os.path.join(_lib_root(), sprite_id, 'sprite.json')
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def _write_sprite(sprite_id, data):
    path = os.path.join(_lib_root(), sprite_id, 'sprite.json')
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def _generate_thumbnail(sprite_id):
    """Generate thumbnail from first frame of first loop."""
    sprite = _read_sprite(sprite_id)
    if not sprite or not sprite.get('loops'):
        return
    first_loop = sprite['loops'][0]
    loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', first_loop['id'])
    frame_path = os.path.join(loop_dir, 'frame_0001.png')
    if not os.path.exists(frame_path):
        return
    thumb_path = os.path.join(_lib_root(), sprite_id, 'thumbnail.png')
    img = Image.open(frame_path)
    img.thumbnail((128, 128), Image.LANCZOS)
    thumb = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    offset = ((128 - img.width) // 2, (128 - img.height) // 2)
    thumb.paste(img, offset)
    thumb.save(thumb_path, 'PNG')


# ── List all sprites ──

@library_bp.route('/library', methods=['GET'])
def list_sprites():
    sprites = _read_index()
    return jsonify(sprites)


# ── Create sprite ──

@library_bp.route('/library', methods=['POST'])
def create_sprite():
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    sprite_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    sprite_dir = os.path.join(_lib_root(), sprite_id)
    os.makedirs(os.path.join(sprite_dir, 'resources'), exist_ok=True)
    os.makedirs(os.path.join(sprite_dir, 'loops'), exist_ok=True)

    sprite = {
        'id': sprite_id,
        'name': name,
        'created': now,
        'resources': [],
        'loops': [],
    }
    _write_sprite(sprite_id, sprite)

    # Update index
    index = _read_index()
    index.append({
        'id': sprite_id,
        'name': name,
        'created': now,
        'loop_count': 0,
        'resource_count': 0,
    })
    _write_index(index)

    return jsonify(sprite), 201


# ── Get sprite detail ──

@library_bp.route('/library/<sprite_id>', methods=['GET'])
def get_sprite(sprite_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404
    return jsonify(sprite)


# ── Update sprite (rename) ──

@library_bp.route('/library/<sprite_id>', methods=['PUT'])
def update_sprite(sprite_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if name:
        sprite['name'] = name
        _write_sprite(sprite_id, sprite)

        index = _read_index()
        for entry in index:
            if entry['id'] == sprite_id:
                entry['name'] = name
                break
        _write_index(index)

    return jsonify(sprite)


# ── Delete sprite ──

@library_bp.route('/library/<sprite_id>', methods=['DELETE'])
def delete_sprite(sprite_id):
    sprite_dir = os.path.join(_lib_root(), sprite_id)
    if not os.path.isdir(sprite_dir):
        return jsonify({'error': 'Sprite not found'}), 404

    shutil.rmtree(sprite_dir)

    index = _read_index()
    index = [e for e in index if e['id'] != sprite_id]
    _write_index(index)

    return jsonify({'ok': True})


# ── Sprite thumbnail ──

@library_bp.route('/library/<sprite_id>/thumbnail', methods=['GET'])
def get_thumbnail(sprite_id):
    thumb_path = os.path.join(_lib_root(), sprite_id, 'thumbnail.png')
    if os.path.exists(thumb_path):
        return send_file(thumb_path, mimetype='image/png')
    # Return a placeholder 1x1 transparent PNG
    img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


# ── Upload resource ──

@library_bp.route('/library/<sprite_id>/resources', methods=['POST'])
def upload_resource(sprite_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file provided'}), 400

    resource_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = resource_id + ext
    resource_dir = os.path.join(_lib_root(), sprite_id, 'resources')
    file.save(os.path.join(resource_dir, stored_name))

    # Detect type
    video_exts = {'.mp4', '.webm', '.mov', '.avi', '.mkv'}
    rtype = 'video' if ext in video_exts else 'image'

    resource = {
        'id': resource_id,
        'filename': file.filename,
        'stored_name': stored_name,
        'type': rtype,
        'uploaded': datetime.now(timezone.utc).isoformat(),
    }
    sprite['resources'].append(resource)
    _write_sprite(sprite_id, sprite)

    # Update index counts
    _sync_index_counts(sprite_id, sprite)

    return jsonify(resource), 201


# ── Delete resource ──

@library_bp.route('/library/<sprite_id>/resources/<resource_id>', methods=['DELETE'])
def delete_resource(sprite_id, resource_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    resource = None
    for r in sprite['resources']:
        if r['id'] == resource_id:
            resource = r
            break
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    file_path = os.path.join(_lib_root(), sprite_id, 'resources', resource['stored_name'])
    if os.path.exists(file_path):
        os.remove(file_path)

    sprite['resources'] = [r for r in sprite['resources'] if r['id'] != resource_id]
    _write_sprite(sprite_id, sprite)
    _sync_index_counts(sprite_id, sprite)

    return jsonify({'ok': True})


# ── Serve resource file ──

@library_bp.route('/library/<sprite_id>/resources/<resource_id>/file', methods=['GET'])
def serve_resource(sprite_id, resource_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    resource = None
    for r in sprite['resources']:
        if r['id'] == resource_id:
            resource = r
            break
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    resource_dir = os.path.join(_lib_root(), sprite_id, 'resources')
    return send_from_directory(resource_dir, resource['stored_name'])


# ── Create loop ──

@library_bp.route('/library/<sprite_id>/loops', methods=['POST'])
def create_loop(sprite_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    loop_id = str(uuid.uuid4())
    name = request.form.get('name', 'Untitled Loop').strip()
    loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop_id)
    os.makedirs(loop_dir, exist_ok=True)

    frame_count = 0
    width = 0
    height = 0

    # Mode 1: frames uploaded as multipart files
    frames = request.files.getlist('frames')
    if frames:
        for i, f in enumerate(frames):
            frame_name = f'frame_{i + 1:04d}.png'
            f.save(os.path.join(loop_dir, frame_name))
            frame_count += 1
        # Get dimensions from first frame
        first_frame = Image.open(os.path.join(loop_dir, 'frame_0001.png'))
        width = first_frame.width
        height = first_frame.height

    # Mode 2: copy from a session (Video to Frames output)
    session_id = request.form.get('session_id')
    source_folder = request.form.get('source', 'transparent')  # 'transparent' or 'original'
    if session_id and not frames:
        src_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, source_folder)
        if not os.path.isdir(src_dir):
            src_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'original')
        if os.path.isdir(src_dir):
            src_frames = sorted(f for f in os.listdir(src_dir) if f.startswith('frame_') and f.endswith('.png'))
            for i, fname in enumerate(src_frames):
                dest_name = f'frame_{i + 1:04d}.png'
                shutil.copy2(os.path.join(src_dir, fname), os.path.join(loop_dir, dest_name))
                frame_count += 1
            if frame_count > 0:
                first_frame = Image.open(os.path.join(loop_dir, 'frame_0001.png'))
                width = first_frame.width
                height = first_frame.height

    delay = int(request.form.get('delay', 100))

    loop_meta = {
        'id': loop_id,
        'name': name,
        'frame_count': frame_count,
        'width': width,
        'height': height,
        'delay': delay,
    }

    # Save loop.json
    loop_json_path = os.path.join(loop_dir, 'loop.json')
    with open(loop_json_path, 'w') as f:
        json.dump(loop_meta, f, indent=2)

    sprite['loops'].append(loop_meta)
    _write_sprite(sprite_id, sprite)
    _sync_index_counts(sprite_id, sprite)
    _generate_thumbnail(sprite_id)

    return jsonify(loop_meta), 201


# ── Get loop metadata ──

@library_bp.route('/library/<sprite_id>/loops/<loop_id>', methods=['GET'])
def get_loop(sprite_id, loop_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404
    for loop in sprite.get('loops', []):
        if loop['id'] == loop_id:
            return jsonify(loop)
    return jsonify({'error': 'Loop not found'}), 404


# ── Update loop (rename) ──

@library_bp.route('/library/<sprite_id>/loops/<loop_id>', methods=['PUT'])
def update_loop(sprite_id, loop_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()

    for loop in sprite['loops']:
        if loop['id'] == loop_id:
            if name:
                loop['name'] = name
            _write_sprite(sprite_id, sprite)
            return jsonify(loop)

    return jsonify({'error': 'Loop not found'}), 404


# ── Delete loop ──

@library_bp.route('/library/<sprite_id>/loops/<loop_id>', methods=['DELETE'])
def delete_loop(sprite_id, loop_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop_id)
    if os.path.isdir(loop_dir):
        shutil.rmtree(loop_dir)

    sprite['loops'] = [l for l in sprite['loops'] if l['id'] != loop_id]
    _write_sprite(sprite_id, sprite)
    _sync_index_counts(sprite_id, sprite)
    _generate_thumbnail(sprite_id)

    return jsonify({'ok': True})


# ── Serve individual frame ──

@library_bp.route('/library/<sprite_id>/loops/<loop_id>/frames/<filename>', methods=['GET'])
def serve_frame(sprite_id, loop_id, filename):
    frame_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop_id)
    if not os.path.isdir(frame_dir):
        return jsonify({'error': 'Loop not found'}), 404
    return send_from_directory(frame_dir, filename)


@library_bp.route('/library/<sprite_id>/loops/<loop_id>/frames/<filename>', methods=['PUT'])
def overwrite_frame(sprite_id, loop_id, filename):
    """Overwrite a single frame image in a loop."""
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop_id)
    if not os.path.isdir(loop_dir):
        return jsonify({'error': 'Loop not found'}), 404

    frame_path = os.path.join(loop_dir, filename)
    if not os.path.exists(frame_path):
        return jsonify({'error': 'Frame not found'}), 404

    f = request.files.get('image')
    if not f:
        return jsonify({'error': 'No image provided'}), 400

    f.save(frame_path)
    _generate_thumbnail(sprite_id)
    return jsonify({'ok': True})


# ── Download loop as ZIP ──

@library_bp.route('/library/<sprite_id>/loops/<loop_id>/download', methods=['GET'])
def download_loop(sprite_id, loop_id):
    loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop_id)
    if not os.path.isdir(loop_dir):
        return jsonify({'error': 'Loop not found'}), 404

    sprite = _read_sprite(sprite_id)
    loop_name = loop_id[:8]
    if sprite:
        for loop in sprite.get('loops', []):
            if loop['id'] == loop_id:
                loop_name = loop['name'].replace(' ', '_')
                break

    frames = sorted(f for f in os.listdir(loop_dir) if f.startswith('frame_') and f.endswith('.png'))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in frames:
            zf.write(os.path.join(loop_dir, f), f)
    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{loop_name}.zip')


# ── Download all loops as ZIP ──

@library_bp.route('/library/<sprite_id>/download', methods=['GET'])
def download_sprite(sprite_id):
    sprite = _read_sprite(sprite_id)
    if not sprite:
        return jsonify({'error': 'Sprite not found'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for loop in sprite.get('loops', []):
            loop_dir = os.path.join(_lib_root(), sprite_id, 'loops', loop['id'])
            if not os.path.isdir(loop_dir):
                continue
            folder_name = loop['name'].replace(' ', '_')
            frames = sorted(f for f in os.listdir(loop_dir) if f.startswith('frame_') and f.endswith('.png'))
            for f in frames:
                zf.write(os.path.join(loop_dir, f), os.path.join(folder_name, f))
    buf.seek(0)

    sprite_name = sprite['name'].replace(' ', '_')
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{sprite_name}_all_loops.zip')


def _sync_index_counts(sprite_id, sprite):
    """Keep index loop/resource counts in sync."""
    index = _read_index()
    for entry in index:
        if entry['id'] == sprite_id:
            entry['loop_count'] = len(sprite.get('loops', []))
            entry['resource_count'] = len(sprite.get('resources', []))
            break
    _write_index(index)
