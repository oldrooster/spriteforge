import os
import json
import uuid
import shutil
import subprocess
import threading
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, send_from_directory, current_app

ai_animate_bp = Blueprint('ai_animate', __name__)

MODELS = [
    {'id': 'veo-2.0-generate-001', 'name': 'Veo 2.0 (Standard)', 'default': True},
]


def _get_client():
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key:
        return None, (jsonify({
            'error': 'GEMINI_API_KEY is not configured. '
                     'Set it in docker-compose.yml or pass it as an environment variable.'
        }), 500)
    from google import genai
    client = genai.Client(api_key=api_key)
    return client, None


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


def _run_video_generation(session_dir, image_path, prompt, model_name, api_key):
    """Background worker for video generation."""
    import time
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Upload the source image
        source_file = client.files.upload(file=image_path)

        operation = client.models.generate_videos(
            model=model_name,
            image=source_file,
            config=types.GenerateVideosConfig(
                person_generation='allow_all',
                aspect_ratio='16:9',
            ),
        )

        # Poll until complete
        while not operation.done:
            time.sleep(10)
            operation = client.operations.get(operation)

        if not operation.response or not operation.response.generated_videos:
            _write_status(session_dir, {
                'status': 'failed',
                'error': 'No video was generated. Try a different prompt.',
            })
            return

        video = operation.response.generated_videos[0]

        # Download the video
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


@ai_animate_bp.route('/ai-animate/models', methods=['GET'])
def list_models():
    return jsonify({'models': MODELS})


@ai_animate_bp.route('/ai-animate', methods=['POST'])
def animate():
    client, err = _get_client()
    if err:
        return err

    data = request.get_json(force=True)
    prompt = data.get('prompt', '').strip()
    model_name = data.get('model', 'veo-2.0-generate-001')
    sprite_id = data.get('sprite_id')
    loop_id = data.get('loop_id')
    frame_index = data.get('frame_index', 1)

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    if not sprite_id or not loop_id:
        return jsonify({'error': 'sprite_id and loop_id are required'}), 400

    # Find the source image in the library
    lib_root = current_app.config['LIBRARY_FOLDER']
    frame_name = f'frame_{int(frame_index):04d}.png'
    image_path = os.path.join(lib_root, sprite_id, 'loops', loop_id, frame_name)

    if not os.path.exists(image_path):
        return jsonify({'error': f'Source frame not found: {frame_name}'}), 404

    session_id = str(uuid.uuid4())
    session_dir = _session_dir(current_app.config['OUTPUT_FOLDER'], session_id)

    _write_status(session_dir, {
        'status': 'processing',
        'prompt': prompt,
        'model': model_name,
        'started': datetime.now(timezone.utc).isoformat(),
    })

    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    thread = threading.Thread(
        target=_run_video_generation,
        args=(session_dir, image_path, prompt, model_name, api_key),
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


@ai_animate_bp.route('/ai-animate/save-to-library', methods=['POST'])
def save_to_library():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    sprite_id = data.get('sprite_id')
    loop_name = data.get('loop_name', 'AI Animation')
    frame_count = int(data.get('frame_count', 8))

    if not session_id or not sprite_id:
        return jsonify({'error': 'session_id and sprite_id are required'}), 400

    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_animate')
    video_path = os.path.join(session_dir, 'output.mp4')

    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404

    lib_root = current_app.config['LIBRARY_FOLDER']
    sprite_path = os.path.join(lib_root, sprite_id, 'sprite.json')
    if not os.path.exists(sprite_path):
        return jsonify({'error': 'Sprite not found'}), 404

    # Extract frames from video using FFmpeg
    loop_id = str(uuid.uuid4())
    loop_dir = os.path.join(lib_root, sprite_id, 'loops', loop_id)
    os.makedirs(loop_dir, exist_ok=True)

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
            os.path.join(loop_dir, 'frame_%04d.png'),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f'FFmpeg failed: {result.stderr}')

        frames = sorted(f for f in os.listdir(loop_dir) if f.startswith('frame_') and f.endswith('.png'))
        if not frames:
            raise RuntimeError('No frames extracted')

        # Get dimensions from first frame
        from PIL import Image
        first = Image.open(os.path.join(loop_dir, frames[0]))
        width, height = first.size

        # Write loop metadata
        loop_meta = {
            'id': loop_id,
            'name': loop_name,
            'frame_count': len(frames),
            'width': width,
            'height': height,
            'delay': 100,
            'created': datetime.now(timezone.utc).isoformat(),
        }
        meta_path = os.path.join(loop_dir, 'loop.json')
        with open(meta_path, 'w') as f:
            json.dump(loop_meta, f, indent=2)

        # Update sprite.json
        with open(sprite_path) as f:
            sprite = json.load(f)
        sprite['loops'].append(loop_meta)
        tmp = sprite_path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(sprite, f, indent=2)
        os.replace(tmp, sprite_path)

        # Sync index counts
        index_path = os.path.join(lib_root, 'sprites.json')
        if os.path.exists(index_path):
            with open(index_path) as f:
                index = json.load(f)
            for entry in index:
                if entry['id'] == sprite_id:
                    entry['loop_count'] = len(sprite.get('loops', []))
                    break
            tmp = index_path + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(index, f, indent=2)
            os.replace(tmp, index_path)

        return jsonify({
            'ok': True,
            'loop_id': loop_id,
            'frame_count': len(frames),
        })

    except Exception as e:
        # Clean up on failure
        if os.path.isdir(loop_dir):
            shutil.rmtree(loop_dir, ignore_errors=True)
        return jsonify({'error': str(e)}), 500
