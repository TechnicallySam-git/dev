import pytest
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_index(client):
    response = client.get('/')
    assert response.status_code == 200
    assert b'FRUTA Telemetry Viewer' in response.data

def test_load_latest(client):
    response = client.get('/api/load_latest')
    assert response.status_code == 200
    assert 'application/json' in response.content_type

def test_fetch_blob(client):
    response = client.get('/api/fetch_blob?name=test_blob.jpg')
    assert response.status_code == 200
    assert b'blob_url' in response.data  # Assuming the response contains a blob_url key

def test_analyze_image(client):
    response = client.post('/api/analyze', json={'blobName': 'test_blob.jpg'})
    assert response.status_code == 200
    assert 'prediction' in response.get_json()  # Check if prediction is in the response