/* minimal SSE server: polls blob listing and emits events to connected browsers
   Usage:
     - Ensure your main express app does: require('./server-sse')(app);
     - Provide either process.env.FRUTA_CONTAINER_URL (preferred, can include SAS)
       OR set FRUTA_ACCOUNT, FRUTA_CONTAINER and FRUTA_SAS (sas string starting with ?sv=)
*/
module.exports = function attachSse(app){
  if(!app) throw new Error('attachSse requires express app instance');

  const clients = new Set();
  let pollTimer = null;
  let lastSeen = { name: null, etag: null, lastModified: null };

  // helper to build list URL
  function makeListUrl(){
    if(process.env.FRUTA_CONTAINER_URL && process.env.FRUTA_CONTAINER_URL.trim()){
      try {
        const u = new URL(process.env.FRUTA_CONTAINER_URL);
        if(!u.searchParams.has('restype') && !u.search.includes('comp=list')) u.search += (u.search ? '&' : '?') + 'restype=container&comp=list';
        return u.toString();
      } catch(e){}
    }
    const acc = process.env.FRUTA_ACCOUNT;
    const cont = process.env.FRUTA_CONTAINER;
    const sas = process.env.FRUTA_SAS || '';
    if(!acc || !cont) throw new Error('Missing FRUTA_ACCOUNT/FRUTA_CONTAINER or FRUTA_CONTAINER_URL');
    return `https://${acc}.blob.core.windows.net/${cont}?restype=container&comp=list${sas}`;
  }

  async function listBlobsHttp(){
    const url = makeListUrl();
    const res = await fetch(url);
    if(!res.ok) throw new Error('List failed: '+res.status);
    const xml = await res.text();
    // lightweight parsing: get <Blob> blocks, then extract <Name>, <Last-Modified>, <Etag>
    const blobs = [];
    const blobRe = /<Blob>([\s\S]*?)<\/Blob>/gi;
    let m;
    while((m = blobRe.exec(xml)) !== null){
      const block = m[1];
      const nameMatch = /<Name>([^<]+)<\/Name>/i.exec(block);
      const lmMatch = /<Last-Modified>([^<]+)<\/Last-Modified>/i.exec(block);
      const etagMatch = /<Etag>([^<]+)<\/Etag>/i.exec(block) || /<Etag>([^<]+)<\/Etag>/i.exec(block) || /<ETag>([^<]+)<\/ETag>/i.exec(block);
      blobs.push({
        name: nameMatch ? nameMatch[1] : '',
        lastModified: lmMatch ? lmMatch[1] : null,
        etag: etagMatch ? etagMatch[1] : null
      });
    }
    // sort newest first by lastModified fallback to name
    blobs.sort((a,b)=> new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
    return blobs;
  }

  // send JSON SSE event to clients
  function broadcast(data){
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for(const res of clients) {
      try { res.write(payload); } catch(e){ /* ignore */ }
    }
  }

  // poll loop
  async function pollOnce(){
    try {
      const items = await listBlobsHttp();
      if(items && items.length){
        const newest = items[0];
        const changed = (newest.etag && newest.etag !== lastSeen.etag)
                     || (!newest.etag && newest.lastModified && newest.lastModified !== lastSeen.lastModified)
                     || (newest.name && newest.name !== lastSeen.name && !newest.etag && !newest.lastModified);
        if(changed){
          lastSeen = { name: newest.name, etag: newest.etag, lastModified: newest.lastModified };
          broadcast({ type: 'blob', name: newest.name, etag: newest.etag, lastModified: newest.lastModified });
          // also optionally send compact list snapshot
          broadcast({ type: 'list', items: items.slice(0,20).map(it=>({ name: it.name, etag: it.etag, lastModified: it.lastModified })) });
        }
      }
      // schedule next poll
      schedulePoll();
    } catch(err){
      console.warn('SSE poll error', err && err.message);
      // keep polling with simple retry
      schedulePoll(5000);
    }
  }

  function schedulePoll(ms){
    if(pollTimer) clearTimeout(pollTimer);
    if(!ms) ms = parseInt(process.env.FRUTA_POLL_MS || '5000', 10);
    pollTimer = setTimeout(()=> pollOnce().catch(()=>{}), ms);
  }

  // SSE endpoint
  app.get('/events', (req, res) => {
    // required headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    // keep the connection
    res.write(': connected\n\n');

    clients.add(res);
    // immediately send current known marker so client can decide to load
    if(lastSeen && lastSeen.name) res.write(`data: ${JSON.stringify({ type:'blob', name:lastSeen.name, etag:lastSeen.etag, lastModified:lastSeen.lastModified })}\n\n`);

    // start polling when first client connects
    if(clients.size === 1) schedulePoll();

    // cleanup on close
    req.on('close', () => {
      clients.delete(res);
      try { res.end(); } catch(_) {}
      if(clients.size === 0 && pollTimer){ clearTimeout(pollTimer); pollTimer = null; }
    });
  });

  // helper route to preview current lastSeen (optional)
  app.get('/_sse_status', (req,res)=> res.json({ clients: clients.size, lastSeen }));
};