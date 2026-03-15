import os
import json
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, send_from_directory, current_app

ai_generate_bp = Blueprint('ai_generate', __name__)

MODELS_AI_STUDIO = [
    {'id': 'gemini-2.5-flash-image', 'name': 'Gemini 2.5 Flash Image (Fast)', 'default': True},
    {'id': 'gemini-3.1-flash-image-preview', 'name': 'Gemini 3.1 Flash Image (Latest)', 'default': False},
    {'id': 'gemini-3-pro-image-preview', 'name': 'Gemini 3 Pro Image (High Quality)', 'default': False},
]

MODELS_VERTEX_AI = [
    {'id': 'gemini-2.5-flash-image', 'name': 'Gemini 2.5 Flash Image (Fast)', 'default': True},
    {'id': 'gemini-3.1-flash-image-preview', 'name': 'Gemini 3.1 Flash Image (Latest)', 'default': False},
    {'id': 'gemini-3-pro-image-preview', 'name': 'Gemini 3 Pro Image (High Quality)', 'default': False},
]


def _is_vertex():
    return bool(os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip())



VERTEX_GLOBAL_MODELS = {'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'}


def _get_client(model_name=None):
    from google import genai

    # Prefer Vertex AI if configured, fall back to API key
    gcp_project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
    gcp_location = os.environ.get('GOOGLE_CLOUD_LOCATION', 'global').strip()
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()

    if gcp_project:
        # Preview models are only available via the global endpoint
        location = 'global' if model_name in VERTEX_GLOBAL_MODELS else gcp_location
        client = genai.Client(vertexai=True, project=gcp_project, location=location)
        return client, None

    if api_key:
        client = genai.Client(api_key=api_key)
        return client, None

    return None, (jsonify({
        'error': 'No AI backend configured. Set GOOGLE_CLOUD_PROJECT (for Vertex AI) '
                 'or GEMINI_API_KEY (for AI Studio) in docker-compose.yml.'
    }), 500)


def _session_dir(session_id):
    out = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_generate')
    os.makedirs(out, exist_ok=True)
    return out


