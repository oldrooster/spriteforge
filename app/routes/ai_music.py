import os
import json
import uuid
import base64
import threading
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, send_from_directory, current_app

from app.services.ai_client import get_vertex_config, get_credentials

ai_music_bp = Blueprint('ai_music', __name__)


def _session_dir(output_folder, session_id):
    out = os.path.join(output_folder, session_id, 'ai_music')
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


def _run_music_generation(session_dir, prompt, negative_prompt, project, location):
    """Background worker for Lyria music generation via Vertex AI REST."""
    import requests as http_requests
    import logging

    try:
        credentials, auth_req = get_credentials()

        url = (
            f'https://{location}-aiplatform.googleapis.com/v1/'
            f'projects/{project}/locations/{location}/'
            f'publishers/google/models/lyria-002:predict'
        )
        headers = {
            'Authorization': f'Bearer {credentials.token}',
            'Content-Type': 'application/json; charset=utf-8',
        }

        instance = {'prompt': prompt}
        if negative_prompt:
            instance['negative_prompt'] = negative_prompt

        body = {
            'instances': [instance],
            'parameters': {},
        }

        resp = http_requests.post(url, headers=headers, json=body, timeout=120)
        if not resp.ok:
            try:
                err_detail = resp.json()
            except Exception:
                err_detail = resp.text[:500]
            _write_status(session_dir, {
                'status': 'failed',
                'error': f'{resp.status_code} {resp.reason}: {err_detail}',
            })
            return
        data = resp.json()

        predictions = data.get('predictions', [])
        if not predictions:
            logging.warning('Lyria response (no predictions): %s', list(data.keys()))
            _write_status(session_dir, {'status': 'failed', 'error': 'No audio generated.'})
            return

        pred = predictions[0]
        audio_b64 = pred.get('audioContent', '') or pred.get('bytesBase64Encoded', '')
        if not audio_b64:
            logging.warning('Lyria prediction keys: %s',
                            list(pred.keys()) if isinstance(pred, dict) else type(pred).__name__)
            _write_status(session_dir, {
                'status': 'failed',
                'error': 'No audio content in response. Keys: ' + str(
                    list(pred.keys()) if isinstance(pred, dict) else pred),
            })
            return

        audio_path = os.path.join(session_dir, 'output.wav')
        with open(audio_path, 'wb') as f:
            f.write(base64.b64decode(audio_b64))

        _write_status(session_dir, {
            'status': 'completed',
            'audio_file': 'output.wav',
        })

    except Exception as e:
        _write_status(session_dir, {'status': 'failed', 'error': str(e)})


@ai_music_bp.route('/ai-music', methods=['POST'])
def generate():
    cfg, err = get_vertex_config(location_env='GOOGLE_CLOUD_MUSIC_LOCATION')
    if err:
        return err

    data = request.get_json(force=True)
    prompt = data.get('prompt', '').strip()
    negative_prompt = data.get('negative_prompt', '').strip()
    asset_id = data.get('asset_id', '')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    session_id = str(uuid.uuid4())
    session_dir = _session_dir(current_app.config['OUTPUT_FOLDER'], session_id)

    _write_status(session_dir, {
        'status': 'processing',
        'prompt': prompt,
        'asset_id': asset_id,
        'started': datetime.now(timezone.utc).isoformat(),
    })

    thread = threading.Thread(
        target=_run_music_generation,
        args=(session_dir, prompt, negative_prompt, cfg['project'], cfg['location']),
        daemon=True,
    )
    thread.start()

    return jsonify({
        'session_id': session_id,
        'status': 'processing',
    })


@ai_music_bp.route('/ai-music/status/<session_id>', methods=['GET'])
def check_status(session_id):
    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_music')
    if not os.path.isdir(session_dir):
        return jsonify({'error': 'Session not found'}), 404

    status = _read_status(session_dir)
    result = {'status': status.get('status', 'unknown')}

    if status.get('status') == 'completed' and status.get('audio_file'):
        result['audio_url'] = f'/api/ai-music/audio/{session_id}/{status["audio_file"]}'

    if status.get('error'):
        result['error'] = status['error']

    return jsonify(result)


@ai_music_bp.route('/ai-music/audio/<session_id>/<filename>', methods=['GET'])
def serve_audio(session_id, filename):
    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_music')
    return send_from_directory(session_dir, filename)


@ai_music_bp.route('/ai-music/save-to-library', methods=['POST'])
def save_to_library():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    asset_id = data.get('asset_id')
    resource_name = data.get('resource_name', 'AI Music').strip() or 'AI Music'

    if not session_id or not asset_id:
        return jsonify({'error': 'session_id and asset_id are required'}), 400

    session_dir = os.path.join(current_app.config['OUTPUT_FOLDER'], session_id, 'ai_music')
    audio_path = os.path.join(session_dir, 'output.wav')
    if not os.path.exists(audio_path):
        return jsonify({'error': 'Audio file not found'}), 404

    lib_root = current_app.config['LIBRARY_FOLDER']
    asset_dir = os.path.join(lib_root, 'assets', asset_id)
    asset_json_path = os.path.join(asset_dir, 'asset.json')

    if not os.path.exists(asset_json_path):
        return jsonify({'error': 'Asset not found'}), 404

    with open(asset_json_path) as f:
        asset_data = json.load(f)

    resource_id = str(uuid.uuid4())
    filename = resource_name if resource_name.endswith('.wav') else resource_name + '.wav'
    stored_name = resource_id + '.wav'

    resources_dir = os.path.join(asset_dir, 'resources')
    os.makedirs(resources_dir, exist_ok=True)

    import shutil
    shutil.copy2(audio_path, os.path.join(resources_dir, stored_name))

    resource_entry = {
        'id': resource_id,
        'filename': filename,
        'type': 'audio',
        'stored_name': stored_name,
        'created': datetime.now(timezone.utc).isoformat(),
    }
    asset_data.setdefault('resources', []).append(resource_entry)

    tmp = asset_json_path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(asset_data, f, indent=2)
    os.replace(tmp, asset_json_path)

    return jsonify({'ok': True, 'resource': resource_entry})
