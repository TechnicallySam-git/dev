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
    let lastDrawnDetections = [];
    // Chart.js instance for detection confidences
    let detectionsChart = null;
    // Helper: render detections as a horizontal bar chart using Chart.js
    function renderDetectionsChart(detections) {
        try {
            const canvas = document.getElementById('trendChart');
            if (!canvas) return;
            // ensure detections is an array
            const items = Array.isArray(detections) ? detections : [];
            const labels = items.map(d => d.name || d.label || '(unknown)');
            const data = items.map(d => Math.round((Number(d.confidence || 0) || 0) * 100));
            const bg = items.map(d => {
                const n = (d.name || d.label || '').toString().toLowerCase();
                return (n.includes('mango') || n.includes('fruit')) ? '#ff8c00' : '#6c6f73';
            });

            // destroy previous chart if exists
            if (detectionsChart) {
                try { detectionsChart.destroy(); } catch (e) { /* ignore */ }
                detectionsChart = null;
            }

            // create Chart.js chart (horizontal bar)
            detectionsChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Confidence %',
                        data: data,
                        backgroundColor: bg,
                        borderRadius: 6,
                        barThickness: 18
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}%` } }
                    },
                    scales: {
                        x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
                        y: { ticks: { autoSkip: false } }
                    }
                }
            });
        } catch (e) {
            console.warn('renderDetectionsChart failed', e);
        }
    }

    // Wait until preview image has a layout size (use before drawing overlays)
    function waitForPreviewImage(timeout = 1500) {
        return new Promise(resolve => {
            const img = document.getElementById('preview-img');
            if (!img) return resolve(false);
            // already sized?
            const w = img.clientWidth || img.offsetWidth || img.naturalWidth;
            if (w && w > 0) return resolve(true);
            const onLoad = () => resolve(true);
            img.addEventListener('load', onLoad, { once: true });
            // fallback timeout
            setTimeout(() => {
                img.removeEventListener('load', onLoad);
                const ok = !!(img.clientWidth || img.offsetWidth || img.naturalWidth);
                resolve(ok);
            }, timeout);
        });
    }

    // Guards to avoid duplicate analyze calls
    const inFlightAnalyses = new Set(); // keys: blobUrl or blobName
    let lastAnalyzedKey = null;

    // Analyze helper that avoids duplicates and logs a stack trace for diagnostics
    async function analyzeForItem(item, src) {
        ensurePreviewAndDetails();
        const key = item?.name || src || ('blob:' + Date.now());
        if (!key) return;
        if (inFlightAnalyses.has(key)) {
            console.debug('analyze skipped - already in flight', key);
            return;
        }
        if (lastAnalyzedKey === key) {
            console.debug('analyze skipped - already analyzed recently', key);
            return;
        }
        inFlightAnalyses.add(key);
        console.debug('starting analyze', key);
        console.trace('analyze call stack');
        try {
            detectionBadge.style.display = 'inline-block';
            detectionBadge.textContent = 'Analyzing…';
            const body = item.name ? { blobName: item.name } : { blobUrl: src };
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const rawText = await res.text();
            let j = {};
            try { j = rawText ? JSON.parse(rawText) : {}; } catch (e) { j = {}; console.warn('analyze: invalid json', e); }

            // normalize and render (reuse existing logic)
            const likelihood = Number(j.mango_likelihood || (j.prediction && j.prediction.mango_likelihood) || 0);
            const matches = Array.isArray(j.mango_matches) ? j.mango_matches : Array.isArray(j.matches) ? j.matches : [];
            let rawDetections = [];
            if (Array.isArray(j.detections)) rawDetections = j.detections;
            else if (Array.isArray(j.prediction && j.prediction.detections)) rawDetections = j.prediction.detections;
            else if (Array.isArray(j.objects)) rawDetections = j.objects;
            else if (Array.isArray(j.items)) rawDetections = j.items;
            else rawDetections = [];
            const detections = rawDetections.map(d => {
                const name = (d.name || d.label || d.class || d.type || '').toString();
                let conf = Number(d.confidence ?? d.score ?? d.conf ?? d.probability ?? 0);
                if (Number.isNaN(conf)) conf = 0;
                if (conf > 1 && conf <= 100) conf = conf / 100;
                if (conf > 100) conf = Math.min(1, conf / 100);
                conf = Math.min(1, Math.max(0, conf));
                return Object.assign({}, d, { name, confidence: conf });
            });

            // update UI with normalized data
            if (matches.length > 0 || likelihood > 0) {
                detectionBadge.textContent = `MANGO ${(likelihood * 100).toFixed(0)}%`;
                detectionBadge.classList.add('detected');
            } else {
                detectionBadge.textContent = 'No mango detected';
                detectionBadge.classList.remove('detected');
            }
            const list = document.createElement('ul');
            list.className = 'detection-list';
            if (detections.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'No objects detected';
                list.appendChild(li);
            } else {
                detections.forEach(d => {
                    const li = document.createElement('li');
                    li.textContent = `${d.name} — ${(d.confidence * 100).toFixed(0)}%`;
                    list.appendChild(li);
                });
            }
            // replace existing detection list/graph
            // ensure containers exist and get the details container once
            ensurePreviewAndDetails();
            let details = document.getElementById('detection-details');
            if (!details) {
                details = document.createElement('div');
                details.id = 'detection-details';
                details.className = 'detection-details';
                imgWrap.parentNode.insertBefore(details, imgWrap.nextSibling);
            }
            details.innerHTML = '';
            details.appendChild(list);
            // wait for preview image layout (if analyze finished before image load)
            try {
                await waitForPreviewImage(2000);
            } catch (e) { /* ignore */ }
            // save for redraw on resize and draw now
            lastDrawnDetections = detections;
            renderDetectionsGraph(details, detections, matches);
            // also render the Chart.js chart (separate visual)
            renderDetectionsChart(detections);

            lastAnalyzedKey = key;
         } catch (err) {
             detectionBadge.textContent = 'Analysis error';
             console.error('analyze error', err);
         } finally {
             inFlightAnalyses.delete(key);
         }
     }

    loadLatestButton.addEventListener('click', loadLatest);
    autoRefreshToggle.addEventListener('click', toggleAutoRefresh);
    analyzeSelectedButton.addEventListener('click', analyzeSelected);

    function loadLatest() {
        fetch('/api/load_latest')
            .then(response => response.json())
            .then(data => {
                currentItems = Array.isArray(data.items) ? data.items : [];
                // ensure newest first (server sorts descending already; keep UI consistent)
                if (currentItems.length > 1) currentItems = currentItems.slice(); // no-op placeholder
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

    async function loadItem(index) {
        selectedIndex = index;
        const item = currentItems[index];
        imgWrap.innerHTML = '';
        photoInfo.textContent = '';
        detectionBadge.style.display = 'none';

        const img = document.createElement('img');
        img.id = 'preview-img';
        // ensure preview container can host an absolutely positioned overlay
        imgWrap.style.position = imgWrap.style.position || 'relative';
        img.style.maxWidth = '100%';
        img.alt = 'Telemetry Image';
        imgWrap.appendChild(img);
        // ensure an overlay canvas exists (will be sized on image load / render)
        let overlay = document.getElementById('detection-overlay');
        if (!overlay) {
            overlay = document.createElement('canvas');
            overlay.id = 'detection-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '30';
            // append into same container as image so absolute coordinates match
            img.parentNode.appendChild(overlay);
        }

        // prefer direct blob_url from list; otherwise resolve by name
        let src = item.blob_url || item.url || null;
        if (!src && item.name) {
            try {
                const r = await fetch('/api/fetch_blob?name=' + encodeURIComponent(item.name));
                if (r.ok) {
                    const meta = await r.json();
                    src = meta && (meta.blob_url || meta.url) ? (meta.blob_url || meta.url) : null;
                }
            } catch (err) {
                console.error('failed to resolve blob url for', item.name, err);
            }
        }

        // ensure a details container exists for detection list / graph
        let details = document.getElementById('detection-details');
        if (!details) {
            details = document.createElement('div');
            details.id = 'detection-details';
            details.className = 'detection-details';
            imgWrap.parentNode.insertBefore(details, imgWrap.nextSibling);
        }
        details.innerHTML = '';

        if (src) {
            img.src = src;

            // Automatic analysis: run via analyzeForItem (deduplicated)
            analyzeForItem(item, src).catch(e => console.error('analyzeForItem failed', e));
        } else {
            imgWrap.removeChild(img);
            const p = document.createElement('div');
            p.className = 'no-image';
            p.textContent = 'Image not available';
            imgWrap.appendChild(p);
        }

        if (item.timestamp) {
            photoInfo.textContent = item.timestamp;
        }
        if (item.detection) {
            detectionBadge.style.display = 'inline-block';
            detectionBadge.textContent = `Detection: ${item.detection}`;
        }
    }

    // Helper: draw a simple horizontal bar graph under 'details'
    function renderDetectionsGraph(container, detections, mangoMatches) {
        ensurePreviewAndDetails();
        // diagnostics
        console.debug('renderDetectionsGraph called', { containerId: container && container.id, detectionsLength: (detections||[]).length, mangoMatchesLength: (mangoMatches||[]).length });

        // remove previous graph if present
        const prev = container.querySelector('.detection-graph-wrap');
        if (prev) prev.remove();

        const wrap = document.createElement('div');
        wrap.className = 'detection-graph-wrap';
        // make sure wrapper is visible and can grow
        wrap.style.display = 'block';
        wrap.style.width = '100%';
        const title = document.createElement('div');
        title.className = 'detection-graph-title';
        title.textContent = 'Detections — confidence';
        wrap.appendChild(title);

        if (!detections || detections.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'detection-graph-empty';
            empty.textContent = 'No detections to display';
            wrap.appendChild(empty);
            container.appendChild(wrap);

            // clear overlay if any
            const ov = document.getElementById('detection-overlay') || document.getElementById('detection-canvas');
            if (ov && ov.getContext) {
                try {
                    const ctx = ov.getContext('2d');
                    ctx && ctx.clearRect(0,0,ov.width || 0, ov.height || 0);
                    ov.style.display = 'none';
                } catch(e){}
            }
            return;
        }

        // Build DOM bars (robust, independent from canvas)
        const list = document.createElement('div');
        list.className = 'detection-bars';
        const fruitNames = new Set((mangoMatches || []).map(m => ((m.name || '').toString().toLowerCase())));
        const fallbackFruitCheck = (name) => {
            const s = (name || '').toLowerCase();
            return s.includes('mango') || s.includes('fruit');
        };

        detections.forEach(d => {
            const row = document.createElement('div');
            row.className = 'detection-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '6px';

            const label = document.createElement('div');
            label.textContent = d.name || d.label || '';
            label.style.width = '160px';
            label.style.flex = '0 0 160px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.whiteSpace = 'nowrap';
            label.style.fontSize = '12px';
            label.style.color = '#222';

            const barWrap = document.createElement('div');
            barWrap.style.flex = '1';
            barWrap.style.background = '#eee';
            barWrap.style.borderRadius = '4px';
            barWrap.style.overflow = 'hidden';
            barWrap.style.height = '18px';
            barWrap.style.position = 'relative';

            const fill = document.createElement('div');
            const conf = Math.min(1, Math.max(0, Number(d.confidence || d.score || 0)));
            const isFruit = fruitNames.has((d.name || '').toString().toLowerCase()) || fallbackFruitCheck(d.name);
            fill.style.width = (conf * 100) + '%';
            fill.style.height = '100%';
            fill.style.background = isFruit ? '#ff8c00' : '#6c6f73';

            const pct = document.createElement('div');
            pct.textContent = Math.round(conf * 100) + '%';
            pct.style.position = 'absolute';
            pct.style.right = '6px';
            pct.style.top = '50%';
            pct.style.transform = 'translateY(-50%)';
            pct.style.fontSize = '11px';
            pct.style.color = conf > 0.35 ? '#fff' : '#222';

            barWrap.appendChild(fill);
            barWrap.appendChild(pct);

            row.appendChild(label);
            row.appendChild(barWrap);
            list.appendChild(row);
        });

        wrap.appendChild(list);

        // legend
        const legend = document.createElement('div');
        legend.className = 'detection-graph-legend';
        legend.style.marginTop = '8px';
        legend.innerHTML = '<span style="display:inline-flex;align-items:center;margin-right:12px"><span style="width:12px;height:12px;background:#ff8c00;display:inline-block;margin-right:6px"></span>Fruit</span><span style="display:inline-flex;align-items:center"><span style="width:12px;height:12px;background:#6c6f73;display:inline-block;margin-right:6px"></span>Other</span>';
        wrap.appendChild(legend);

        // ensure container is visible (some layouts may hide it)
        try { container.style.display = 'block'; } catch(e){}

        container.appendChild(wrap);

        // Draw bounding boxes on overlay after ensuring preview image layout
        const img = document.getElementById('preview-img');
        if (!img) return;

        const drawWhenReady = () => {
            try {
                const w = img.clientWidth || img.offsetWidth;
                const h = img.clientHeight || img.offsetHeight;
                console.debug('drawWhenReady sizes', {w,h});
                if (w === 0 || h === 0) return false;
                // make sure overlay canvas is visible and sized
                const ov = (document.getElementById('detection-overlay') || document.getElementById('detection-canvas'));
                if (ov) ov.style.display = 'block';
                drawOverlayBoxes(detections);
                return true;
            } catch (e) {
                console.error('drawWhenReady error', e);
                return false;
            }
        };

        if (drawWhenReady()) return;
        img.addEventListener('load', function onLoad() { drawWhenReady(); }, { once: true });
        setTimeout(() => { drawWhenReady(); }, 500);
    }

    function drawOverlayBoxes(detections) {
        const img = document.getElementById('preview-img');
        if (!img) return;
        // always append overlay into the known preview container (imgWrap) to avoid layout mismatches
        let ov = document.getElementById('detection-overlay');
        if (!ov) {
            ov = document.createElement('canvas');
            ov.id = 'detection-overlay';
            ov.style.position = 'absolute';
            ov.style.left = '0';
            ov.style.top = '0';
            ov.style.pointerEvents = 'none';
            ov.style.zIndex = '9999';
            // append to the img wrapper so coordinates align
            const wrap = document.getElementById('imgwrap') || img.parentNode;
            wrap.appendChild(ov);
        }

        // ensure image has layout size before drawing
        const w = img.clientWidth || img.offsetWidth;
        const h = img.clientHeight || img.offsetHeight;
        console.debug('drawOverlayBoxes layout', { naturalW: img.naturalWidth, naturalH: img.naturalHeight, clientW: w, clientH: h, detections: detections.length });
        if (w === 0 || h === 0) {
            setTimeout(() => drawOverlayBoxes(detections), 150);
            return;
        }

        // copy image border radius so overlay visually matches rounded corners
        const cs = window.getComputedStyle(img);
        if (cs && cs.borderRadius) ov.style.borderRadius = cs.borderRadius;

        // size canvas for CSS and backing store (DPR)
        const dpr = window.devicePixelRatio || 1;
        ov.style.width = w + 'px';
        ov.style.height = h + 'px';
        ov.width = Math.round(w * dpr);
        ov.height = Math.round(h * dpr);

        const ctx = ov.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'lime';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';

        // scale bounding boxes from natural image coordinates to displayed dimensions
        const sx = img.naturalWidth ? (w / img.naturalWidth) : 1;
        const sy = img.naturalHeight ? (h / img.naturalHeight) : 1;
        detections.forEach(d => {
            const bb = d.bounding_box || {};
            const x1 = parseFloat(bb.x1) || 0;
            const y1 = parseFloat(bb.y1) || 0;
            const x2 = parseFloat(bb.x2) || 0;
            const y2 = parseFloat(bb.y2) || 0;
            const x = x1 * sx;
            const y = y1 * sy;
            const wbox = Math.max(0, (x2 - x1) * sx);
            const hbox = Math.max(0, (y2 - y1) * sy);
            // draw box and label
            ctx.strokeRect(x, y, wbox, hbox);
            const label = `${d.name || d.label || ''} ${(Number(d.confidence || 0) * 100).toFixed(0)}%`;
            const textW = ctx.measureText(label).width + 6;
            ctx.fillRect(x, Math.max(0, y - 18), textW, 18);
            ctx.fillStyle = 'white';
            ctx.fillText(label, x + 3, Math.max(12, y - 4));
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
        });
    }

    // redraw overlay on window resize (debounced simple)
    let _resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (lastDrawnDetections && lastDrawnDetections.length) {
                drawOverlayBoxes(lastDrawnDetections);
            }
        }, 120);
    });

    // new: fetch and render recent messages
    async function fetchMessages() {
      try {
        const res = await fetch('/api/messages?limit=50');
        if (!res.ok) return;
        const messages = await res.json();
        const list = document.getElementById('telemetry-list');
        if (!list) return;
        list.innerHTML = '';
        messages.forEach(m => {
          const div = document.createElement('div');
          div.className = 'telemetry-item';
          div.style.borderBottom = '1px solid #eee';
          div.style.padding = '8px 0';
          div.innerHTML = `<div><strong>${escapeHtml(m.deviceId || '')}</strong> <small style="color:var(--muted)">${m.received_at}</small></div>
                           <div style="font-size:12px;color:var(--muted)">${escapeHtml(m.imageFileName || '')}</div>
                           <pre style="margin:6px 0 0 0;font-size:12px">${escapeHtml(JSON.stringify(m.payload, null, 2))}</pre>`;
          list.appendChild(div);
        });
      } catch (e) {
        console.warn('fetchMessages failed', e);
      }
    }

    // start polling messages
    setInterval(fetchMessages, 5000);
    document.addEventListener('DOMContentLoaded', fetchMessages);
});

// NOTE: removed duplicate bottom IIFE blocks — UI logic consolidated above.

<div class="card" id="telemetry-panel" style="margin-top:12px;">
  <h3 style="margin:0 0 8px 0;">Recent telemetry</h3>
  <div id="telemetry-list" style="max-height:320px;overflow:auto;"></div>
</div>