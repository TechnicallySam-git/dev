from flask import Flask, render_template
import os
from dotenv import load_dotenv

# load .env (if present)
load_dotenv()

# import the API blueprint
from api import routes as api_routes

app = Flask(__name__)

# Load environment variables into app config (used by services)
app.config['ACCOUNT_NAME'] = os.getenv('ACCOUNT_NAME') or os.getenv('AZURE_STORAGE_ACCOUNT')
app.config['CONTAINER_NAME'] = os.getenv('CONTAINER_NAME') or os.getenv('AZURE_STORAGE_CONTAINER')
app.config['SAS_TOKEN'] = os.getenv('SAS_TOKEN') or os.getenv('AZURE_STORAGE_SAS_TOKEN')

# Register API blueprint
app.register_blueprint(api_routes.api)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)