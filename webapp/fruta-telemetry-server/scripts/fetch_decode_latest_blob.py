import os
import sys
import json
import base64
import argparse
from datetime import timezone
from azure.storage.blob import BlobServiceClient, ContainerClient
import requests

TELEMETRY_INGEST_URL = os.environ.get('TELEMETRY_INGEST_URL', 'http://localhost:5000/api/telemetry')

def post_to_server(payload):
    try:
        r = requests.post(TELEMETRY_INGEST_URL, json=payload, timeout=5)
        if r.status_code >= 400:
            print("Warning: server ingestion returned", r.status_code, r.text)
    except Exception as e:
        print("Warning: failed to POST to server:", e)

def get_container_client(args):
    # Priority: --container-sas-url, AZURE_STORAGE_CONNECTION_STRING, --account + --key
    if args.container_sas_url:
        return ContainerClient.from_container_url(args.container_sas_url)
    conn = os.environ.get('AZURE_STORAGE_CONNECTION_STRING') or args.connection_string
    if conn:
        svc = BlobServiceClient.from_connection_string(conn)
        return svc.get_container_client(args.container)
    if args.account and args.key:
        account_url = f"https://{args.account}.blob.core.windows.net"
        svc = BlobServiceClient(account_url=account_url, credential=args.key)
        return svc.get_container_client(args.container)
    raise RuntimeError("No auth provided. Use --container-sas-url or set AZURE_STORAGE_CONNECTION_STRING or provide --account/--key")

def parse_json_lines(text):
    objs = []
    text = text.strip()
    if not text:
        return objs
    # Try whole-text JSON first
    try:
        parsed = json.loads(text)
        # If it's a list, return elements; else single object
        if isinstance(parsed, list):
            return parsed
        return [parsed]
    except Exception:
        # fallback: parse line-delimited JSON
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                objs.append(json.loads(line))
            except Exception:
                # ignore unparsable lines
                pass
    return objs

def decode_body_field(obj):
    if not isinstance(obj, dict):
        return None
    # IoT Hub envelope often uses "Body" with base64
    if 'Body' in obj:
        try:
            raw = base64.b64decode(obj['Body'])
        except Exception as e:
            return {"error": f"base64 decode failed: {e}"}
        # try utf-8 decode and JSON parse
        try:
            text = raw.decode('utf-8')
        except Exception:
            text = raw.decode('latin1', errors='replace')
        try:
            payload = json.loads(text)
            return {"text": text, "payload": payload}
        except Exception:
            return {"text": text}
    # sometimes envelope has lowercase body
    if 'body' in obj:
        try:
            raw = base64.b64decode(obj['body'])
            text = raw.decode('utf-8')
            try:
                payload = json.loads(text)
                return {"text": text, "payload": payload}
            except Exception:
                return {"text": text}
        except Exception as e:
            return {"error": f"base64 decode failed: {e}"}
    return None

