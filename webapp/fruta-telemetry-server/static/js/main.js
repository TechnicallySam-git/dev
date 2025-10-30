// This file contains JavaScript code for handling user interactions, such as loading images and displaying telemetry messages when an image is clicked.

document.addEventListener('DOMContentLoaded', () => {
    const loadLatestButton = document.getElementById('go');
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const listElement = document.getElementById('list');
    const imgWrap = document.getElementById('imgwrap');
    const photoInfo = document.getElementById('photoInfo');
    const detectionBadge = document.getElementById('detectionBadge');
    const analyzeSelectedButton = document.getElementById('analyzeSelected');

    let currentItems = [];
    let selectedIndex = -1;

    loadLatestButton.addEventListener('click', loadLatest);
    autoRefreshToggle.addEventListener('click', toggleAutoRefresh);
    analyzeSelectedButton.addEventListener('click', analyzeSelected);

    function loadLatest() {
        fetch('/api/images')
            .then(response => response.json())
            .then(data => {
                currentItems = data.items;
                // reverse so newest items show first (top)
                if (Array.isArray(currentItems) && currentItems.length > 1) {
                    currentItems.reverse();
                }
                renderList(currentItems);
                if (currentItems.length > 0) {
                    loadItem(0);
                }
            })
            .catch(error => console.error('Error loading images:', error));
    }

    function renderList(items) {
        listElement.innerHTML = '';
        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
                <div><strong>${item.name}</strong><div class="time">${item.lastModified || ''}</div></div>
                <div class="muted">#${index + 1}</div>
            </div>`;
            div.onclick = () => loadItem(index);
            listElement.appendChild(div);
        });
    }

    function loadItem(index) {
        selectedIndex = index;
        const item = currentItems[index];
        imgWrap.innerHTML = '';
        photoInfo.textContent = '';
        detectionBadge.style.display = 'none';

        const img = document.createElement('img');
        img.src = '/api/fetch_blob_content?name=' + encodeURIComponent(item.name);
        img.alt = 'Telemetry Image';
        imgWrap.appendChild(img);

        if (item.timestamp) {
            photoInfo.textContent = item.timestamp;
        }
        if (item.detection) {
            detectionBadge.style.display = 'inline-block';
            detectionBadge.textContent = `Detection: ${item.detection}`;
        }
    }

    // Auto-refresh controller
    let autoRefreshEnabled = false;
    let _sse = null;
    let _pollTimer = null;

    function updateAutoRefreshButton() {
        const btn = document.getElementById('auto-refresh-btn');
        if (!btn) return;
        btn.textContent = autoRefreshEnabled ? 'Auto refresh: ON' : 'Auto refresh: OFF';
        btn.classList.toggle('active', autoRefreshEnabled);
    }

    function startPolling() {
        stopPolling();
        // poll every 5s
        _pollTimer = setInterval(() => {
            if (typeof awaitLoadLatest === 'function') awaitLoadLatest();
            else if (typeof loadLatest === 'function') loadLatest();
        }, 5000);
    }

    function stopPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
    }

    function startSSE() {
        stopSSE();
        try {
            _sse = new EventSource('/events');
            _sse.onopen = () => console.info('SSE open');
            _sse.onmessage = (ev) => {
                // server sent notification -> refresh list
                if (typeof awaitLoadLatest === 'function') awaitLoadLatest();
                else if (typeof loadLatest === 'function') loadLatest();
            };
            _sse.onerror = (e) => {
                console.warn('SSE error, falling back to polling', e);
                stopSSE();
                startPolling();
            };
        } catch (e) {
            console.warn('SSE not supported, using polling', e);
            startPolling();
        }
    }

    function stopSSE() {
        if (_sse) {
            _sse.close();
            _sse = null;
        }
    }

    function toggleAutoRefresh(forceState) {
        autoRefreshEnabled = (typeof forceState === 'boolean') ? forceState : !autoRefreshEnabled;
        updateAutoRefreshButton();
        if (autoRefreshEnabled) {
            // prefer SSE, fallback to polling inside startSSE
            startSSE();
            // do an immediate refresh
            if (typeof awaitLoadLatest === 'function') awaitLoadLatest();
            else if (typeof loadLatest === 'function') loadLatest();
        } else {
            stopSSE();
            stopPolling();
        }
    }

    function analyzeSelected() {
        if (selectedIndex < 0) return;
        const item = currentItems[selectedIndex];
        fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blobName: item.name })
        })
        .then(response => response.json())
        .then(data => {
            alert('Analyze result: ' + JSON.stringify(data.prediction || data, null, 2));
        })
        .catch(error => alert('Analyze failed: ' + error.message));
    }

    // Load the latest images on initial page load
    loadLatest();
});