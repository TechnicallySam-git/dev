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
        img.src = item.url; // Assuming item.url contains the image URL
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

    function toggleAutoRefresh() {
        // Implement auto-refresh logic here
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