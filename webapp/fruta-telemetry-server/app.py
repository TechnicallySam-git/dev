from flask import Flask, render_template, request, Response, url_for
from dotenv import load_dotenv
import os
import io
import mimetypes
import logging

# load .env (if present)
load_dotenv()

# import the API blueprint
from api import routes as api_routes
# import your blob service
from services.blob import BlobService

app = Flask(__name__)

# Load environment variables into app config (used by services)
app.config['ACCOUNT_NAME'] = os.getenv('ACCOUNT_NAME') or os.getenv('AZURE_STORAGE_ACCOUNT')
app.config['CONTAINER_NAME'] = os.getenv('CONTAINER_NAME') or os.getenv('AZURE_STORAGE_CONTAINER')
app.config['SAS_TOKEN'] = os.getenv('SAS_TOKEN') or os.getenv('AZURE_STORAGE_SAS_TOKEN')
app.config['AZURE_STORAGE_CONNECTION_STRING'] = os.getenv('AZURE_STORAGE_CONNECTION_STRING') or os.getenv('CONN') or os.getenv('AZURE_CONN')
# Add API Ninjas key to app config (can be updated at runtime via /api/settings)
app.config['API_NINJAS_KEY'] = os.getenv('API_NINJAS_KEY')

# Register API blueprint
app.register_blueprint(api_routes.api)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/fetch_blob_content')
def fetch_blob_content():
    # query param: ?name=<blob-name>
    name = request.args.get('name')
    if not name:
        return {"error": "name required"}, 400

    try:
        svc = BlobService()
        content = svc.fetch_blob_content(name)  # returns bytes
        if content is None:
            return {"error": "not found"}, 404

        # guess content type by extension as a fallback
        ctype, _ = mimetypes.guess_type(name)
        if not ctype:
            ctype = 'application/octet-stream'

        return Response(content, mimetype=ctype)
    except Exception as ex:
        logging.exception("fetch_blob_content failed for %s", name)
        return {"error": "internal server error"}, 500

@app.context_processor
def override_url_for():
    # return a wrapper that only overrides 'static' endpoint and delegates to Flask's url_for otherwise
    def new_url_for(endpoint, **values):
        if endpoint == 'static':
            return '/static/' + values.get('filename', '')
        return url_for(endpoint, **values)
    return dict(url_for=new_url_for)

if __name__ == '__main__':
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    debug = bool(int(os.getenv('FLASK_DEBUG', '0')))
    app.run(host=host, port=port, debug=debug)