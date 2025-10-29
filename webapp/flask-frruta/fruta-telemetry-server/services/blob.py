from azure.storage.blob import BlobServiceClient
import os
import requests
from urllib.parse import urljoin, urlparse, urlencode
from xml.etree import ElementTree as ET

def _build_sas_suffix(sas_token):
    if not sas_token:
        return ''
    return sas_token if sas_token.startswith('?') else ('?' + sas_token)

def list_blobs(container_url=None, sas_token=None):
    """
    Return list of blobs as dicts: { name, lastModified, etag, url }
    If container_url is provided it will be used (expects Azure List XML or container url).
    Otherwise uses environment ACCOUNT_NAME/CONTAINER_NAME and optional SAS_TOKEN to build and call list REST API.
    If network/credentials missing, returns empty list.
    """
    account = os.getenv('ACCOUNT_NAME')
    container = os.getenv('CONTAINER_NAME')

    # allow caller provided SAS fallback to env
    sas_token = sas_token or os.getenv('SAS_TOKEN')

    # If container_url was provided, request it (ensure comp=list/restype=container is present)
    if container_url:
        try:
            u = urlparse(container_url)
            q = u.query
            if 'comp=list' not in q and 'restype=container' not in q:
                sep = '&' if q else '?'
                container_url = container_url + f"{sep}restype=container&comp=list"
            resp = requests.get(container_url, timeout=10)
            resp.raise_for_status()
            xml = ET.fromstring(resp.text)
            items = []
            for blob in xml.findall('.//Blob'):
                name_el = blob.find('Name')
                props = blob.find('Properties')
                last_mod = props.findtext('Last-Modified') if props is not None else None
                etag = props.findtext('Etag') if props is not None else None
                name = name_el.text if name_el is not None else ''
                # build direct URL (reuse container origin + path)
                origin = f"{u.scheme}://{u.netloc}"
                path = u.path.rstrip('/')

                blob_url = f"{origin}{path}/{name}{_build_sas_suffix(sas_token or ('?' + u.query if u.query else ''))}"
                items.append({'name': name, 'lastModified': last_mod, 'etag': etag, 'url': blob_url})
            # sort newest-first by lastModified if present
            items.sort(key=lambda i: i.get('lastModified') or '', reverse=True)
            return items
        except Exception:
            # on failure return an empty list instead of raising (caller can handle)
            return []

    # If no container_url, try using account/container from env
    if account and container:
        try:
            # construct list URL
            base = f"https://{account}.blob.core.windows.net/{container}"
            list_url = f"{base}?restype=container&comp=list{_build_sas_suffix(sas_token)}"
            resp = requests.get(list_url, timeout=10)
            resp.raise_for_status()
            xml = ET.fromstring(resp.text)
            items = []
            for blob in xml.findall('.//Blob'):
                name_el = blob.find('Name')
                props = blob.find('Properties')
                last_mod = props.findtext('Last-Modified') if props is not None else None
                etag = props.findtext('Etag') if props is not None else None
                name = name_el.text if name_el is not None else ''
                blob_url = f"{base}/{name}{_build_sas_suffix(sas_token)}"
                items.append({'name': name, 'lastModified': last_mod, 'etag': etag, 'url': blob_url})
            items.sort(key=lambda i: i.get('lastModified') or '', reverse=True)
            return items
        except Exception:
            return []

    # No credentials / info available — return a minimal mocked list so UI/tests still work
    return [{'name': 'example.jpg', 'lastModified': None, 'etag': None, 'url': f'https://example.invalid/example.jpg'}]

def fetch_blob_data(container_url=None, blob_name=None, sas_token=None):
    """
    Return a dict with at least 'blob_url' and 'name'. If the blob content is small and available,
    you could fetch and return the content as text (not done by default).
    """
    if not blob_name:
        raise ValueError('blob_name required')

    account = os.getenv('ACCOUNT_NAME')
    container = os.getenv('CONTAINER_NAME')
    sas_token = sas_token or os.getenv('SAS_TOKEN')

    if container_url:
        try:
            u = urlparse(container_url)
            origin = f"{u.scheme}://{u.netloc}"
            path = u.path.rstrip('/')

            blob_url = f"{origin}{path}/{blob_name}{_build_sas_suffix(sas_token or ('?' + u.query if u.query else ''))}"
            return {'name': blob_name, 'blob_url': blob_url}
        except Exception:
            pass

    if account and container:
        blob_url = f"https://{account}.blob.core.windows.net/{container}/{blob_name}{_build_sas_suffix(sas_token)}"
        return {'name': blob_name, 'blob_url': blob_url}

    # fallback
    return {'name': blob_name, 'blob_url': f'https://example.invalid/{blob_name}'}

class BlobService:
    def __init__(self):
        self.blob_service_client = BlobServiceClient.from_connection_string(os.getenv("AZURE_STORAGE_CONNECTION_STRING"))
        self.container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME")

    def list_blobs(self):
        container_client = self.blob_service_client.get_container_client(self.container_name)
        return [blob.name for blob in container_client.list_blobs()]

    def get_blob_url(self, blob_name):
        blob_client = self.blob_service_client.get_blob_client(container=self.container_name, blob=blob_name)
        return blob_client.url

    def fetch_blob_content(self, blob_name):
        blob_client = self.blob_service_client.get_blob_client(container=self.container_name, blob=blob_name)
        stream = blob_client.download_blob()
        return stream.readall()