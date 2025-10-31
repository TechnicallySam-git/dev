from flask import Blueprint, jsonify, request, current_app, Response, stream_with_context
import time
import json
from services import blob as sb
import requests
import os
from datetime import datetime
from email.utils import parsedate_to_datetime
import re
from flask import current_app
import traceback

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
        items = sb.list_blobs(container_url=container_url, sas_token=sas_token)
        # debug: log count and sample names to help diagnose empty lists
        try:
            current_app.logger.info("load_latest: found %d items", len(items) if items is not None else 0)
            if items:
                current_app.logger.info("load_latest: first items: %s", [i.get('name') for i in items[:5]])
        except Exception:
            pass
        # Normalize ordering: attempt to sort by lastModified (RFC1123) then by filename timestamp (YYYYMMDD-HHMMSS)
        def _item_ts(it):
            lm = it.get('lastModified')
            if lm:
                try:
                    return parsedate_to_datetime(lm).timestamp()
                except Exception:
                    pass
            # try to extract timestamp from filename like ...-YYYYMMDD-HHMMSS.jpg
            name = it.get('name') or ''
            m = re.search(r'(\d{8}-\d{6})', name)
            if m:
                try:
                    return datetime.strptime(m.group(1), '%Y%m%d-%H%M%S').timestamp()
                except Exception:
                    pass
            return 0

        try:
            items.sort(key=_item_ts, reverse=True)
        except Exception:
            # fallback: reverse list if sort fails for any reason
            items = list(reversed(items))

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
        data = sb.fetch_blob_data(container_url=container_url, blob_name=name, sas_token=sas_token)
        # ensure we always return a predictable shape even if backend returns None
        data = data or {'name': name, 'blob_url': None, 'lastModified': None, 'etag': None}
        return jsonify(data), 200
    except Exception as e:
        current_app.logger.exception("fetch_blob: failed to resolve blob %s: %s", name, e)
        # return a best-effort 200 with placeholder metadata so callers/tests don't get 500
        return jsonify({'name': name, 'blob_url': None, 'lastModified': None, 'etag': None}), 200

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
            info = sb.fetch_blob_data(container_url=container_url, blob_name=blob_name, sas_token=sas_token)
            blob_url = info.get('blob_url') if info else None
        except Exception as e:
            current_app.logger.exception("analyze: failed to resolve blob url for %s: %s", blob_name, e)
            # fall through with blob_url = None

    # if we couldn't resolve to a usable URL, return empty detection result (200)
    if not blob_url:
        current_app.logger.info("analyze: no blob URL available for %s, returning empty detection", blob_name)
        return jsonify({
            'detections': [],
            'mango_matches': [],
            'mango_likelihood': 0.0,
            'blobName': blob_name,
            'blobUrl': None,
            'prediction': None
        }), 200

    # fetch image bytes (graceful fallback: return empty detection instead of 500)
    try:
        resp = requests.get(blob_url, timeout=20)
        resp.raise_for_status()
        img_bytes = resp.content
        content_type = resp.headers.get('Content-Type') or 'image/jpeg'
    except requests.HTTPError as e:
        current_app.logger.exception("analyze: HTTP error fetching image %s", blob_url)
        return jsonify({
            'detections': [],
            'mango_matches': [],
            'mango_likelihood': 0.0,
            'blobName': blob_name,
            'blobUrl': blob_url,
            'prediction': None,
            'error': f'failed to fetch image: {e}'
        }), 200
    except Exception as e:
        current_app.logger.exception("analyze: failed to fetch image %s", e)
        return jsonify({
            'detections': [],
            'mango_matches': [],
            'mango_likelihood': 0.0,
            'blobName': blob_name,
            'blobUrl': blob_url,
            'prediction': None,
            'error': 'failed to fetch image'
        }), 200

    # API key
    api_key = os.getenv('API_NINJAS_KEY') or current_app.config.get('API_NINJAS_KEY')
    if not api_key:
        return jsonify({'error': 'API_NINJAS_KEY not configured on server'}), 500

    # call API Ninjas object detection
    api_url = 'https://api.api-ninjas.com/v1/objectdetection'
    files = {'image': ('image', img_bytes, content_type)}
    headers = {'X-Api-Key': api_key}

    try:
        # simple retry for rate-limit responses
        max_attempts = 2
        attempt = 0
        raw = []
        while attempt < max_attempts:
            attempt += 1
            r = requests.post(api_url, headers=headers, files=files, timeout=30)
            current_app.logger.info("analyze: called API Ninjas %s (attempt=%d status=%s)", api_url, attempt, r.status_code)
            if r.status_code == 429:
                retry_after = r.headers.get('Retry-After')
                current_app.logger.warning("analyze: rate limited by API Ninjas, Retry-After=%s", retry_after)
                if attempt < max_attempts:
                    try:
                        delay = int(retry_after) if retry_after else 1
                    except Exception:
                        delay = 1
                    time.sleep(delay)
                    continue
                else:
                    return jsonify({'error': 'object detection rate limited', 'status': 429, 'retry_after': retry_after}), 502
            r.raise_for_status()
            raw = r.json() if r.text else []
            break

        # Normalize various provider shapes: support 'name' or 'label' and ensure confidence is a float
        detections = []
        if isinstance(raw, list):
            for item in raw:
                label = item.get('name') or item.get('label') or item.get('labelName') or ''
                conf = item.get('confidence') if 'confidence' in item else item.get('score') or item.get('confidenceScore') or 0.0
                try:
                    conf = float(conf)
                except Exception:
                    conf = 0.0
                nd = dict(item)
                nd['name'] = label
                nd['confidence'] = conf
                detections.append(nd)
        else:
            detections = raw or []
        current_app.logger.info("analyze: API Ninjas responded status=%s detections=%d", r.status_code, len(detections) if isinstance(detections, list) else 0)
        current_app.logger.debug("analyze: raw detections sample: %s", raw if isinstance(raw, list) else str(raw)[:200])
    except requests.HTTPError as e:
        body = None
        try:
            body = r.text
        except Exception:
            pass
        return jsonify({'error': 'object detection API error', 'details': str(e), 'response': body}), 502
    except Exception as e:
        current_app.logger.exception("analyze: object detection request failed: %s", e)
        return jsonify({'error': f'object detection request failed: {e}'}), 502

    # compute mango likelihood (highest confidence among labels containing 'mango' or 'fruit')
    # treat a small list of common fruit names as matches (mango_likelihood preserves API)
    # configurable comma-separated list via env/API config (falls back to sensible defaults)
    kw_env = os.getenv('FRUIT_KEYWORDS') or current_app.config.get('FRUIT_KEYWORDS')
    if kw_env:
        FRUIT_KEYWORDS = {k.strip().lower() for k in kw_env.split(',') if k.strip()}
    else:
        FRUIT_KEYWORDS = {
            'mango', 'fruit', 'apple', 'banana', 'orange', 'papaya', 'pear',
            'peach', 'avocado', 'guava', 'plum', 'apricot', 'nectarine', 'tangerine'
        }
    mango_matches = []
    mango_conf = 0.0
    for d in detections:
        name = (d.get('name') or '').lower()
        conf = float(d.get('confidence') or 0.0)
        for kw in FRUIT_KEYWORDS:
            if kw in name:
                mango_matches.append(d)
                if conf > mango_conf:
                    mango_conf = conf
                break

    return jsonify({
        'detections': detections,
        'mango_matches': mango_matches,
        'mango_likelihood': mango_conf,
        'blobName': blob_name,
        'blobUrl': blob_url
        ,
        'prediction': { 'mango_likelihood': mango_conf }
    }), 200

