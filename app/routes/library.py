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

# ── Constants ──

CATEGORIES = ['characters', 'backgrounds', 'objects', 'ui', 'sounds']
DEFAULT_PROJECT_ID = 'default'
DEFAULT_PROJECT_NAME = 'My Project'


# ── Path helpers ──

def _lib_root():
    return current_app.config['LIBRARY_FOLDER']


def _projects_index_path():
    return os.path.join(_lib_root(), 'projects.json')


def _project_dir(project_id):
    return os.path.join(_lib_root(), 'projects', project_id)


def _project_path(project_id):
    return os.path.join(_project_dir(project_id), 'project.json')


def _assets_index_path(project_id):
    return os.path.join(_project_dir(project_id), 'assets.json')


def _asset_dir(asset_id):
    return os.path.join(_lib_root(), 'assets', asset_id)


def _asset_path(asset_id):
    return os.path.join(_asset_dir(asset_id), 'asset.json')


def _view_dir(asset_id, view_id):
    return os.path.join(_asset_dir(asset_id), 'views', view_id)


# ── JSON read/write helpers ──

def _read_json(path, default=None):
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return default if default is not None else []


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


# ── Default project bootstrap ──

def ensure_default_project():
    """Create the default project and directory structure if missing."""
    lib = _lib_root()
    os.makedirs(os.path.join(lib, 'projects'), exist_ok=True)
    os.makedirs(os.path.join(lib, 'assets'), exist_ok=True)

    projects = _read_json(_projects_index_path(), [])
    if any(p['id'] == DEFAULT_PROJECT_ID for p in projects):
        return

    now = datetime.now(timezone.utc).isoformat()
    project = {
        'id': DEFAULT_PROJECT_ID,
        'name': DEFAULT_PROJECT_NAME,
        'created': now,
        'art_style': '',
        'default_resolution': {'width': 64, 'height': 64},
        'categories': list(CATEGORIES),
    }

    os.makedirs(_project_dir(DEFAULT_PROJECT_ID), exist_ok=True)
    _write_json(_project_path(DEFAULT_PROJECT_ID), project)
    _write_json(_assets_index_path(DEFAULT_PROJECT_ID), [])

    projects.append({
        'id': DEFAULT_PROJECT_ID,
        'name': DEFAULT_PROJECT_NAME,
        'created': now,
        'asset_count': 0,
    })
    _write_json(_projects_index_path(), projects)


# ── Thumbnail generation ──

def _generate_thumbnail(asset_id):
    """Generate thumbnail from thumbnail_resource_id if set, else first frame of first view."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return

    source_path = None

    # Check for custom thumbnail resource
    trid = asset.get('thumbnail_resource_id')
    if trid:
        for r in asset.get('resources', []):
            if r['id'] == trid and r.get('type') == 'image':
                candidate = os.path.join(_asset_dir(asset_id), 'resources', r['stored_name'])
                if os.path.exists(candidate):
                    source_path = candidate
                break

    # Fall back to first view's first frame
    if not source_path and asset.get('views'):
        first_view = asset['views'][0]
        view_d = _view_dir(asset_id, first_view['id'])
        candidate = os.path.join(view_d, 'frame_0001.png')
        if os.path.exists(candidate):
            source_path = candidate

    if not source_path:
        return

    thumb_path = os.path.join(_asset_dir(asset_id), 'thumbnail.png')
    img = Image.open(source_path)
    img.thumbnail((128, 128), Image.LANCZOS)
    thumb = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    offset = ((128 - img.width) // 2, (128 - img.height) // 2)
    thumb.paste(img, offset)
    thumb.save(thumb_path, 'PNG')


def _sync_asset_index(asset_id, asset):
    """Keep the project's assets.json counts in sync."""
    project_id = asset.get('project_id', DEFAULT_PROJECT_ID)
    index_path = _assets_index_path(project_id)
    index = _read_json(index_path, [])
    for entry in index:
        if entry['id'] == asset_id:
            entry['view_count'] = len(asset.get('views', []))
            entry['resource_count'] = len(asset.get('resources', []))
            break
    _write_json(index_path, index)


def _sync_project_asset_count(project_id):
    """Keep the projects.json asset_count in sync."""
    index = _read_json(_assets_index_path(project_id), [])
    projects = _read_json(_projects_index_path(), [])
    for p in projects:
        if p['id'] == project_id:
            p['asset_count'] = len(index)
            break
    _write_json(_projects_index_path(), projects)


