from azure.storage.blob import BlobServiceClient
from urllib.parse import urlparse, urljoin
from xml.etree import ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime, format_datetime
import os
import requests
import re
import logging

logger = logging.getLogger(__name__)

def _append_sas(url, sas_token):
    """Append SAS token to url using '?' or '&' as appropriate."""
    if not sas_token:
        return url
    token = str(sas_token).lstrip('?&')
    sep = '&' if '?' in url else '?'
    return f"{url}{sep}{token}"

def _build_sas_suffix(sas_token):
    if not sas_token:
        return ''
    s = str(sas_token)
    return ('?' + s.lstrip('?')) if s else ''

def _format_rfc1123(dt):
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime):
        # ensure UTC and RFC1123 format
        try:
            d = dt.astimezone(timezone.utc)
            # format_datetime returns RFC 5322 style; produce RFC1123-compatible string
            return d.strftime('%a, %d %b %Y %H:%M:%S GMT')
        except Exception:
            return dt.isoformat()
    return str(dt)

def _blob_ts(it):
    # normalize lastModified RFC1123 -> timestamp, fallback to filename timestamp, else 0
    lm = it.get('lastModified')
    if lm:
        try:
            # parsedate_to_datetime handles RFC1123-like strings
            return parsedate_to_datetime(lm).timestamp()
        except Exception:
            try:
                # maybe it's an ISO string
                return datetime.fromisoformat(lm).timestamp()
            except Exception:
                pass
    # try filename pattern like YYYYMMDD-HHMMSS
    name = it.get('name') or ''
    m = re.search(r'(\d{8}-\d{6})', name)
    if m:
        try:
            return datetime.strptime(m.group(1), '%Y%m%d-%H%M%S').timestamp()
        except Exception:
            pass
    return 0

