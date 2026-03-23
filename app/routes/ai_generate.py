import os
import json
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, send_from_directory, current_app

from app.services.ai_client import get_client

ai_generate_bp = Blueprint('ai_generate', __name__)

MODELS = [
    {'id': 'gemini-2.5-flash-image', 'name': 'Gemini 2.5 Flash Image (Fast)', 'default': True},
    {'id': 'gemini-3.1-flash-image-preview', 'name': 'Gemini 3.1 Flash Image (Latest)', 'default': False},
    {'id': 'gemini-3-pro-image-preview', 'name': 'Gemini 3 Pro Image (High Quality)', 'default': False},
]

# Preview models are only available via the global endpoint
VERTEX_GLOBAL_MODELS = {'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'}


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
    return jsonify({'models': MODELS})


@ai_generate_bp.route('/ai-generate', methods=['POST'])
def generate():
    # Extract model name first so we can route to the correct endpoint
    if request.content_type and 'multipart' in request.content_type:
        prompt = request.form.get('prompt', '').strip()
        model_name = request.form.get('model', 'gemini-2.5-flash-image')
        ref_files = request.files.getlist('reference_images')
        asset_id = request.form.get('asset_id', '')
        number_of_images = min(int(request.form.get('number_of_images', 1)), 4)
    else:
        data = request.get_json(force=True)
        prompt = data.get('prompt', '').strip()
        model_name = data.get('model', 'gemini-2.5-flash-image')
        ref_files = []
        asset_id = data.get('asset_id', '')
        number_of_images = min(int(data.get('number_of_images', 1)), 4)

    location = 'global' if model_name in VERTEX_GLOBAL_MODELS else None
    client, err = get_client(location=location)
    if err:
        return err

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    # Template variable substitution
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
        from concurrent.futures import ThreadPoolExecutor

        # Save reference images to disk so each thread can open its own copy
        ref_paths = []
        for i, ref_file in enumerate(ref_files[:4]):
            ref_path = os.path.join(session_dir, f'reference_{i}.png')
            ref_file.save(ref_path)
            ref_paths.append(ref_path)
        has_refs = len(ref_paths) > 0

        def _generate_one(idx):
            # Each thread gets its own client and PIL images
            thread_client, thread_err = get_client(location=location)
            if thread_err:
                raise RuntimeError('Failed to create client')
            if has_refs:
                thread_contents = [prompt] + [Image.open(p) for p in ref_paths]
            else:
                thread_contents = prompt
            response = thread_client.models.generate_content(
                model=model_name,
                contents=thread_contents,
                config=types.GenerateContentConfig(
                    response_modalities=['IMAGE', 'TEXT'],
                ),
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data and part.inline_data.mime_type.startswith('image/'):
                    return part.inline_data.data
            return None

        # Generate images in parallel with separate clients per thread
        results = [None] * number_of_images
        errors = []
        if number_of_images == 1:
            try:
                results[0] = _generate_one(0)
                if not results[0]:
                    errors.append('Image 1: No image in response')
            except Exception as gen_err:
                errors.append(f'Image 1: {gen_err}')
        else:
            with ThreadPoolExecutor(max_workers=number_of_images) as executor:
                futures = {executor.submit(_generate_one, i): i for i in range(number_of_images)}
                for future in futures:
                    idx = futures[future]
                    try:
                        img_bytes = future.result()
                        if img_bytes:
                            results[idx] = img_bytes
                        else:
                            errors.append(f'Image {idx + 1}: No image in response')
                    except Exception as gen_err:
                        errors.append(f'Image {idx + 1}: {gen_err}')
        results = [r for r in results if r]

        if not results:
            msg = errors[0] if errors else 'No image in response. Try a different prompt.'
            return jsonify({'error': msg}), 400

        history = []
        image_urls = []
        for i, img_bytes in enumerate(results):
            filename = f'generated_{i + 1:03d}.png'
            filepath = os.path.join(session_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(img_bytes)
            url = f'/api/ai-generate/image/{session_id}/{filename}'
            image_urls.append(url)
            history.append({
                'prompt': prompt,
                'image': filename,
                'model': model_name,
                'has_reference': has_refs,
                'reference_count': len(ref_files[:4]),
                'timestamp': datetime.utcnow().isoformat(),
            })
        _write_history(session_dir, history)

        resp = {
            'session_id': session_id,
            'image_url': image_urls[0],
            'image_urls': image_urls,
            'history': history,
        }
        if errors:
            resp['warnings'] = errors
        return jsonify(resp)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_generate_bp.route('/ai-generate/refine', methods=['POST'])
def refine():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    prompt = data.get('prompt', '').strip()
    model_name = data.get('model', 'gemini-2.5-flash-image')

    location = 'global' if model_name in VERTEX_GLOBAL_MODELS else None
    client, err = get_client(location=location)
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