def _read_history(session_dir):
    path = os.path.join(session_dir, 'history.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def _write_history(session_dir, history):
    path = os.path.join(session_dir, 'history.json')
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(history, f, indent=2)
    os.replace(tmp, path)


DEFAULT_PROMPTS = [
    {
        'id': 'pixel-art-character',
        'name': 'Pixel Art Character',
        'prompt': 'A character sprite, front-facing idle pose, pixel art style, solid green background (#00FF00), no shadows, clean edges, 128x128 pixels',
        'category': 'characters',
        'gen_type': 'image',
        'builtin': True,
    },
    {
        'id': 'fantasy-warrior',
        'name': 'Fantasy Warrior',
        'prompt': 'A fantasy warrior sprite, side view walking pose, clean flat colors, solid magenta background (#FF00FF), no shadows, no ground shadow, game-ready, transparent-friendly',
        'category': 'characters',
        'gen_type': 'image',
        'builtin': True,
    },
    {
        'id': 'cute-animal',
        'name': 'Cute Animal',
        'prompt': 'A cute animal sprite, front-facing, chibi style, solid blue background (#0000FF), no shadows, no reflections, clean sharp edges, game sprite',
        'category': 'characters',
        'gen_type': 'image',
        'builtin': True,
    },
    {
        'id': 'spaceship-topdown',
        'name': 'Spaceship Top-Down',
        'prompt': 'A spaceship top-down view sprite, clean vector style, solid green background (#00FF00), no shadows, no glow effects, game asset, transparent-friendly',
        'category': 'objects',
        'gen_type': 'image',
        'builtin': True,
    },
    {
        'id': 'walk-left',
        'name': 'Walk Left',
        'prompt': 'Animate the character walking to the left, smooth side-scrolling walk cycle, looping animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'walk-right',
        'name': 'Walk Right',
        'prompt': 'Animate the character walking to the right, smooth side-scrolling walk cycle, looping animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'walk-towards',
        'name': 'Walk Towards',
        'prompt': 'Animate the character walking towards the camera, front-facing walk cycle, looping animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'walk-away',
        'name': 'Walk Away',
        'prompt': 'Animate the character walking away from the camera, back-facing walk cycle, looping animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'idle',
        'name': 'Idle',
        'prompt': 'Animate the character in an idle breathing animation, subtle movement, looping animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'talk',
        'name': 'Talk',
        'prompt': 'Animate the character talking, mouth and hand gestures, conversational animation, looping',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
    {
        'id': 'pickup',
        'name': 'Pick Up',
        'prompt': 'Animate the character bending down to pick up an item from the ground, single action animation',
        'category': 'characters',
        'gen_type': 'video',
        'builtin': True,
    },
]


def _prompts_path():
    return os.path.join(current_app.config['LIBRARY_FOLDER'], 'projects', 'default', 'prompts.json')


def _read_prompts():
    path = _prompts_path()
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return list(DEFAULT_PROMPTS)


def _write_prompts(prompts):
    path = _prompts_path()
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(prompts, f, indent=2)
    os.replace(tmp, path)


@ai_generate_bp.route('/ai-generate/prompts', methods=['GET'])
def list_prompts():
    return jsonify({'prompts': _read_prompts()})


@ai_generate_bp.route('/ai-generate/prompts', methods=['POST'])
def create_prompt():
    data = request.get_json(force=True)
    name = data.get('name', '').strip()
    prompt = data.get('prompt', '').strip()
    if not name or not prompt:
        return jsonify({'error': 'Name and prompt are required'}), 400

    category = data.get('category', 'characters')
    gen_type = data.get('gen_type', 'both')

    prompts = _read_prompts()
    new_prompt = {
        'id': str(uuid.uuid4())[:8],
        'name': name,
        'prompt': prompt,
        'category': category,
        'gen_type': gen_type,
        'builtin': False,
    }
    prompts.append(new_prompt)
    _write_prompts(prompts)
    return jsonify(new_prompt), 201


@ai_generate_bp.route('/ai-generate/prompts/<prompt_id>', methods=['PUT'])
def update_prompt(prompt_id):
    data = request.get_json(force=True)
    name = data.get('name', '').strip()
    prompt = data.get('prompt', '').strip()
    if not name or not prompt:
        return jsonify({'error': 'Name and prompt are required'}), 400

    category = data.get('category', None)
    gen_type = data.get('gen_type', None)

    prompts = _read_prompts()
    for p in prompts:
        if p['id'] == prompt_id:
            p['name'] = name
            p['prompt'] = prompt
            if category is not None:
                p['category'] = category
            if gen_type is not None:
                p['gen_type'] = gen_type
            _write_prompts(prompts)
            return jsonify(p)
    return jsonify({'error': 'Prompt not found'}), 404


@ai_generate_bp.route('/ai-generate/prompts/<prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    prompts = _read_prompts()
    new_prompts = [p for p in prompts if p['id'] != prompt_id]
    if len(new_prompts) == len(prompts):
        return jsonify({'error': 'Prompt not found'}), 404
    _write_prompts(new_prompts)
    return jsonify({'ok': True})


@ai_generate_bp.route('/ai-generate/prompts/reset', methods=['POST'])
def reset_prompts():
    """Reset to default prompts (removes all custom, restores builtins)."""
    _write_prompts(list(DEFAULT_PROMPTS))
    return jsonify({'prompts': DEFAULT_PROMPTS})


@ai_generate_bp.route('/ai-generate/models', methods=['GET'])
def list_models():
    models = MODELS_VERTEX_AI if _is_vertex() else MODELS_AI_STUDIO
    return jsonify({'models': models, 'backend': 'vertex_ai' if _is_vertex() else 'ai_studio'})


@ai_generate_bp.route('/ai-generate', methods=['POST'])
def generate():
    # Extract model name first so we can route to the correct endpoint
    if request.content_type and 'multipart' in request.content_type:
        prompt = request.form.get('prompt', '').strip()
        model_name = request.form.get('model', 'gemini-2.5-flash-image')
        ref_file = request.files.get('reference_image')
    else:
        data = request.get_json(force=True)
        prompt = data.get('prompt', '').strip()
        model_name = data.get('model', 'gemini-2.5-flash-image')
        ref_file = None

    client, err = _get_client(model_name)
    if err:
        return err

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    # Template variable substitution
    if request.content_type and 'multipart' in request.content_type:
        asset_id = request.form.get('asset_id', '')
    else:
        asset_id = data.get('asset_id', '') if ref_file is None else ''

    from app.routes.library import _read_json, _project_path, _asset_path
    project = _read_json(_project_path('default'), {})
    asset_name = ''
    if asset_id:
        asset_data = _read_json(_asset_path(asset_id), {})
        asset_name = asset_data.get('name', '')
    prompt = prompt.replace('{{art_style}}', project.get('art_style', ''))
    prompt = prompt.replace('{{asset_name}}', asset_name)

    session_id = str(uuid.uuid4())
    session_dir = _session_dir(session_id)

    try:
        from google.genai import types
        from PIL import Image

        # Build contents: prompt + optional reference image
        if ref_file:
            ref_path = os.path.join(session_dir, 'reference.png')
            ref_file.save(ref_path)
            ref_img = Image.open(ref_path)
            contents = [prompt, ref_img]
        else:
            contents = prompt

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

        filename = 'generated_001.png'
        filepath = os.path.join(session_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(image_bytes)

        history = [{
            'prompt': prompt,
            'image': filename,
            'model': model_name,
            'has_reference': ref_file is not None,
            'timestamp': datetime.utcnow().isoformat(),
        }]
        _write_history(session_dir, history)

        return jsonify({
            'session_id': session_id,
            'image_url': f'/api/ai-generate/image/{session_id}/{filename}',
            'history': history,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_generate_bp.route('/ai-generate/refine', methods=['POST'])
def refine():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    prompt = data.get('prompt', '').strip()
    model_name = data.get('model', 'gemini-2.5-flash-image')

    client, err = _get_client(model_name)
    if err:
        return err
    reference_image = data.get('reference_image', '')

    if not session_id or not prompt:
        return jsonify({'error': 'session_id and prompt are required'}), 400

    # Template variable substitution
    asset_id = data.get('asset_id', '')
    from app.routes.library import _read_json, _project_path, _asset_path
    project = _read_json(_project_path('default'), {})
    asset_name = ''
    if asset_id:
        asset_data = _read_json(_asset_path(asset_id), {})
        asset_name = asset_data.get('name', '')
    prompt = prompt.replace('{{art_style}}', project.get('art_style', ''))
    prompt = prompt.replace('{{asset_name}}', asset_name)

    session_dir = _session_dir(session_id)
    history = _read_history(session_dir)

    ref_path = os.path.join(session_dir, reference_image)
    if not os.path.exists(ref_path):
        return jsonify({'error': 'Reference image not found'}), 404

    try:
        from google.genai import types
        from PIL import Image

        ref_img = Image.open(ref_path)
        response = client.models.generate_content(
            model=model_name,
            contents=[prompt, ref_img],
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

        idx = len(history) + 1
        filename = f'generated_{idx:03d}.png'
        filepath = os.path.join(session_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(image_bytes)

        history.append({
            'prompt': prompt,
            'image': filename,
            'model': model_name,
            'timestamp': datetime.utcnow().isoformat(),
        })
        _write_history(session_dir, history)

        return jsonify({
            'session_id': session_id,
            'image_url': f'/api/ai-generate/image/{session_id}/{filename}',
            'history': history,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_generate_bp.route('/ai-generate/image/<session_id>/<filename>', methods=['GET'])
def serve_image(session_id, filename):
    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_generate')
    return send_from_directory(session_dir, filename)
