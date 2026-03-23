"""Shared Vertex AI client helpers used by all AI route modules."""

import os

from flask import jsonify


def get_client(location=None):
    """Return a google-genai Client configured for Vertex AI.

    Args:
        location: Override the default location (e.g. 'global' for preview models).

    Returns:
        (client, None) on success, or (None, Flask error response) on failure.
    """
    from google import genai

    project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
    if not project:
        return None, (jsonify({
            'error': 'Vertex AI not configured. Set GOOGLE_CLOUD_PROJECT in docker-compose.yml.'
        }), 500)

    loc = location or os.environ.get('GOOGLE_CLOUD_LOCATION', 'us-central1').strip()
    client = genai.Client(vertexai=True, project=project, location=loc)
    return client, None


def get_vertex_config(location_env=None):
    """Return Vertex AI project/location for REST API routes.

    Args:
        location_env: Optional env var name to check first for location
                      (e.g. 'GOOGLE_CLOUD_VIDEO_LOCATION').

    Returns:
        {'project': str, 'location': str} on success,
        or (None, Flask error response) on failure.
    """
    project = os.environ.get('GOOGLE_CLOUD_PROJECT', '').strip()
    if not project:
        return None, (jsonify({
            'error': 'Vertex AI not configured. Set GOOGLE_CLOUD_PROJECT in docker-compose.yml.'
        }), 500)

    location = ''
    if location_env:
        location = os.environ.get(location_env, '').strip()
    if not location:
        location = os.environ.get('GOOGLE_CLOUD_LOCATION', '').strip()
    # REST APIs need a regional endpoint, not 'global'
    if not location or location == 'global':
        location = 'us-central1'

    return {'project': project, 'location': location}, None


def get_credentials():
    """Return (credentials, auth_request) for Vertex AI REST API calls."""
    import google.auth
    import google.auth.transport.requests

    credentials, _ = google.auth.default(
        scopes=['https://www.googleapis.com/auth/cloud-platform']
    )
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    return credentials, auth_req
