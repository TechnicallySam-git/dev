from flask import Blueprint, jsonify, request, current_app, Response, stream_with_context
from services.blob import list_blobs, fetch_blob_data
import requests
import os
import time
import json

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
    Accepts JSON { "blobName": "<name>" } or { "blobUrl": "<full-url>" }.
    Fetches image bytes from blobUrl (or resolves blobName -> blob_url), sends to API Ninjas object detection,
    then returns detections and a mango_likelihood (highest confidence for labels containing 'mango' or 'fruit').
    """
    payload = request.get_json(silent=True) or {}
    blob_name = payload.get('blobName') or payload.get('name')
    blob_url = payload.get('blobUrl')

    # optional: allow caller to override containerUrl / sas
    container_url = payload.get('containerUrl') or request.args.get('containerUrl')
    sas_token = payload.get('sas') or request.args.get('sas') or current_app.config.get('SAS_TOKEN')

    if not blob_url and not blob_name:
        return jsonify({'error': 'blobName or blobUrl is required'}), 400

    # resolve blob_name -> blob_url if needed
    if blob_name and not blob_url:
        try:
            info = fetch_blob_data(container_url=container_url, blob_name=blob_name, sas_token=sas_token)
            blob_url = info.get('blob_url')
        except Exception as e:
            return jsonify({'error': f'failed to resolve blob url: {e}'}), 500

    # fetch image bytes
    try:
        resp = requests.get(blob_url, timeout=20)
        resp.raise_for_status()
        img_bytes = resp.content
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
    except Exception as e:
        return jsonify({'error': f'failed to fetch image: {e}'}), 500

    # API key
    api_key = os.getenv('API_NINJAS_KEY') or current_app.config.get('API_NINJAS_KEY')
    if not api_key:
        return jsonify({'error': 'API_NINJAS_KEY not configured on server'}), 500

    # call API Ninjas object detection
    api_url = 'https://api.api-ninjas.com/v1/objectdetection'
    files = {'image': ('image', img_bytes, content_type)}
    headers = {'X-Api-Key': api_key}

    try:
        r = requests.post(api_url, headers=headers, files=files, timeout=30)
        r.raise_for_status()
        detections = r.json() if r.text else []
    except requests.HTTPError as e:
        # include API response body if available
        body = None
        try:
            body = r.text
        except Exception:
            pass
        return jsonify({'error': 'object detection API error', 'details': str(e), 'response': body}), 502
    except Exception as e:
        return jsonify({'error': f'object detection request failed: {e}'}), 502

    # compute mango likelihood (highest confidence among labels containing 'mango' or 'fruit')
    mango_matches = []
    mango_conf = 0.0
    for d in detections:
        name = (d.get('name') or '').lower()
        conf = float(d.get('confidence') or 0.0)
        if 'mango' in name or 'fruit' in name:
            mango_matches.append(d)
            if conf > mango_conf:
                mango_conf = conf

    return jsonify({
        'detections': detections,
        'mango_matches': mango_matches,
        'mango_likelihood': mango_conf,
        'blobName': blob_name,
        'blobUrl': blob_url
    }), 200

@api.route('/events')
def events():
    """
    Server-Sent Events endpoint.
    - Clients connect with EventSource('/events').
    - The server polls the blob list periodically and sends:
      * { type: 'list', items: [...] }  -> full list (sent once when client connects)
      * { type: 'blob', name, etag, lastModified, url } -> when a new/latest blob is detected
    - Uses app config SAS_TOKEN / ACCOUNT_NAME / CONTAINER_NAME if present.
    - Poll interval is configurable via environment SSE_POLL_SEC (default 5s).
    """
    # streaming generator runs per-client and keeps its own last-seen state
    @stream_with_context
    def event_stream():
        poll_sec = int(os.getenv('SSE_POLL_SEC', '5'))
        # initial last-seen markers for this connection
        last_seen_name = None
        last_seen_etag = None
        last_seen_last_modified = None

        # send initial full list once on connect
        try:
            sas = current_app.config.get('SAS_TOKEN')
            container_url = None  # let list_blobs use ACCOUNT_NAME/CONTAINER_NAME from config
            items = list_blobs(container_url=container_url, sas_token=sas)
            # send full list event
            payload = {'type': 'list', 'items': items}
            yield f"data: {json.dumps(payload)}\n\n"
            if items and len(items) > 0:
                newest = items[0]
                last_seen_name = newest.get('name')
                last_seen_etag = newest.get('etag')
                last_seen_last_modified = newest.get('lastModified')
        except Exception:
            # on failure, still keep connection alive and retry
            yield ": error fetching initial list\n\n"

        # polling loop
        while True:
            try:
                sas = current_app.config.get('SAS_TOKEN')
                items = list_blobs(container_url=None, sas_token=sas)
                if items and len(items) > 0:
                    newest = items[0]
                    changed = False
                    # prefer etag if present
                    if newest.get('etag'):
                        if newest.get('etag') != last_seen_etag:
                            changed = True
                    elif newest.get('lastModified'):
                        if newest.get('lastModified') != last_seen_last_modified:
                            changed = True
                    else:
                        if newest.get('name') != last_seen_name:
                            changed = True

                    if changed:
                        # update markers
                        last_seen_name = newest.get('name')
                        last_seen_etag = newest.get('etag')
                        last_seen_last_modified = newest.get('lastModified')

                        # emit a compact blob event (frontend listens for type 'blob')
                        blob_evt = {
                            'type': 'blob',
                            'name': newest.get('name'),
                            'etag': newest.get('etag'),
                            'lastModified': newest.get('lastModified'),
                            'url': newest.get('url')
                        }
                        yield f"data: {json.dumps(blob_evt)}\n\n"
                # keep-alive comment every loop to prevent proxies from closing connection
                yield ":\n\n"
            except GeneratorExit:
                # client disconnected
                break
            except Exception:
                # on unexpected error, yield a comment and continue
                yield ": poll error\n\n"
            # sleep before next poll
            time.sleep(poll_sec)

    # Return a streaming response with correct headers for SSE
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
    }
    return Response(event_stream(), headers=headers)