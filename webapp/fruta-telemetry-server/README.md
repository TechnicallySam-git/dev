# FRUTA Telemetry Viewer

Overview
--------
FRUTA Telemetry Viewer is a small Flask web app that lists images from Azure Blob Storage and allows analyzing them with an object‑detection API. The app entrypoint is [`app.py`](app.py). Server API routes are in [`api/routes.py`](api/routes.py). Blob helpers live in [`services/blob.py`](services/blob.py).

Quick start
-----------
1. Create & activate a virtualenv (Windows example):
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy and edit `.env.example` -> `.env`. Recommended values (the app reads multiple env names for convenience):

   - For simple REST/SAS access:
     - ACCOUNT_NAME (e.g. frutablob)
     - CONTAINER_NAME (e.g. frutacontainer)
     - SAS_TOKEN (optional) — client and server code accept SAS tokens

   - For SDK / connection string usage (used by `BlobService` in `services/blob.py`):
     - AZURE_STORAGE_CONNECTION_STRING
     - AZURE_STORAGE_CONTAINER_NAME

   - App / runtime:
     - PORT (optional, default 5000)
     - API_NINJAS_KEY (required for /api/analyze to call the object detection API)

   See [.env.example](.env.example) for an example format.

Configuration details
---------------------
- The Flask app (`app.py`) loads env vars into `app.config`:
  - `ACCOUNT_NAME` / `AZURE_STORAGE_ACCOUNT`
  - `CONTAINER_NAME` / `AZURE_STORAGE_CONTAINER`
  - `SAS_TOKEN` / `AZURE_STORAGE_SAS_TOKEN`
  - `API_NINJAS_KEY`

- Blob listing / metadata:
  - `services/blob.py` supports two modes:
    - HTTP List API using account/container + SAS or caller-provided container URL (it parses the XML list).
    - SDK mode via `BlobService` using `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER_NAME`.

- API endpoints of interest (implemented in [`api/routes.py`](api/routes.py)):
  - GET `/api/load_latest` — returns JSON { items: [...] }
  - GET `/api/fetch_blob?name=...` — returns blob metadata (blob_url)
  - POST `/api/analyze` — accepts `{ "blobName": "..."} or {"blobUrl": "..."}` and returns detection results
  - GET `/events` — SSE endpoint that pushes list/blob events

Running the app
---------------
Run locally:
```powershell
python app.py
```
Open http://localhost:5000 (port can be overridden with PORT env var).

Testing
-------
Run the included tests with pytest:
```powershell
pip install pytest
pytest -q
```
Tests live at [`tests/test_app.py`](tests/test_app.py). Note: some tests assume network or dummy responses; adjust environment variables or mocks when running in CI/local.

Frontend
--------
- Main template: [`templates/index.html`](templates/index.html)
- Client logic: [`static/js/main.js`](static/js/main.js)
- Styles: [`static/css/styles.css`](static/css/styles.css)

Notes and troubleshooting
-------------------------
- If you prefer the Azure Cosmos/SDK style configuration, set `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER_NAME` — `BlobService` will use the SDK methods.
- The frontend saves a few settings to localStorage and can POST server settings (the UI expects `/api/settings` to exist in some deployments — not present by default). Review [`api/routes.py`](api/routes.py) and the frontend code if you need to persist server-side API keys or add a settings endpoint.
- For local development of blob listing, either point the app to a real storage account or provide a container listing URL (with SAS) in the UI Settings panel.

Files of interest
-----------------
- [`app.py`](app.py)
- [`api/routes.py`](api/routes.py)
- [`services/blob.py`](services/blob.py)
- [`templates/index.html`](templates/index.html)
- [`static/js/main.js`](static/js/main.js)
- [`tests/test_app.py`](tests/test_app.py)
- [`requirements.txt`](requirements.txt)
- [`.env.example` ](.env.example)

License
-------
MIT