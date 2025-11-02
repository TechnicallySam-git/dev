# FRUTA Telemetry Viewer — monorepo overview

FRUTA Telemetry Viewer is a small project that demonstrates:
- A Flask web UI that lists images from Azure Blob Storage and runs object-detection.
- A simple telemetry ingestion API used by devices.
- Example device code for capturing images and uploading telemetry.

Quick start (dev)
1. Create and activate a Python virtualenv:
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Copy `.env.example` -> `.env` and set the values described below.
3. Run the server:
   ```powershell
   python app.py
   ```
   Open http://localhost:5000

Important server env vars
- API_NINJAS_KEY — required for /api/analyze (object detection).
- AZURE_STORAGE_CONNECTION_STRING — optional, used by SDK mode in services/blob.py.
- ACCOUNT_NAME / CONTAINER_NAME / SAS_TOKEN — alternative SAS-based listing mode.
- PORT — optional HTTP port (default 5000).

Key server endpoints
- GET /api/load_latest — returns latest blobs as JSON { items: [...] }.
- GET /api/fetch_blob?name=... — returns metadata including blob_url.
- POST /api/analyze — accepts { "blobName": "..." } or { "blobUrl": "..." } and returns detections.
- POST /api/telemetry — device ingestion endpoint (used by scripts and devices).
- GET /api/messages — returns recent stored telemetry messages (JSON).
- GET /events — SSE stream for list/refresh notifications.

Telemetry & device notes
- The telemetry endpoint stores lightweight records used by the UI. For large payloads consider storing full API responses to Blob Storage and saving references in the DB.
- Example device code (ESP32) is in `arduino.ino`. It uploads images to blob via SAS and posts telemetry to the server.

Testing
- Run tests with pytest:
  ```powershell
  pip install pytest
  pytest -q
  ```
- Some tests may require network access or environment variables; run with mocks in CI.

Troubleshooting
- If blob listing returns empty items, verify CONTAINER_URL/SAS or SDK connection string.
- If /api/analyze returns 500 or error, verify API_NINJAS_KEY and check server logs.
- Use the debug endpoints: /api/debug/list_blobs and /api/debug/env_status.

Where to look
- Server: `app.py`, `api/routes.py`, `services/blob.py`
- Frontend: `templates/index.html`, `static/js/main.js`
- Device example: `arduino.ino`

License
- MIT