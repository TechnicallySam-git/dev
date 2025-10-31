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
        // remove previous graph if present
        const prev = container.querySelector('.detection-graph-wrap');
        if (prev) prev.remove();

        const wrap = document.createElement('div');
        wrap.className = 'detection-graph-wrap';
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
            // clear overlay
            const ov = document.getElementById('detection-overlay');
            if (ov && ov.getContext) {
                const ctx = ov.getContext('2d');
                ctx.clearRect(0,0,ov.width,ov.height);
            }
            return;
        }

        // Build a simple DOM list with bar fills (works on all browsers and scales)
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

        container.appendChild(wrap);

        // Ensure overlay boxes are drawn after preview image has loaded / has size.
        const img = document.getElementById('preview-img');
        if (!img) {
            // no preview image available — nothing to draw
            return;
        }

        const drawWhenReady = () => {
            try {
                // only draw if image has layout size
                const w = img.clientWidth || img.offsetWidth;
                const h = img.clientHeight || img.offsetHeight;
                if (w === 0 || h === 0) {
                    // skip — wait for load
                    return false;
                }
                drawOverlayBoxes(detections);
                return true;
            } catch (e) {
                console.error('drawWhenReady error', e);
                return false;
            }
        };

        // If image already sized, draw immediately
        if (drawWhenReady()) return;

        // Otherwise attach one-time load listener and small timeout fallback
        img.addEventListener('load', function onLoad() {
            drawWhenReady();
        }, { once: true });

        // fallback: attempt drawing after short delay (covers cached-change cases)
        setTimeout(() => { drawWhenReady(); }, 300);
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
});

(function(){
  const viewer = document.getElementById('viewer');
  const listEl = document.getElementById('list');
  let currentItems = [];

  function renderList(items){
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      const img = document.createElement('img');
      img.src = it.url || it.blob_url || '';
      img.alt = it.name || '';
      img.dataset.idx = idx;
      img.addEventListener('click', () => loadItem(idx));
      listEl.appendChild(img);
    });
  }

  function loadItem(idx){
    const it = currentItems[idx];
    if (!it) return;
    viewer.src = it.url || it.blob_url || '';
  }

  function loadLatest(){
    fetch('/api/load_latest')
      .then(r => r.json())
      .then(data => {
        currentItems = Array.isArray(data.items) ? data.items : [];
        renderList(currentItems);
        if (currentItems.length) loadItem(0);
      })
      .catch(e => console.error('load_latest failed', e));
  }

  function setupEventSource(){
    try {
      const es = new EventSource('/events');
      es.onmessage = (ev) => {
        // server sends a JSON payload in data
        try {
          const d = JSON.parse(ev.data || '{}');
          if (d && d.type === 'list' && d.refresh) {
            console.info('SSE: refresh event, fetching latest list');
            loadLatest();
          }
        } catch (err) {
          // ignore malformed
        }
      };
      es.onerror = (e) => {
        console.warn('EventSource error', e);
      };
      // initial load
      loadLatest();
    } catch (e) {
      console.error('EventSource not supported', e);
      // fallback polling
      loadLatest();
      setInterval(loadLatest, 5000);
    }
  }

  // start
  document.addEventListener('DOMContentLoaded', setupEventSource);
})();

