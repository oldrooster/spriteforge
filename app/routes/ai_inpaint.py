import os

from flask import Blueprint, request, jsonify, Response

ai_inpaint_bp = Blueprint('ai_inpaint', __name__)


def _get_inpaint_client():
    """Get a google-genai client configured for Imagen inpainting."""
    from google import genai

    gcp_project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
    gcp_location = os.environ.get('GOOGLE_CLOUD_LOCATION', 'us-central1').strip()

    if not gcp_project:
        return None, (jsonify({
            'error': 'AI Inpaint requires Vertex AI. Set GOOGLE_CLOUD_PROJECT in docker-compose.yml.'
        }), 500)

    # imagen-3.0-capability-001 is not a global-only model
    client = genai.Client(vertexai=True, project=gcp_project, location=gcp_location)
    return client, None


@ai_inpaint_bp.route('/ai-inpaint', methods=['POST'])
def inpaint():
    image_file = request.files.get('image')
    mask_file = request.files.get('mask')
    prompt = request.form.get('prompt', '').strip()
    mode = request.form.get('mode', 'insert').strip()

    if not image_file or not mask_file:
        return jsonify({'error': 'Both image and mask files are required'}), 400

    if mode not in ('insert', 'remove'):
        return jsonify({'error': 'Mode must be "insert" or "remove"'}), 400

    if mode == 'insert' and not prompt:
        return jsonify({'error': 'Prompt is required for inpaint editing'}), 400

    client, err = _get_inpaint_client()
    if err:
        return err

    try:
        from google.genai.types import (
            Image,
            RawReferenceImage,
            MaskReferenceImage,
            MaskReferenceConfig,
            EditImageConfig,
        )

        source_bytes = image_file.read()
        mask_bytes = mask_file.read()

        raw_ref = RawReferenceImage(
            reference_image=Image(image_bytes=source_bytes, mime_type='image/png'),
            reference_id=0,
        )
        mask_ref = MaskReferenceImage(
            reference_id=1,
            reference_image=Image(image_bytes=mask_bytes, mime_type='image/png'),
            config=MaskReferenceConfig(
                mask_mode='MASK_MODE_USER_PROVIDED',
                mask_dilation=0.01,
            ),
        )

        edit_mode = 'EDIT_MODE_INPAINT_INSERTION' if mode == 'insert' else 'EDIT_MODE_INPAINT_REMOVAL'

        response = client.models.edit_image(
            model='imagen-3.0-capability-001',
            prompt=prompt if mode == 'insert' else '',
            reference_images=[raw_ref, mask_ref],
            config=EditImageConfig(edit_mode=edit_mode),
        )

        if not response.generated_images:
            return jsonify({'error': 'No image returned. Try a different prompt or mask area.'}), 400

        image_bytes = response.generated_images[0].image.image_bytes
        if not image_bytes:
            return jsonify({'error': 'No image data in response.'}), 400

        return Response(image_bytes, mimetype='image/png')

    except Exception as e:
        return jsonify({'error': str(e)}), 500
