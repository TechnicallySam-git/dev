from flask import Blueprint, jsonify, request, current_app
from services.blob import list_blobs, fetch_blob_data

api = Blueprint('api', __name__)

@api.route('/api/load_latest', methods=['GET'])
def load_latest():
    """
    Return list of blobs (newest first) as JSON under key 'items'.
    Accepts optional query params: containerUrl, sas
    """
    container_url = request.args.get('containerUrl')
    sas_token = request.args.get('sas') or current_app.config.get('SAS_TOKEN')
    try:
        items = list_blobs(container_url=container_url, sas_token=sas_token)
        return jsonify({'items': items}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/api/fetch_blob', methods=['GET'])
def fetch_blob():
    """
    Return metadata/URL for a single blob. Query param: name
    Optional query params: containerUrl, sas
    """
    name = request.args.get('name')
    if not name:
        return jsonify({'error': 'name query parameter is required'}), 400

    container_url = request.args.get('containerUrl')
    sas_token = request.args.get('sas') or current_app.config.get('SAS_TOKEN')
    try:
        data = fetch_blob_data(container_url=container_url, blob_name=name, sas_token=sas_token)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api.route('/api/analyze', methods=['POST'])
def analyze():
    """
    Simple analyze stub. Accepts JSON { "blobName": "<name>" } and returns a fake prediction object.
    Replace with real vision model call if available.
    """
    payload = request.get_json(silent=True) or {}
    blob_name = payload.get('blobName') or payload.get('name')
    if not blob_name:
        return jsonify({'error': 'blobName is required'}), 400

    # TODO: replace with real analysis logic
    # Return a simple fake prediction to satisfy frontend/tests
    prediction = {
        'mango': 0.42,
        'blobName': blob_name
    }
    return jsonify({'prediction': prediction}), 200