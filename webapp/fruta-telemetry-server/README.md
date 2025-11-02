# FRUTA Telemetry Server

This directory contains the Flask-based Telemetry Viewer UI and server API used to:
- List and fetch images from Azure Blob Storage.
- Analyze images via an object-detection API (API Ninjas by default).
- Ingest and persist device telemetry for UI display.

Quick start (local)
1. Create a virtualenv and install deps:
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Create `.env` (copy from `.env.example`) and set:
   - API_NINJAS_KEY — required for object detection.
   - Either AZURE_STORAGE_CONNECTION_STRING + AZURE_STORAGE_CONTAINER_NAME (SDK mode)
     OR ACCOUNT_NAME + CONTAINER_NAME + SAS_TOKEN / CONTAINER_URL (SAS/http listing mode).
   - PORT — optional, default 5000.
3. Start server:
   ```powershell
   python app.py
   ```
4. Open the UI: http://localhost:5000

Environment variables (summary)
- API_NINJAS_KEY — API Ninjas key for /api/analyze.
- AZURE_STORAGE_CONNECTION_STRING — preferred for SDK mode.
- AZURE_STORAGE_CONTAINER_NAME — used with connection string.
- ACCOUNT_NAME, CONTAINER_NAME, SAS_TOKEN — alternative SAS-based listing.
- CONTAINER_URL — full container URL (with SAS) can be used by the frontend settings.

Useful endpoints
- GET /api/load_latest — returns { items: [...] } (newest-first).
- GET /api/fetch_blob?name=... — returns metadata and a blob_url for direct fetch.
- POST /api/analyze — send { "blobName": "..." } or { "blobUrl": "..." } to run object detection.
- POST /api/telemetry — ingest telemetry JSON from devices or scripts. Returns 204 on success.
- GET /api/messages?limit=50 — returns recent telemetry messages for the UI.
- GET /events — Server-Sent Events (SSE) for list refresh notifications.
- Debug: GET /api/debug/list_blobs, GET /api/debug/env_status, GET /api/debug/key_present

Telemetry ingestion
- The server persists a compact record of incoming telemetry; see `services/telemetry_store.py` for schema.
- Device scripts (e.g. fetch_decode_latest_blob.py) provide helpers that can POST to /api/telemetry.

Debugging tips
- If images are missing in the UI, call /api/debug/list_blobs to verify the backend listing.
- For analyze failures, check server logs for API Ninjas responses and /api/debug/key_present to ensure the key is configured.
- SSE clients may be proxied — ensure response buffering is disabled (X-Accel-Buffering: no) as provided.

Contributing
- Create a branch, update code, and add tests where applicable. Keep secrets out of commits — use .env.

Files of interest
- templates/index.html — frontend markup and client logic.
- static/js/main.js — primary browser JS (list, image preview, analyze).
- api/routes.py — server API endpoints.
- services/blob.py — blob listing/fetch helpers.
- services/telemetry_store.py — lightweight telemetry DB code.
- arduino.ino — example ESP32 device firmware (capture/upload/telemetry).

License
- MIT