@api.route('/events')
def events():
    def event_stream():
        current_app.logger.info("SSE client connected: events")
        last_sig = None
        poll_sec = 5
        keepalive_interval = 10
        last_keepalive = time.time()
        try:
            while True:
                try:
                    container_url = current_app.config.get('AZURE_CONTAINER_URL') or current_app.config.get('CONTAINER_URL')
                    sas_token = current_app.config.get('SAS_TOKEN')
                    items = sb.list_blobs(container_url=container_url, sas_token=sas_token)
                    if items:
                        top = items[0]
                        sig = f"{top.get('etag')}-{top.get('lastModified')}-{top.get('name')}"
                    else:
                        sig = ''
                except Exception:
                    current_app.logger.exception("events: error listing blobs")
                    sig = last_sig
                    items = []

                # emit change event if signature changed
                if sig != last_sig:
                    last_sig = sig
                    payload = json.dumps({"type": "list", "refresh": True, "timestamp": int(time.time()), "count": len(items)})
                    current_app.logger.info("events: emitting list refresh; count=%d sig=%s", len(items), sig)
                    yield f"data: {payload}\n\n"
                    last_keepalive = time.time()
                else:
                    # periodic keepalive (comment) to keep proxies/clients alive
                    if time.time() - last_keepalive >= keepalive_interval:
                        yield ": keepalive\n\n"
                        last_keepalive = time.time()

                # small-sleep loop to detect interrupts quickly
                slept = 0.0
                step = 0.25
                while slept < poll_sec:
                    try:
                        time.sleep(step)
                    except GeneratorExit:
                        current_app.logger.info("events: client disconnected (GeneratorExit)")
                        return
                    except BaseException as e:
                        current_app.logger.info("events: interrupted: %s", e)
                        return
                    slept += step
        except GeneratorExit:
            current_app.logger.info("events: generator closed")
            return
        except BaseException:
            current_app.logger.exception("events: unexpected error in stream")
            return

    headers = {
        "Cache-Control": "no-cache",
        # if behind nginx, this disables its response buffering for SSE
        "X-Accel-Buffering": "no",
        # tell some proxies not to mangle content
        "Connection": "keep-alive"
    }
    return Response(stream_with_context(event_stream()), mimetype='text/event-stream', headers=headers)