(function(){
  const analyzeBtn = document.getElementById('analyze-selected');
  const statusEl = document.getElementById('analyze-status');
  const mangoEl = document.getElementById('mango-likelihood');
  const listEl = document.getElementById('detection-list');
  const canvas = document.getElementById('detection-canvas');

  // Helper: find the currently selected image URL on your page.
  // Adapt selector to your markup (e.g. a selected list item or preview img src).
  function getSelectedBlobUrl(){
    // Example: preview img with id="preview-img"
    const img = document.getElementById('preview-img');
    return img ? img.src : null;
  }

  async function analyzeBlobUrl(blobUrl, sasToken){
    statusEl.textContent = 'analyzing...';
    mangoEl.textContent = '...';
    listEl.innerHTML = '';
    try{
      const payload = { blobUrl: blobUrl };
      if(sasToken) payload.sas = sasToken; // optional
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if(r.ok){
        renderDetections(data, blobUrl);
        mangoEl.textContent = (data.mango_likelihood || 0).toString();
      }else{
        listEl.textContent = data.error || JSON.stringify(data);
        mangoEl.textContent = 'error';
      }
    }catch(err){
      listEl.textContent = 'request failed: ' + err;
      mangoEl.textContent = 'error';
    }finally{
      statusEl.textContent = '';
    }
  }

  function renderDetections(data, blobUrl){
    // show detection list
    listEl.innerHTML = '';
    (data.detections || []).forEach(d => {
      const li = document.createElement('div');
      const conf = Number(d.confidence ?? d.score ?? 0);
      const confPct = Math.round((isNaN(conf) ? 0 : conf) * 100);
      li.textContent = `${d.name || d.label || ''} — ${confPct}%`;
      listEl.appendChild(li);
    });
 
    // draw boxes on the preview image if available
    const img = document.getElementById('preview-img');
    if(!img) return;
    // ensure we have a canvas to draw on (use existing or create one)
    let cvs = canvas || document.getElementById('detection-overlay') || null;
    if (!cvs) {
      cvs = document.createElement('canvas');
      cvs.id = 'detection-canvas';
      cvs.style.position = 'absolute';
      cvs.style.left = '0';
      cvs.style.top = '0';
      cvs.style.pointerEvents = 'none';
      cvs.style.zIndex = '30';
      img.parentNode.appendChild(cvs);
    }

    const displayW = img.clientWidth || img.offsetWidth;
    const displayH = img.clientHeight || img.offsetHeight;
    if (displayW === 0 || displayH === 0) return;

    const dpr = window.devicePixelRatio || 1;
    cvs.style.display = 'block';
    cvs.style.width = displayW + 'px';
    cvs.style.height = displayH + 'px';
    cvs.width = Math.round(displayW * dpr);
    cvs.height = Math.round(displayH * dpr);
    cvs.style.left = img.offsetLeft + 'px';
    cvs.style.top = img.offsetTop + 'px';

    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.font = '14px sans-serif';

    // scale coordinates from natural image to displayed image
    const sx = img.naturalWidth ? (displayW / img.naturalWidth) : 1;
    const sy = img.naturalHeight ? (displayH / img.naturalHeight) : 1;
    (data.detections || []).forEach(d => {
      const bb = d.bounding_box || {};
      const x1 = parseFloat(bb.x1) || 0;
      const y1 = parseFloat(bb.y1) || 0;
      const x2 = parseFloat(bb.x2) || 0;
      const y2 = parseFloat(bb.y2) || 0;
      const x = x1 * sx;
      const y = y1 * sy;
      const w = Math.max(0, (x2 - x1) * sx);
      const h = Math.max(0, (y2 - y1) * sy);
      ctx.strokeRect(x, y, w, h);
      const conf = Number(d.confidence ?? d.score ?? 0);
      const label = `${d.name || d.label || ''} ${(isNaN(conf) ? 0 : (conf*100)).toFixed(0)}%`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const textW = ctx.measureText(label).width + 6;
      ctx.fillRect(x, Math.max(0, y - 18), textW, 18);
      ctx.fillStyle = 'white';
      ctx.fillText(label, x + 3, Math.max(12, y - 4));
    });
  }

  analyzeBtn && analyzeBtn.addEventListener('click', ()=>{
    const url = getSelectedBlobUrl();
    if(!url){
      statusEl.textContent = 'no image selected';
      return;
    }
    analyzeBlobUrl(url);
  });

  // expose for debugging
  window.analyzeBlobUrl = analyzeBlobUrl;
})();