import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from PIL import Image

from app.routes.library import (
    _asset_dir, _asset_path, _read_json, _write_json, _sync_asset_index,
)
from app.services.ai_client import get_client

scene_map_bp = Blueprint('scene_map', __name__)

MODELS = [
    {'id': 'gemini-2.5-flash-image', 'name': 'Gemini 2.5 Flash Image (Fast)', 'default': True},
    {'id': 'gemini-3.1-flash-image-preview', 'name': 'Gemini 3.1 Flash Image (Latest)', 'default': False},
    {'id': 'gemini-3-pro-image-preview', 'name': 'Gemini 3 Pro Image (High Quality)', 'default': False},
]

VERTEX_GLOBAL_MODELS = {'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'}


def _scene_map_path(asset_id):
    return os.path.join(_asset_dir(asset_id), 'scene_map.json')


def _read_scene_map(asset_id):
    return _read_json(_scene_map_path(asset_id))


def _write_scene_map(asset_id, data):
    _write_json(_scene_map_path(asset_id), data)


def _get_resource_file_path(asset_id, resource_id):
    """Resolve the file path for a resource by its ID."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return None
    for res in asset.get('resources', []):
        if res['id'] == resource_id:
            return os.path.join(_asset_dir(asset_id), 'resources', res['stored_name'])
    return None


def _add_resource_to_asset(asset_id, image_bytes, filename):
    """Save image bytes as a new resource on the asset. Returns the resource dict."""
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return None

    resource_id = str(uuid.uuid4())
    stored_name = resource_id + '.png'
    resource_dir = os.path.join(_asset_dir(asset_id), 'resources')
    os.makedirs(resource_dir, exist_ok=True)

    with open(os.path.join(resource_dir, stored_name), 'wb') as f:
        f.write(image_bytes)

    resource = {
        'id': resource_id,
        'filename': filename,
        'stored_name': stored_name,
        'type': 'image',
        'uploaded': datetime.now(timezone.utc).isoformat(),
    }
    asset['resources'].append(resource)
    _write_json(_asset_path(asset_id), asset)
    _sync_asset_index(asset_id, asset)
    return resource


# ── Scene Map CRUD ──

@scene_map_bp.route('/assets/<asset_id>/scene-map', methods=['POST'])
def create_scene_map(asset_id):
    asset = _read_json(_asset_path(asset_id))
    if not asset:
        return jsonify({'error': 'Asset not found'}), 404

    existing = _read_scene_map(asset_id)
    if existing:
        return jsonify(existing)

    data = request.get_json(force=True) if request.is_json else {}
    scene_map = {
        'version': 1,
        'map_resource_id': data.get('map_resource_id', None),
        'style_prompt': '',
        'locations': [],
    }
    _write_scene_map(asset_id, scene_map)
    return jsonify(scene_map), 201


@scene_map_bp.route('/assets/<asset_id>/scene-map', methods=['GET'])
def get_scene_map(asset_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404
    return jsonify(scene_map)


@scene_map_bp.route('/assets/<asset_id>/scene-map', methods=['PUT'])
def update_scene_map(asset_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    data = request.get_json(force=True)
    if 'style_prompt' in data:
        scene_map['style_prompt'] = data['style_prompt']
    if 'map_resource_id' in data:
        scene_map['map_resource_id'] = data['map_resource_id']
    _write_scene_map(asset_id, scene_map)
    return jsonify(scene_map)


# ── Locations ──

@scene_map_bp.route('/assets/<asset_id>/scene-map/locations', methods=['POST'])
def add_location(asset_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    data = request.get_json(force=True)
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    location = {
        'id': str(uuid.uuid4())[:8],
        'name': name,
        'x': float(data.get('x', 0.5)),
        'y': float(data.get('y', 0.5)),
        'background_resource_id': None,
        'generation_prompt': '',
        'panels': [],
        'stitched_resource_id': None,
    }
    scene_map['locations'].append(location)
    _write_scene_map(asset_id, scene_map)
    return jsonify(location), 201


@scene_map_bp.route('/assets/<asset_id>/scene-map/locations/<location_id>', methods=['PUT'])
def update_location(asset_id, location_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    data = request.get_json(force=True)
    for loc in scene_map['locations']:
        if loc['id'] == location_id:
            if 'name' in data:
                loc['name'] = data['name']
            if 'x' in data:
                loc['x'] = float(data['x'])
            if 'y' in data:
                loc['y'] = float(data['y'])
            if 'background_resource_id' in data:
                loc['background_resource_id'] = data['background_resource_id']
            if 'generation_prompt' in data:
                loc['generation_prompt'] = data['generation_prompt']
            _write_scene_map(asset_id, scene_map)
            return jsonify(loc)
    return jsonify({'error': 'Location not found'}), 404


@scene_map_bp.route('/assets/<asset_id>/scene-map/locations/<location_id>', methods=['DELETE'])
def delete_location(asset_id, location_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    before = len(scene_map['locations'])
    scene_map['locations'] = [l for l in scene_map['locations'] if l['id'] != location_id]
    if len(scene_map['locations']) == before:
        return jsonify({'error': 'Location not found'}), 404

    _write_scene_map(asset_id, scene_map)
    return jsonify({'ok': True})


# ── Generation ──

@scene_map_bp.route('/assets/<asset_id>/scene-map/locations/<location_id>/generate', methods=['POST'])
def generate_location_background(asset_id, location_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    location = None
    for loc in scene_map['locations']:
        if loc['id'] == location_id:
            location = loc
            break
    if not location:
        return jsonify({'error': 'Location not found'}), 404

    data = request.get_json(force=True)
    prompt_text = data.get('prompt', '').strip()
    model_name = data.get('model', 'gemini-2.5-flash-image')
    if not prompt_text:
        return jsonify({'error': 'Prompt is required'}), 400

    location_name = 'global' if model_name in VERTEX_GLOBAL_MODELS else None
    client, err = get_client(location=location_name)
    if err:
        return err

    try:
        from google.genai import types

        # Build contents: prompt + map image as reference
        contents = [prompt_text]
        if scene_map.get('map_resource_id'):
            map_path = _get_resource_file_path(asset_id, scene_map['map_resource_id'])
            if map_path and os.path.exists(map_path):
                map_img = Image.open(map_path)
                contents.append(map_img)

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE', 'TEXT'],
            ),
        )

        image_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith('image/'):
                image_bytes = part.inline_data.data
                break
        if not image_bytes:
            return jsonify({'error': 'No image in response. Try a different prompt.'}), 400

        # Save as asset resource
        filename = f'{location["name"]} Background.png'
        resource = _add_resource_to_asset(asset_id, image_bytes, filename)
        if not resource:
            return jsonify({'error': 'Failed to save resource'}), 500

        # Update location
        location['background_resource_id'] = resource['id']
        location['generation_prompt'] = prompt_text
        _write_scene_map(asset_id, scene_map)

        return jsonify({
            'resource': resource,
            'image_url': f'/api/assets/{asset_id}/resources/{resource["id"]}/file',
            'location': location,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@scene_map_bp.route('/assets/<asset_id>/scene-map/extract-style', methods=['POST'])
def extract_style(asset_id):
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    if not scene_map.get('map_resource_id'):
        return jsonify({'error': 'No map image set'}), 400

    map_path = _get_resource_file_path(asset_id, scene_map['map_resource_id'])
    if not map_path or not os.path.exists(map_path):
        return jsonify({'error': 'Map image file not found'}), 404

    data = request.get_json(force=True) if request.is_json else {}
    model_name = data.get('model', 'gemini-2.5-flash-image')

    location = 'global' if model_name in VERTEX_GLOBAL_MODELS else None
    client, err = get_client(location=location)
    if err:
        return err

    try:
        from google.genai import types

        map_img = Image.open(map_path)
        response = client.models.generate_content(
            model=model_name,
            contents=[
                'Analyze this image and describe its art style in detail for use as a style '
                'reference prompt when generating new images in the same style. Focus on: '
                'medium (watercolor, pixel art, oil painting, etc.), color palette, level of '
                'detail, perspective style, lighting, and overall mood. '
                'Output ONLY the style description as a concise prompt, nothing else.',
                map_img,
            ],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT'],
            ),
        )

        style_text = ''
        for part in response.candidates[0].content.parts:
            if part.text:
                style_text += part.text
        style_text = style_text.strip()

        if not style_text:
            return jsonify({'error': 'Could not extract style from image'}), 400

        return jsonify({'style_prompt': style_text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@scene_map_bp.route('/assets/<asset_id>/scene-map/generate-map', methods=['POST'])
def generate_map_image(asset_id):
    """Generate the overhead map image itself."""
    scene_map = _read_scene_map(asset_id)
    if not scene_map:
        return jsonify({'error': 'No scene map for this asset'}), 404

    data = request.get_json(force=True)
    prompt_text = data.get('prompt', '').strip()
    model_name = data.get('model', 'gemini-2.5-flash-image')
    if not prompt_text:
        return jsonify({'error': 'Prompt is required'}), 400

    location = 'global' if model_name in VERTEX_GLOBAL_MODELS else None
    client, err = get_client(location=location)
    if err:
        return err

    try:
        from google.genai import types

        response = client.models.generate_content(
            model=model_name,
            contents=prompt_text,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE', 'TEXT'],
            ),
        )

        image_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith('image/'):
                image_bytes = part.inline_data.data
                break
        if not image_bytes:
            return jsonify({'error': 'No image in response. Try a different prompt.'}), 400

        resource = _add_resource_to_asset(asset_id, image_bytes, 'Scene Map.png')
        if not resource:
            return jsonify({'error': 'Failed to save resource'}), 500

        scene_map['map_resource_id'] = resource['id']
        _write_scene_map(asset_id, scene_map)

        return jsonify({
            'resource': resource,
            'image_url': f'/api/assets/{asset_id}/resources/{resource["id"]}/file',
            'scene_map': scene_map,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