def main():
    p = argparse.ArgumentParser(description="Fetch newest blob from container and decode IoT Hub base64 Body field.")
    p.add_argument('--container', default='fruta-container2', help='container name (default fruta-container2)')
    p.add_argument('--account', help='storage account name (frutablob)')
    p.add_argument('--key', help='storage account key')
    p.add_argument('--connection-string', help='AZURE_STORAGE_CONNECTION_STRING (or set env var)')
    p.add_argument('--container-sas-url', help='Full container SAS URL (preferred). Example: https://acct.blob.core.windows.net/container?sv=...')
    p.add_argument('--verbose', action='store_true')
    p.add_argument('--watch', action='store_true', help='Poll container for new blobs and process them continuously')
    p.add_argument('--interval', type=int, default=20, help='Poll interval in seconds when --watch is used (default 20)')
    p.add_argument('--state-file', default='.fetch_state.json', help='Path to state file that stores last-processed timestamp')
    args = p.parse_args()

    try:
        container_client = get_container_client(args)
    except Exception as e:
        print("Auth error:", e, file=sys.stderr)
        sys.exit(2)

    def read_state(path):
        try:
            with open(path, 'r') as f:
                return json.load(f).get('last_processed')
        except Exception:
            return None

    def write_state(path, iso_ts):
        try:
            # ensure parent directory exists (atomic write)
            parent = os.path.dirname(path) or '.'
            os.makedirs(parent, exist_ok=True)
            tmp = path + '.tmp'
            with open(tmp, 'w') as f:
                json.dump({'last_processed': iso_ts}, f)
            os.replace(tmp, path)
        except Exception as e:
            print("Warning: failed to write state:", e, file=sys.stderr)

    def process_new_blobs():
        blobs = list(container_client.list_blobs())
        if not blobs:
            if args.verbose: print("No blobs found.")
            return
        # sort by last_modified ascending
        blobs.sort(key=lambda b: b.last_modified or b.creation_time)
        last_ts = read_state(args.state_file)
        to_process = []
        for b in blobs:
            lm = b.last_modified
            if not lm:
                to_process.append(b)
                continue
            iso = lm.astimezone(timezone.utc).isoformat()
            if not last_ts or iso > last_ts:
                to_process.append(b)
        if not to_process:
            if args.verbose: print("No new blobs to process.")
            return
        for b in to_process:
            if args.verbose: print("Processing blob:", b.name)
            try:
                downloader = container_client.download_blob(b.name)
                raw_bytes = downloader.readall()
            except Exception as e:
                print("Failed to download blob:", e, file=sys.stderr)
                continue
            try:
                text = raw_bytes.decode('utf-8')
            except Exception:
                text = raw_bytes.decode('latin1', errors='replace')
            objs = parse_json_lines(text)
            for i, obj in enumerate(objs):
                print(f"\n--- Blob {b.name} Record {i+1} ---")
                if isinstance(obj, dict):
                    keys = ", ".join(sorted(obj.keys()))
                    print("Top-level keys:", keys)
                decoded = decode_body_field(obj)
                if decoded is None:
                    print("No 'Body' field to decode; printing object:")
                    print(json.dumps(obj, indent=2))
                    continue
                if 'error' in decoded:
                    print("Decode error:", decoded['error'])
                    continue
                if 'payload' in decoded:
                    print("Decoded payload (parsed JSON):")
                    print(json.dumps(decoded['payload'], indent=2))
                    # forward parsed payload to server ingestion endpoint
                    post_to_server(decoded['payload'])
                else:
                    print("Decoded text:")
                    print(decoded.get('text'))
                    # try forwarding text-as-json if possible
                    try:
                        candidate = json.loads(decoded.get('text') or "{}")
                        post_to_server(candidate)
                    except Exception:
                        pass
            # update state to this blob's last_modified (UTC ISO)
            lm = b.last_modified
            if lm:
                write_state(args.state_file, lm.astimezone(timezone.utc).isoformat())

    if args.watch:
        print("Starting watch mode. Poll interval:", args.interval, "sec; state file:", args.state_file)
        try:
            while True:
                try:
                    process_new_blobs()
                except Exception as e:
                    print("Processing loop error:", e, file=sys.stderr)
                time_to_sleep = args.interval
                import time as _t; _t.sleep(time_to_sleep)
        except KeyboardInterrupt:
            print("Watch stopped by user.")
        return

    # existing single-run behavior (unchanged)
    # list blobs and pick newest by last_modified
    blobs = list(container_client.list_blobs())
    if not blobs:
        print("No blobs found in container.")
        return

    newest = max(blobs, key=lambda b: b.last_modified or b.creation_time)
    name = newest.name
    lm = newest.last_modified
    print(f"Newest blob: {name}  last_modified: {lm.astimezone(timezone.utc).isoformat() if lm else 'unknown'}")

    # download blob
    try:
        downloader = container_client.download_blob(name)
        raw_bytes = downloader.readall()
    except Exception as e:
        print("Failed to download blob:", e, file=sys.stderr)
        sys.exit(3)

    # try to interpret as text
    try:
        text = raw_bytes.decode('utf-8')
    except Exception:
        text = raw_bytes.decode('latin1', errors='replace')

    # parse potentially multiple JSON objects
    objs = parse_json_lines(text)
    if not objs:
        print("Blob content is not valid JSON or JSON-lines. Raw content printed below:\n")
        print(text)
        return

    for i, obj in enumerate(objs):
        print(f"\n--- Record {i+1} ---")
        # show top-level metadata keys if present
        if isinstance(obj, dict):
            keys = ", ".join(sorted(obj.keys()))
            print("Top-level keys:", keys)
        decoded = decode_body_field(obj)
        if decoded is None:
            print("No 'Body' field to decode; printing object:")
            print(json.dumps(obj, indent=2))
            continue
        if 'error' in decoded:
            print("Decode error:", decoded['error'])
            continue
        if 'payload' in decoded:
            print("Decoded payload (parsed JSON):")
            print(json.dumps(decoded['payload'], indent=2))
            # forward parsed payload to server ingestion endpoint
            post_to_server(decoded['payload'])
        else:
            print("Decoded text:")
            print(decoded.get('text'))

if __name__ == '__main__':
    main()