class BlobService:
    """
    Thin wrapper that tries SDK if AZURE_STORAGE_CONNECTION_STRING is set,
    otherwise uses container_url + SAS (if provided) and simple REST calls.
    """

    def __init__(self, container_url=None, sas_token=None):
        self.conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.account = os.getenv("AZURE_STORAGE_ACCOUNT") or os.getenv("ACCOUNT_NAME")
        self.container_env = os.getenv("AZURE_STORAGE_CONTAINER_NAME") or os.getenv("CONTAINER_NAME")
        self.container_url = container_url or os.getenv("AZURE_CONTAINER_URL") or (f"https://{self.account}.blob.core.windows.net/{self.container_env}" if self.account and self.container_env else None)
        self.sas_token = sas_token or os.getenv("SAS_TOKEN")
        # remove previous prebuilt suffix; use _append_sas at call sites
        self._sdk = None
        if self.conn_str:
            try:
                self._sdk = BlobServiceClient.from_connection_string(self.conn_str)
            except Exception:
                self._sdk = None

    def list_blobs(self):
        items = []
        # SDK path
        if self._sdk:
            try:
                container_name = self.container_env
                if not container_name:
                    # try to get from container_url if available
                    if self.container_url:
                        u = urlparse(self.container_url)
                        # path like /container
                        container_name = u.path.strip('/').split('/')[-1]
                if not container_name:
                    raise RuntimeError("container name not configured (AZURE_STORAGE_CONTAINER_NAME or container_url required)")

                cl = self._sdk.get_container_client(container_name)
                for blob in cl.list_blobs():
                    blob_client = self._sdk.get_blob_client(container=container_name, blob=blob.name)
                    items.append({
                        'name': blob.name,
                        'lastModified': _format_rfc1123(getattr(blob, 'last_modified', None)),
                        'etag': getattr(blob, 'etag', None),
                        'url': blob_client.url
                    })
                # sort by timestamp (newest first)
                items.sort(key=_blob_ts, reverse=True)
                return items
            except Exception:
                # fallthrough to REST attempt if SDK listing fails
                pass

        # REST path using container_url + ?restype=container&comp=list (requires SAS or public container)
        if not self.container_url:
            return []  # nothing we can do
        try:
            u = self.container_url.rstrip('/')
            list_url = f"{u}?restype=container&comp=list"
            list_url = _append_sas(list_url, self.sas_token)
            r = requests.get(list_url, timeout=15)
            r.raise_for_status()
            xml = ET.fromstring(r.content)
            for blob in xml.findall('.//Blob'):
                name_el = blob.find('Name')
                props = blob.find('Properties')
                last_mod = props.findtext('Last-Modified') if props is not None else None
                etag = props.findtext('Etag') if props is not None else None
                name = name_el.text if name_el is not None else ''
                blob_url = f"{u}/{name}"
                blob_url = _append_sas(blob_url, self.sas_token)
                items.append({'name': name, 'lastModified': last_mod, 'etag': etag, 'url': blob_url})
            items.sort(key=_blob_ts, reverse=True)
            return items
        except Exception:
            return []

    def fetch_blob_data(self, blob_name):
        """
        Return metadata dict for blob (including blob_url).
        """
        if not blob_name:
            raise ValueError("blob_name required")

        # SDK path
        if self._sdk:
            try:
                container_name = self.container_env
                if not container_name and self.container_url:
                    u = urlparse(self.container_url)
                    container_name = u.path.strip('/').split('/')[-1]
                if not container_name:
                    raise RuntimeError("container name not configured")

                blob_client = self._sdk.get_blob_client(container=container_name, blob=blob_name)
                props = blob_client.get_blob_properties()
                return {
                    'name': blob_name,
                    'lastModified': _format_rfc1123(getattr(props, 'last_modified', None)),
                    'etag': getattr(props, 'etag', None),
                    'blob_url': blob_client.url
                }
            except Exception:
                # fall back to REST below
                pass

        # REST path
        if not self.container_url:
            raise RuntimeError("container_url or connection string required to resolve blob url")
        u = self.container_url.rstrip('/')
        blob_url = f"{u}/{blob_name}"
        blob_url = _append_sas(blob_url, self.sas_token)
        # try a HEAD to get properties if permitted
        try:
            r = requests.head(blob_url, timeout=10)
            if r.status_code in (200, 206):
                last_mod = r.headers.get('Last-Modified') or r.headers.get('last-modified')
                etag = r.headers.get('ETag') or r.headers.get('etag')
                return {'name': blob_name, 'lastModified': last_mod, 'etag': etag, 'blob_url': blob_url}
        except Exception:
            pass
        # best-effort
        return {'name': blob_name, 'lastModified': None, 'etag': None, 'blob_url': blob_url}

    def fetch_blob_content(self, blob_name):
        """
        Return raw bytes for blob_name. Uses SDK if available, else HTTP GET.
        """
        if not blob_name:
            raise ValueError("blob_name required")

        # SDK path
        if self._sdk:
            try:
                container_name = self.container_env
                if not container_name and self.container_url:
                    u = urlparse(self.container_url)
                    container_name = u.path.strip('/').split('/')[-1]
                blob_client = self._sdk.get_blob_client(container=container_name, blob=blob_name)
                stream = blob_client.download_blob()
                return stream.readall()
            except Exception:
                pass

        # REST path
        if not self.container_url:
            raise RuntimeError("container_url or connection string required to fetch blob content")
        blob_url = f"{self.container_url.rstrip('/')}/{blob_name}"
        blob_url = _append_sas(blob_url, self.sas_token)
        r = requests.get(blob_url, timeout=30)
        r.raise_for_status()
        return r.content

# Module-level convenience wrappers used by the app
def list_blobs(container_url=None, sas_token=None):
    svc = BlobService(container_url=container_url, sas_token=sas_token)
    return svc.list_blobs()

def fetch_blob_data(container_url=None, blob_name=None, sas_token=None):
    svc = BlobService(container_url=container_url, sas_token=sas_token)
    return svc.fetch_blob_data(blob_name)

def fetch_blob_content(container_url=None, blob_name=None, sas_token=None):
    svc = BlobService(container_url=container_url, sas_token=sas_token)
    return svc.fetch_blob_content(blob_name)