# ══════════════════════════════════════════════════════════════════════
#  PROJECT ROUTES
# ══════════════════════════════════════════════════════════════════════

@library_bp.route('/projects', methods=['GET'])
def list_projects():
    ensure_default_project()
    return jsonify(_read_json(_projects_index_path(), []))


@library_bp.route('/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    project = _read_json(_project_path(project_id))
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(project)


@library_bp.route('/projects/<project_id>', methods=['PUT'])
def update_project(project_id):
    project = _read_json(_project_path(project_id))
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    if 'name' in data and data['name'].strip():
        project['name'] = data['name'].strip()
    if 'art_style' in data:
        project['art_style'] = data['art_style'].strip()
    if 'default_resolution' in data:
        project['default_resolution'] = data['default_resolution']

    _write_json(_project_path(project_id), project)

    # Update projects index name
    projects = _read_json(_projects_index_path(), [])
    for p in projects:
        if p['id'] == project_id:
            p['name'] = project['name']
            break
    _write_json(_projects_index_path(), projects)

    return jsonify(project)


# ══════════════════════════════════════════════════════════════════════
#  ASSET ROUTES
# ══════════════════════════════════════════════════════════════════════

@library_bp.route('/projects/<project_id>/assets', methods=['GET'])
def list_assets(project_id):
    ensure_default_project()
    assets = _read_json(_assets_index_path(project_id), [])
    category = request.args.get('category', '').strip()
    if category:
        assets = [a for a in assets if a.get('category') == category]
    return jsonify(assets)


@library_bp.route('/projects/<project_id>/assets', methods=['POST'])
def create_asset(project_id):
    ensure_default_project()
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    category = data.get('category', '').strip()
    if category not in CATEGORIES:
        return jsonify({'error': f'Invalid category. Must be one of: {", ".join(CATEGORIES)}'}), 400

    tags = data.get('tags', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(',') if t.strip()]

    asset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    asset_d = _asset_dir(asset_id)
    os.makedirs(os.path.join(asset_d, 'resources'), exist_ok=True)
    os.makedirs(os.path.join(asset_d, 'views'), exist_ok=True)
    os.makedirs(os.path.join(asset_d, 'videos'), exist_ok=True)

    asset = {
        'id': asset_id,
        'project_id': project_id,
        'name': name,
        'category': category,
        'tags': tags,
        'created': now,
        'resources': [],
        'views': [],
        'videos': [],
    }
    _write_json(_asset_path(asset_id), asset)

    # Update assets index
    index = _read_json(_assets_index_path(project_id), [])
    index.append({
        'id': asset_id,
        'name': name,
        'category': category,
        'tags': tags,
        'view_count': 0,
        'resource_count': 0,
        'created': now,
    })
    _write_json(_assets_index_path(project_id), index)
    _sync_project_asset_count(project_id)

    return jsonify(asset), 201


@library_bp.route('/assets/<asset_id>', methods=['GET'])
def get_asset(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404
    return jsonify(asset)


@library_bp.route('/assets/<asset_id>', methods=['PUT'])
def update_asset(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    data = request.get_json(silent=True) or {}
    if 'name' in data and data['name'].strip():
        asset['name'] = data['name'].strip()
    if 'category' in data:
        if data['category'] not in CATEGORIES:
            return jsonify({'error': f'Invalid category. Must be one of: {", ".join(CATEGORIES)}'}), 400
        asset['category'] = data['category']
    if 'tags' in data:
        tags = data['tags']
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
        asset['tags'] = tags

    regen_thumb = False
    if 'thumbnail_resource_id' in data:
        asset['thumbnail_resource_id'] = data['thumbnail_resource_id'] or None
        regen_thumb = True

    _write_json(_asset_path(asset_id), asset)

    if regen_thumb:
        _generate_thumbnail(asset_id)

    # Update assets index
    project_id = asset.get('project_id', DEFAULT_PROJECT_ID)
    index = _read_json(_assets_index_path(project_id), [])
    for entry in index:
        if entry['id'] == asset_id:
            entry['name'] = asset['name']
            entry['category'] = asset['category']
            entry['tags'] = asset['tags']
            break
    _write_json(_assets_index_path(project_id), index)

    return jsonify(asset)


@library_bp.route('/assets/<asset_id>', methods=['DELETE'])
def delete_asset(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    project_id = asset.get('project_id', DEFAULT_PROJECT_ID)

    # Remove asset directory
    asset_d = _asset_dir(asset_id)
    if os.path.isdir(asset_d):
        shutil.rmtree(asset_d)

    # Update assets index
    index = _read_json(_assets_index_path(project_id), [])
    index = [e for e in index if e['id'] != asset_id]
    _write_json(_assets_index_path(project_id), index)
    _sync_project_asset_count(project_id)

    return jsonify({'ok': True})


@library_bp.route('/assets/<asset_id>/thumbnail', methods=['GET'])
def get_thumbnail(asset_id):
    thumb_path = os.path.join(_asset_dir(asset_id), 'thumbnail.png')
    if os.path.exists(thumb_path):
        return send_file(thumb_path, mimetype='image/png')
    # Return a placeholder 1x1 transparent PNG
    img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


# ══════════════════════════════════════════════════════════════════════
#  RESOURCE ROUTES
# ══════════════════════════════════════════════════════════════════════

@library_bp.route('/assets/<asset_id>/resources', methods=['POST'])
def upload_resource(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file provided'}), 400

    resource_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = resource_id + ext
    resource_dir = os.path.join(_asset_dir(asset_id), 'resources')
    os.makedirs(resource_dir, exist_ok=True)
    file.save(os.path.join(resource_dir, stored_name))

    video_exts = {'.mp4', '.webm', '.mov', '.avi', '.mkv'}
    audio_exts = {'.wav', '.mp3', '.ogg', '.flac', '.aac'}
    if ext in video_exts:
        rtype = 'video'
    elif ext in audio_exts:
        rtype = 'audio'
    else:
        rtype = 'image'

    resource = {
        'id': resource_id,
        'filename': file.filename,
        'stored_name': stored_name,
        'type': rtype,
        'uploaded': datetime.now(timezone.utc).isoformat(),
    }
    asset['resources'].append(resource)
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)

    return jsonify(resource), 201


@library_bp.route('/assets/<asset_id>/resources/<resource_id>', methods=['DELETE'])
def delete_resource(asset_id, resource_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    resource = None
    for r in asset['resources']:
        if r['id'] == resource_id:
            resource = r
            break
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    file_path = os.path.join(_asset_dir(asset_id), 'resources', resource['stored_name'])
    if os.path.exists(file_path):
        os.remove(file_path)

    asset['resources'] = [r for r in asset['resources'] if r['id'] != resource_id]
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)

    return jsonify({'ok': True})


@library_bp.route('/assets/<asset_id>/resources/<resource_id>/file', methods=['GET'])
def serve_resource(asset_id, resource_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    resource = None
    for r in asset['resources']:
        if r['id'] == resource_id:
            resource = r
            break
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    resource_dir = os.path.join(_asset_dir(asset_id), 'resources')
    return send_from_directory(resource_dir, resource['stored_name'])


@library_bp.route('/assets/<asset_id>/resources/<resource_id>', methods=['PUT'])
def update_resource(asset_id, resource_id):
    """Rename a resource (display name only, stored_name unchanged)."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    data = request.get_json(silent=True) or {}
    for r in asset['resources']:
        if r['id'] == resource_id:
            if 'filename' in data and data['filename'].strip():
                r['filename'] = data['filename'].strip()
            _write_json(_asset_path(asset_id), asset)
            return jsonify(r)

    return jsonify({'error': 'Resource not found'}), 404


@library_bp.route('/assets/<asset_id>/resources/<resource_id>/duplicate', methods=['POST'])
def duplicate_resource(asset_id, resource_id):
    """Copy a resource with a new UUID."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    source = None
    for r in asset['resources']:
        if r['id'] == resource_id:
            source = r
            break
    if not source:
        return jsonify({'error': 'Resource not found'}), 404

    new_id = str(uuid.uuid4())
    ext = os.path.splitext(source['stored_name'])[1]
    new_stored = new_id + ext
    resource_dir = os.path.join(_asset_dir(asset_id), 'resources')
    src_path = os.path.join(resource_dir, source['stored_name'])
    dst_path = os.path.join(resource_dir, new_stored)
    if os.path.exists(src_path):
        shutil.copy2(src_path, dst_path)

    new_resource = {
        'id': new_id,
        'filename': 'Copy of ' + source['filename'],
        'stored_name': new_stored,
        'type': source['type'],
        'uploaded': datetime.now(timezone.utc).isoformat(),
    }
    asset['resources'].append(new_resource)
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)

    return jsonify(new_resource), 201


@library_bp.route('/assets/<asset_id>/resources/<resource_id>/file', methods=['PUT'])
def overwrite_resource_file(asset_id, resource_id):
    """Replace the stored file for a resource while keeping the same ID and metadata."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    resource = None
    for r in asset['resources']:
        if r['id'] == resource_id:
            resource = r
            break
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'No file provided'}), 400

    file_path = os.path.join(_asset_dir(asset_id), 'resources', resource['stored_name'])
    f.save(file_path)

    return jsonify({'ok': True})


# ══════════════════════════════════════════════════════════════════════
#  VIEW ROUTES (replaces loops)
# ══════════════════════════════════════════════════════════════════════

@library_bp.route('/assets/<asset_id>/views', methods=['POST'])
def create_view(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    view_id = str(uuid.uuid4())
    name = request.form.get('name', 'Untitled View').strip()
    view_d = _view_dir(asset_id, view_id)
    os.makedirs(view_d, exist_ok=True)

    frame_count = 0
    width = 0
    height = 0

    # Mode 1: frames uploaded as multipart files
    frames = request.files.getlist('frames')
    if frames:
        for i, f in enumerate(frames):
            frame_name = f'frame_{i + 1:04d}.png'
            f.save(os.path.join(view_d, frame_name))
            frame_count += 1
        if frame_count > 0:
            first_frame = Image.open(os.path.join(view_d, 'frame_0001.png'))
            width = first_frame.width
            height = first_frame.height

    # Mode 2: copy from a session (Video to Frames output)
    session_id = request.form.get('session_id')
    source_folder = request.form.get('source', 'transparent')
    if session_id and not frames:
        src_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, source_folder)
        if not os.path.isdir(src_dir):
            src_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'original')
        if os.path.isdir(src_dir):
            src_frames = sorted(f for f in os.listdir(src_dir) if f.startswith('frame_') and f.endswith('.png'))
            for i, fname in enumerate(src_frames):
                dest_name = f'frame_{i + 1:04d}.png'
                shutil.copy2(os.path.join(src_dir, fname), os.path.join(view_d, dest_name))
                frame_count += 1
            if frame_count > 0:
                first_frame = Image.open(os.path.join(view_d, 'frame_0001.png'))
                width = first_frame.width
                height = first_frame.height

    delay = int(request.form.get('delay', 100))

    # Auto-assign ags_loop as max existing + 1
    existing_loops = [v.get('ags_loop', -1) for v in asset.get('views', [])]
    ags_loop = max(existing_loops, default=-1) + 1

    view_meta = {
        'id': view_id,
        'name': name,
        'ags_loop': ags_loop,
        'frame_count': frame_count,
        'width': width,
        'height': height,
        'delay': delay,
    }

    # Save view.json
    _write_json(os.path.join(view_d, 'view.json'), view_meta)

    asset['views'].append(view_meta)
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)
    _generate_thumbnail(asset_id)

    return jsonify(view_meta), 201


@library_bp.route('/assets/<asset_id>/views/<view_id>', methods=['GET'])
def get_view(asset_id, view_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404
    for view in asset.get('views', []):
        if view['id'] == view_id:
            return jsonify(view)
    return jsonify({'error': 'View not found'}), 404


@library_bp.route('/assets/<asset_id>/views/<view_id>', methods=['PUT'])
def update_view(asset_id, view_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    data = request.get_json(silent=True) or {}

    for view in asset['views']:
        if view['id'] == view_id:
            if 'name' in data and data['name'].strip():
                view['name'] = data['name'].strip()
            if 'ags_loop' in data:
                view['ags_loop'] = int(data['ags_loop'])
            if 'delay' in data:
                view['delay'] = int(data['delay'])
            if 'width' in data:
                view['width'] = int(data['width'])
            if 'height' in data:
                view['height'] = int(data['height'])
            _write_json(_asset_path(asset_id), asset)
            _write_json(os.path.join(_view_dir(asset_id, view_id), 'view.json'), view)
            return jsonify(view)

    return jsonify({'error': 'View not found'}), 404


@library_bp.route('/assets/<asset_id>/views/<view_id>', methods=['DELETE'])
def delete_view(asset_id, view_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    view_d = _view_dir(asset_id, view_id)
    if os.path.isdir(view_d):
        shutil.rmtree(view_d)

    asset['views'] = [v for v in asset['views'] if v['id'] != view_id]
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)
    _generate_thumbnail(asset_id)

    return jsonify({'ok': True})


@library_bp.route('/assets/<asset_id>/views/<view_id>/frames/<filename>', methods=['GET'])
def serve_frame(asset_id, view_id, filename):
    view_d = _view_dir(asset_id, view_id)
    if not os.path.isdir(view_d):
        return jsonify({'error': 'View not found'}), 404
    return send_from_directory(view_d, filename)


@library_bp.route('/assets/<asset_id>/views/<view_id>/frames/<filename>', methods=['PUT'])
def overwrite_frame(asset_id, view_id, filename):
    """Overwrite a single frame image in a view."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    view_d = _view_dir(asset_id, view_id)
    if not os.path.isdir(view_d):
        return jsonify({'error': 'View not found'}), 404

    frame_path = os.path.join(view_d, filename)
    if not os.path.exists(frame_path):
        return jsonify({'error': 'Frame not found'}), 404

    f = request.files.get('image')
    if not f:
        return jsonify({'error': 'No image provided'}), 400

    f.save(frame_path)
    _generate_thumbnail(asset_id)
    return jsonify({'ok': True})


@library_bp.route('/assets/<asset_id>/views/<view_id>/download', methods=['GET'])
def download_view(asset_id, view_id):
    view_d = _view_dir(asset_id, view_id)
    if not os.path.isdir(view_d):
        return jsonify({'error': 'View not found'}), 404

    asset = _read_json(_asset_path(asset_id))
    view_name = view_id[:8]
    if asset:
        for view in asset.get('views', []):
            if view['id'] == view_id:
                view_name = view['name'].replace(' ', '_')
                break

    frames = sorted(f for f in os.listdir(view_d) if f.startswith('frame_') and f.endswith('.png'))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in frames:
            zf.write(os.path.join(view_d, f), f)
    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{view_name}.zip')


@library_bp.route('/assets/<asset_id>/download', methods=['GET'])
def download_asset(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for view in asset.get('views', []):
            view_d = _view_dir(asset_id, view['id'])
            if not os.path.isdir(view_d):
                continue
            folder_name = view['name'].replace(' ', '_')
            frames = sorted(f for f in os.listdir(view_d) if f.startswith('frame_') and f.endswith('.png'))
            for f in frames:
                zf.write(os.path.join(view_d, f), os.path.join(folder_name, f))
    buf.seek(0)

    asset_name = asset['name'].replace(' ', '_')
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{asset_name}_all_views.zip')


# ══════════════════════════════════════════════════════════════════════
#  VIDEO ROUTES (serve saved videos from asset)
# ══════════════════════════════════════════════════════════════════════

@library_bp.route('/assets/<asset_id>/export-ags', methods=['GET'])
def export_ags(asset_id):
    """Download asset as AGS-structured ZIP with zero-indexed frames."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    asset_name = asset['name'].replace(' ', '_')
    views = asset.get('views', [])

    # Build view.json metadata
    view_meta = {
        'asset_name': asset['name'],
        'asset_id': asset_id,
        'loops': [],
    }
    for v in views:
        view_meta['loops'].append({
            'ags_loop': v.get('ags_loop', 0),
            'name': v['name'],
            'frame_count': v.get('frame_count', 0),
            'width': v.get('width', 0),
            'height': v.get('height', 0),
            'delay': v.get('delay', 100),
        })

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(os.path.join(asset_name, 'view.json'), json.dumps(view_meta, indent=2))

        for v in views:
            view_d = _view_dir(asset_id, v['id'])
            if not os.path.isdir(view_d):
                continue
            folder = f"loop_{v.get('ags_loop', 0)}_{v['name'].replace(' ', '_')}"
            frames = sorted(f for f in os.listdir(view_d) if f.startswith('frame_') and f.endswith('.png'))
            for i, f in enumerate(frames):
                ags_name = f'frame_{i:04d}.png'
                zf.write(os.path.join(view_d, f), os.path.join(asset_name, folder, ags_name))

    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{asset_name}_ags.zip')


@library_bp.route('/assets/<asset_id>/videos/<video_id>', methods=['GET'])
def serve_video(asset_id, video_id):
    video_dir = os.path.join(_asset_dir(asset_id), 'videos')
    return send_from_directory(video_dir, f'{video_id}.mp4')
