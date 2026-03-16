import os
import json
import uuid
import shutil
import subprocess
import threading
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, send_from_directory, current_app

ai_animate_bp = Blueprint('ai_animate', __name__)

MODELS_AI_STUDIO = [
    {'id': 'veo-2.0-generate-001', 'name': 'Veo 2.0 (Standard)', 'default': True},
]

MODELS_VERTEX_AI = [
    {'id': 'veo-3.1-fast-generate-001', 'name': 'Veo 3.1 Fast - ~$0.15/sec', 'default': True},
    {'id': 'veo-3.1-generate-001', 'name': 'Veo 3.1 (Latest) - ~$0.40/sec', 'default': False},
    {'id': 'veo-3.1-generate-preview', 'name': 'Veo 3.1 Preview - ~$0.40/sec', 'default': False},
    {'id': 'veo-3.1-fast-generate-preview', 'name': 'Veo 3.1 Fast Preview - ~$0.15/sec', 'default': False},
    {'id': 'veo-3.0-generate-001', 'name': 'Veo 3.0 - ~$0.36/sec', 'default': False},
    {'id': 'veo-3.0-fast-generate-001', 'name': 'Veo 3.0 Fast - ~$0.15/sec', 'default': False},
    {'id': 'veo-3.0-generate-preview', 'name': 'Veo 3.0 Preview - ~$0.36/sec', 'default': False},
    {'id': 'veo-3.0-fast-generate-preview', 'name': 'Veo 3.0 Fast Preview - ~$0.15/sec', 'default': False},
    {'id': 'veo-2.0-generate-001', 'name': 'Veo 2.0 - ~$0.50/sec', 'default': False},
    {'id': 'veo-2.0-generate-exp', 'name': 'Veo 2.0 Experimental - ~$0.50/sec', 'default': False},
]


def _is_vertex():
    return bool(os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip())


def _get_client():
    from google import genai

    gcp_project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
    gcp_location = os.environ.get('GOOGLE_CLOUD_LOCATION', 'us-central1').strip()
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()

    if gcp_project:
        client = genai.Client(vertexai=True, project=gcp_project, location=gcp_location)
        return client, None

    if api_key:
        client = genai.Client(api_key=api_key)
        return client, None

    return None, (jsonify({
        'error': 'No AI backend configured. Set GOOGLE_CLOUD_PROJECT (for Vertex AI) '
                 'or GEMINI_API_KEY (for AI Studio) in docker-compose.yml.'
    }), 500)



def _session_dir(output_folder, session_id):
    out = os.path.join(output_folder, session_id, 'ai_animate')
    os.makedirs(out, exist_ok=True)
    return out