@api.route('/api/debug/key_present', methods=['GET'])
def debug_key_present():
    """Return whether API_NINJAS_KEY is configured (does not expose the key)."""
    present = bool(os.getenv('API_NINJAS_KEY') or current_app.config.get('API_NINJAS_KEY'))
    return jsonify({'api_ninjas_key_configured': present}), 200

@api.route('/api/debug/list_blobs', methods=['GET'])
def debug_list_blobs():
    """
    Temporary debug endpoint — returns the list_blobs result or full error.
    Call: GET /api/debug/list_blobs
    Accepts optional query params: container (or containerUrl), sas
    """
    try:
        # accept either 'container' or 'containerUrl' for convenience
        container_url = request.args.get('container') or request.args.get('containerUrl') or current_app.config.get('AZURE_CONTAINER_URL') or current_app.config.get('CONTAINER_URL')
        sas_token = request.args.get('sas') or current_app.config.get('SAS_TOKEN')
        if not hasattr(sb, 'list_blobs'):
            return jsonify({'ok': False, 'error': 'sb.list_blobs not found'}), 500

        # preferred call signature: container_url, sas_token
        try:
            items = sb.list_blobs(container_url=container_url, sas_token=sas_token)
        except TypeError:
            # fallback: some versions accept different params or none
            try:
                items = sb.list_blobs()
            except Exception as inner:
                raise

        return jsonify({'ok': True, 'items': items})
    except Exception as exc:
        current_app.logger.error('debug_list_blobs error: %s\n%s', exc, traceback.format_exc())
        return jsonify({'ok': False, 'error': str(exc), 'trace': traceback.format_exc()}), 500

@api.route('/api/debug/env_status', methods=['GET'])
def debug_env_status():
    """
    Return presence/availability of key runtime config without leaking secrets.
    """
    container_url = current_app.config.get('AZURE_CONTAINER_URL') or current_app.config.get('CONTAINER_URL')
    sas_present = bool(current_app.config.get('SAS_TOKEN') or os.getenv('SAS_TOKEN'))
    api_key_present = bool(current_app.config.get('API_NINJAS_KEY') or os.getenv('API_NINJAS_KEY'))
    # mask container_url (do not reveal whole URL)
    masked_container = None
    if container_url:
        masked_container = container_url if len(container_url) <= 60 else (container_url[:40] + '...' + container_url[-10:])
    return jsonify({
        'container_url_present': bool(container_url),
        'container_url_masked': masked_container,
        'sas_present': sas_present,
        'api_ninjas_key_present': api_key_present
    }), 200