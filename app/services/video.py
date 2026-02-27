import json
import os
import subprocess


def probe_video(filepath):
    cmd = [
        'ffprobe', '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        filepath,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f'Failed to probe video: {result.stderr}')

    data = json.loads(result.stdout)

    video_stream = None
    for stream in data.get('streams', []):
        if stream.get('codec_type') == 'video':
            video_stream = stream
            break

    if not video_stream:
        raise RuntimeError('No video stream found')

    # Parse frame rate from r_frame_rate (e.g. "30/1" or "30000/1001")
    fps_parts = video_stream.get('r_frame_rate', '30/1').split('/')
    fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else float(fps_parts[0])

    duration = float(data.get('format', {}).get('duration', 0))
    if duration == 0:
        duration = float(video_stream.get('duration', 0))

    return {
        'duration': round(duration, 3),
        'width': int(video_stream.get('width', 0)),
        'height': int(video_stream.get('height', 0)),
        'fps': round(fps, 2),
    }


def extract_frames(filepath, start_time, end_time, frame_count, width, height, output_dir,
                    crop_x=None, crop_y=None, crop_w=None, crop_h=None):
    os.makedirs(output_dir, exist_ok=True)

    duration = end_time - start_time
    fps_value = frame_count / duration if duration > 0 else frame_count

    # Build filter chain
    filters = [f'fps={fps_value}']

    # Crop first if coordinates provided
    if crop_x is not None and crop_y is not None and crop_w is not None and crop_h is not None:
        filters.append(f'crop={crop_w}:{crop_h}:{crop_x}:{crop_y}')

    # Scale to final sprite size
    filters.append(f'scale={width}:{height}')

    cmd = [
        'ffmpeg', '-y',
        '-ss', str(start_time),
        '-to', str(end_time),
        '-i', filepath,
        '-vf', ','.join(filters),
        '-frames:v', str(frame_count),
        '-pix_fmt', 'rgba',
        os.path.join(output_dir, 'frame_%03d.png'),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f'FFmpeg extraction failed: {result.stderr}')

    frames = sorted(f for f in os.listdir(output_dir) if f.startswith('frame_') and f.endswith('.png'))
    return frames