def _read_status(session_dir):
    path = os.path.join(session_dir, 'status.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {'status': 'unknown'}


def _write_status(session_dir, status_data):
    path = os.path.join(session_dir, 'status.json')
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(status_data, f, indent=2)
    os.replace(tmp, path)


def _run_video_generation_ai_studio(session_dir, image_path, prompt, model_name, api_key, generate_audio=False, duration=4):
    """Background worker for AI Studio (Gemini Developer API)."""
    import time
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        source_image = client.files.upload(file=image_path)

        config_kwargs = {
            'person_generation': 'allow_all',
            'aspect_ratio': '16:9',
            'duration_seconds': duration,
        }
        if not generate_audio:
            config_kwargs['generate_audio'] = False

        operation = client.models.generate_videos(
            model=model_name,
            image=source_image,
            config=types.GenerateVideosConfig(**config_kwargs),
        )

        while not operation.done:
            time.sleep(15)
            operation = client.operations.get(operation)

        if not operation.response or not operation.response.generated_videos:
            _write_status(session_dir, {
                'status': 'failed',
                'error': 'No video was generated. Try a different prompt.',
            })
            return

        video = operation.response.generated_videos[0]
        video_data = client.files.download(file=video.video)
        video_path = os.path.join(session_dir, 'output.mp4')
        with open(video_path, 'wb') as f:
            f.write(video_data)

        _write_status(session_dir, {
            'status': 'completed',
            'video_file': 'output.mp4',
        })

    except Exception as e:
        _write_status(session_dir, {
            'status': 'failed',
            'error': str(e),
        })


def _summarize_keys(obj, depth=0, max_depth=4):
    """Recursively summarize dict/list structure for debugging."""
    if depth > max_depth:
        return '...'
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if isinstance(v, str) and len(v) > 100:
                result[k] = f'<str len={len(v)}>'
            else:
                result[k] = _summarize_keys(v, depth + 1, max_depth)
        return result
    if isinstance(obj, list):
        if len(obj) == 0:
            return []
        return [_summarize_keys(obj[0], depth + 1, max_depth), f'...({len(obj)} items)']
    return obj


def _extract_video_b64(poll_data):
    """Try multiple known response structures to find base64 video data."""
    # Structure 1: response.generateVideoResponse.generatedSamples[].video.bytesBase64Encoded
    response = poll_data.get('response', {})
    for key in ['generateVideoResponse', 'generateVideoResult']:
        container = response.get(key, {})
        samples = container.get('generatedSamples', container.get('videos', []))
        for sample in samples:
            video = sample.get('video', sample)
            b64 = video.get('bytesBase64Encoded', '')
            if b64:
                return b64

    # Structure 2: response.predictions[].bytesBase64Encoded
    for pred in response.get('predictions', []):
        b64 = pred.get('bytesBase64Encoded', '')
        if b64:
            return b64

    # Structure 3: flat response with predictions at top level
    for pred in poll_data.get('predictions', []):
        b64 = pred.get('bytesBase64Encoded', '')
        if b64:
            return b64

    # Structure 4: walk all dicts looking for bytesBase64Encoded
    return _find_b64_recursive(poll_data)


def _find_b64_recursive(obj, depth=0):
    if depth > 6:
        return None
    if isinstance(obj, dict):
        if 'bytesBase64Encoded' in obj and isinstance(obj['bytesBase64Encoded'], str) and len(obj['bytesBase64Encoded']) > 100:
            return obj['bytesBase64Encoded']
        for v in obj.values():
            result = _find_b64_recursive(v, depth + 1)
            if result:
                return result
    if isinstance(obj, list):
        for item in obj:
            result = _find_b64_recursive(item, depth + 1)
            if result:
                return result
    return None


def _run_video_generation_vertex(session_dir, image_path, prompt, model_name, project, location, generate_audio=False, duration=4):
    """Background worker for Vertex AI using the REST API."""
    import time
    import base64
    import google.auth
    import google.auth.transport.requests

    try:
        # Get access token from ADC with Vertex AI scope
        credentials, _ = google.auth.default(
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        access_token = credentials.token

        # Read and base64-encode the source image
        with open(image_path, 'rb') as f:
            image_b64 = base64.b64encode(f.read()).decode('utf-8')

        # Start the long-running prediction
        url = (
            f'https://{location}-aiplatform.googleapis.com/v1/'
            f'projects/{project}/locations/{location}/'
            f'publishers/google/models/{model_name}:predictLongRunning'
        )
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json; charset=utf-8',
        }
        body = {
            'instances': [{
                'prompt': prompt,
                'image': {
                    'bytesBase64Encoded': image_b64,
                    'mimeType': 'image/png',
                },
            }],
            'parameters': {
                'aspectRatio': '16:9',
                'personGeneration': 'allow_all',
                'sampleCount': 1,
                'durationSeconds': duration,
                'generateAudio': generate_audio,
            },
        }

        import requests as http_requests
        resp = http_requests.post(url, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        op_data = resp.json()
        op_name = op_data.get('name')

        if not op_name:
            _write_status(session_dir, {
                'status': 'failed',
                'error': f'No operation returned: {op_data}',
            })
            return

        # Poll the operation using fetchPredictOperation
        poll_url = (
            f'https://{location}-aiplatform.googleapis.com/v1/'
            f'projects/{project}/locations/{location}/'
            f'publishers/google/models/{model_name}:fetchPredictOperation'
        )
        poll_body = {'operationName': op_name}
        for _ in range(120):  # up to ~30 minutes
            time.sleep(15)

            # Refresh token if needed
            if credentials.expired:
                credentials.refresh(auth_req)
                headers['Authorization'] = f'Bearer {credentials.token}'

            poll_resp = http_requests.post(poll_url, headers=headers, json=poll_body, timeout=30)
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()

            if poll_data.get('done'):
                break
        else:
            _write_status(session_dir, {
                'status': 'failed',
                'error': 'Video generation timed out.',
            })
            return

        # Check for errors
        if 'error' in poll_data:
            _write_status(session_dir, {
                'status': 'failed',
                'error': poll_data['error'].get('message', str(poll_data['error'])),
            })
            return

        # Dump response structure for debugging
        import logging
        logging.warning('Vertex AI poll response keys: %s', json.dumps(
            _summarize_keys(poll_data), indent=2
        ))

        # Extract video from response — try multiple known structures
        video_b64 = _extract_video_b64(poll_data)
        if not video_b64:
            _write_status(session_dir, {
                'status': 'failed',
                'error': 'No video in response. Response keys: ' + json.dumps(
                    _summarize_keys(poll_data)
                ),
            })
            return

        video_path = os.path.join(session_dir, 'output.mp4')
        with open(video_path, 'wb') as f:
            f.write(base64.b64decode(video_b64))

        _write_status(session_dir, {
            'status': 'completed',
            'video_file': 'output.mp4',
        })

    except Exception as e:
        _write_status(session_dir, {
            'status': 'failed',
            'error': str(e),
        })


@ai_animate_bp.route('/ai-animate/models', methods=['GET'])
def list_models():
    models = MODELS_VERTEX_AI if _is_vertex() else MODELS_AI_STUDIO
    return jsonify({'models': models, 'backend': 'vertex_ai' if _is_vertex() else 'ai_studio'})


@ai_animate_bp.route('/ai-animate', methods=['POST'])
def animate():
    client, err = _get_client()
    if err:
        return err

    data = request.get_json(force=True)
    prompt = data.get('prompt', '').strip()
    default_model = 'veo-3.1-fast-generate-001' if _is_vertex() else 'veo-2.0-generate-001'
    model_name = data.get('model', default_model)
    asset_id = data.get('asset_id')
    view_id = data.get('view_id')
    resource_id = data.get('resource_id')
    frame_index = data.get('frame_index', 1)
    duration = int(data.get('duration', 4))
    generate_audio = bool(data.get('generate_audio', False))

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    if not asset_id:
        return jsonify({'error': 'asset_id is required'}), 400
    if not view_id and not resource_id:
        return jsonify({'error': 'view_id or resource_id is required'}), 400

    # Find the source image in the library
    lib_root = current_app.config['LIBRARY_FOLDER']
    if resource_id and not view_id:
        # Source is a resource file (launched from resource context menu)
        import json
        asset_path = os.path.join(lib_root, 'assets', asset_id, 'asset.json')
        with open(asset_path) as f:
            asset_data = json.load(f)
        res = next((r for r in asset_data.get('resources', []) if r['id'] == resource_id), None)
        if not res:
            return jsonify({'error': 'Resource not found'}), 404
        image_path = os.path.join(lib_root, 'assets', asset_id, 'resources', res['stored_name'])
    else:
        frame_name = f'frame_{int(frame_index):04d}.png'
        image_path = os.path.join(lib_root, 'assets', asset_id, 'views', view_id, frame_name)

    if not os.path.exists(image_path):
        return jsonify({'error': f'Source image not found'}), 404

    session_id = str(uuid.uuid4())
    session_dir = _session_dir(current_app.config['OUTPUT_FOLDER'], session_id)

    _write_status(session_dir, {
        'status': 'processing',
        'prompt': prompt,
        'model': model_name,
        'started': datetime.now(timezone.utc).isoformat(),
    })

    if _is_vertex():
        gcp_project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
        # Video models (Veo) require a regional endpoint, not global
        gcp_location = os.environ.get('GOOGLE_CLOUD_VIDEO_LOCATION', 'us-central1').strip()
        thread = threading.Thread(
            target=_run_video_generation_vertex,
            args=(session_dir, image_path, prompt, model_name, gcp_project, gcp_location, generate_audio, duration),
            daemon=True,
        )
    else:
        api_key = os.environ.get('GEMINI_API_KEY', '').strip()
        thread = threading.Thread(
            target=_run_video_generation_ai_studio,
            args=(session_dir, image_path, prompt, model_name, api_key, generate_audio, duration),
            daemon=True,
        )
    thread.start()

    return jsonify({
        'session_id': session_id,
        'status': 'processing',
    })


@ai_animate_bp.route('/ai-animate/status/<session_id>', methods=['GET'])
def check_status(session_id):
    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_animate')
    if not os.path.isdir(session_dir):
        return jsonify({'error': 'Session not found'}), 404

    status = _read_status(session_dir)
    result = {'status': status.get('status', 'unknown')}

    if status.get('status') == 'completed' and status.get('video_file'):
        result['video_url'] = f'/api/ai-animate/video/{session_id}/{status["video_file"]}'

    if status.get('error'):
        result['error'] = status['error']

    return jsonify(result)


@ai_animate_bp.route('/ai-animate/video/<session_id>/<filename>', methods=['GET'])
def serve_video(session_id, filename):
    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_animate')
    return send_from_directory(session_dir, filename)


@ai_animate_bp.route('/ai-animate/library-video/<asset_id>/<video_id>', methods=['GET'])
def serve_library_video(asset_id, video_id):
    """Serve a saved video from the asset library."""
    video_dir = os.path.join(current_app.config['LIBRARY_FOLDER'], 'assets', asset_id, 'videos')
    return send_from_directory(video_dir, f'{video_id}.mp4')


@ai_animate_bp.route('/ai-animate/save-video-to-library', methods=['POST'])
def save_video_to_library():
    """Save the generated video file directly to the asset library."""
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    asset_id = data.get('asset_id')
    video_name = data.get('video_name', 'AI Animation').strip() or 'AI Animation'

    if not session_id or not asset_id:
        return jsonify({'error': 'session_id and asset_id are required'}), 400

    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_animate')
    video_path = os.path.join(session_dir, 'output.mp4')

    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404

    lib_root = current_app.config['LIBRARY_FOLDER']
    asset_path = os.path.join(lib_root, 'assets', asset_id, 'asset.json')
    if not os.path.exists(asset_path):
        return jsonify({'error': 'Asset not found'}), 404

    try:
        video_id = str(uuid.uuid4())
        video_dir = os.path.join(lib_root, 'assets', asset_id, 'videos')
        os.makedirs(video_dir, exist_ok=True)

        dest_path = os.path.join(video_dir, f'{video_id}.mp4')
        shutil.copy2(video_path, dest_path)

        video_meta = {
            'id': video_id,
            'name': video_name,
            'filename': f'{video_id}.mp4',
            'created': datetime.now(timezone.utc).isoformat(),
        }

        # Update asset.json
        with open(asset_path) as f:
            asset = json.load(f)
        if 'videos' not in asset:
            asset['videos'] = []
        asset['videos'].append(video_meta)
        tmp = asset_path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(asset, f, indent=2)
        os.replace(tmp, asset_path)

        return jsonify({'ok': True, 'video_id': video_id})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_animate_bp.route('/ai-animate/save-to-library', methods=['POST'])
def save_to_library():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    asset_id = data.get('asset_id')
    view_name = data.get('view_name', 'AI Animation')
    frame_count = int(data.get('frame_count', 8))

    if not session_id or not asset_id:
        return jsonify({'error': 'session_id and asset_id are required'}), 400

    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_animate')
    video_path = os.path.join(session_dir, 'output.mp4')

    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404

    lib_root = current_app.config['LIBRARY_FOLDER']
    asset_path = os.path.join(lib_root, 'assets', asset_id, 'asset.json')
    if not os.path.exists(asset_path):
        return jsonify({'error': 'Asset not found'}), 404

    # Extract frames from video using FFmpeg
    view_id = str(uuid.uuid4())
    view_dir = os.path.join(lib_root, 'assets', asset_id, 'views', view_id)
    os.makedirs(view_dir, exist_ok=True)

    try:
        # Get video duration
        probe_cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            video_path,
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        duration = float(json.loads(probe_result.stdout).get('format', {}).get('duration', 1))

        fps_value = frame_count / duration if duration > 0 else frame_count

        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-vf', f'fps={fps_value}',
            '-frames:v', str(frame_count),
            '-pix_fmt', 'rgba',
            os.path.join(view_dir, 'frame_%04d.png'),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f'FFmpeg failed: {result.stderr}')

        frames = sorted(f for f in os.listdir(view_dir) if f.startswith('frame_') and f.endswith('.png'))
        if not frames:
            raise RuntimeError('No frames extracted')

        # Get dimensions from first frame
        from PIL import Image
        first = Image.open(os.path.join(view_dir, frames[0]))
        width, height = first.size

        # Auto-increment ags_loop
        with open(asset_path) as f:
            asset = json.load(f)
        existing_ags = [v.get('ags_loop', 0) for v in asset.get('views', [])]
        next_ags = max(existing_ags, default=-1) + 1

        # Write view metadata
        view_meta = {
            'id': view_id,
            'name': view_name,
            'ags_loop': next_ags,
            'frame_count': len(frames),
            'width': width,
            'height': height,
            'delay': 100,
            'created': datetime.now(timezone.utc).isoformat(),
        }
        meta_path = os.path.join(view_dir, 'view.json')
        with open(meta_path, 'w') as f:
            json.dump(view_meta, f, indent=2)

        # Update asset.json
        asset['views'].append(view_meta)
        tmp = asset_path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(asset, f, indent=2)
        os.replace(tmp, asset_path)

        # Sync project asset index counts
        index_path = os.path.join(lib_root, 'projects', 'default', 'assets.json')
        if os.path.exists(index_path):
            with open(index_path) as f:
                index = json.load(f)
            for entry in index:
                if entry['id'] == asset_id:
                    entry['view_count'] = len(asset.get('views', []))
                    break
            tmp = index_path + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(index, f, indent=2)
            os.replace(tmp, index_path)

        return jsonify({
            'ok': True,
            'view_id': view_id,
            'frame_count': len(frames),
        })

    except Exception as e:
        # Clean up on failure
        if os.path.isdir(view_dir):
            shutil.rmtree(view_dir, ignore_errors=True)
        return jsonify({'error': str(e)}), 500
