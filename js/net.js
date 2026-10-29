// Connexion à distance par le relais (WebSocket, voir relay.js) : les deux téléphones parlent au
// serveur, jamais directement entre eux, donc ça marche quel que soit le réseau (4G/5G, box…).
// L'hôte fait autorité sur les règles. Les objets renvoyés imitent une connexion : on / send / close / open.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const URL_WS = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
const CONNECT_MS = 60000; // un hébergeur gratuit peut mettre une minute à se réveiller

function emitter() {
  const h = {};
  return {
    on: (ev, fn) => { (h[ev] ||= []).push(fn); },
    emit: (ev, ...a) => (h[ev] || []).forEach((fn) => fn(...a)),
  };
}

// Ouvre la WebSocket ; onOpen(ws) une fois prête, onFail(type) si elle ne s'ouvre pas.
function connect(onOpen, onFail) {
  let ws;
  try { ws = new WebSocket(URL_WS()); } catch { onFail('network'); return null; }
  let opened = false;
  const timer = setTimeout(() => { if (!opened) { try { ws.close(); } catch {} onFail('timeout'); } }, CONNECT_MS);
  ws.onopen = () => {
    opened = true; clearTimeout(timer);
    ws.keep = setInterval(() => { if (ws.readyState === 1) ws.send('{"type":"ping"}'); }, 20000);
    onOpen(ws);
  };
  ws.onerror = () => { if (!opened) { clearTimeout(timer); onFail('network'); } };
  ws.addEventListener('close', () => { clearInterval(ws.keep); clearTimeout(timer); });
  return ws;
}

// Une connexion vers l'autre joueur, par-dessus la WebSocket.
function link(ws) {
  const e = emitter();
  const c = {
    open: true,
    on: e.on,
    emit: e.emit,
    send: (d) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', d })); },
    close: () => { c.open = false; },
  };
  return c;
}

// Crée une salle ; onGuest(conn) est appelé à chaque connexion d'invité.
export function host({ onReady, onGuest, onError }) {
  const attempt = () => {
    const code = randomCode();
    let current = null;
    const peer = { destroy: () => { try { ws && ws.close(); } catch {} } };
    const ws = connect((sock) => sock.send(JSON.stringify({ type: 'host', code })), (type) => onError({ type }));
    if (!ws) return;
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'taken') { try { ws.close(); } catch {} attempt(); }
      else if (m.type === 'ready') onReady(code, peer);
      else if (m.type === 'guest') { current = link(ws); onGuest(current); }
      else if (m.type === 'data' && current) current.emit('data', m.d);
      else if (m.type === 'left' && current) { const c = current; current = null; c.open = false; c.emit('close'); }
    };
    ws.addEventListener('close', () => { if (current) { const c = current; current = null; c.open = false; c.emit('close'); } });
  };
  attempt();
}

export function join(code, { onOpen, onError }) {
  let conn = null;
  const ws = connect((sock) => sock.send(JSON.stringify({ type: 'join', code: code.trim().toUpperCase() })), (type) => onError({ type }));
  const peer = { destroy: () => { try { ws && ws.close(); } catch {} } };
  if (!ws) return peer;
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'nohost') { ws.close(); onError({ type: 'peer-unavailable' }); }
    else if (m.type === 'open') { conn = link(ws); conn.close = () => { conn.open = false; try { ws.close(); } catch {} }; onOpen(conn); }
    else if (m.type === 'data' && conn) conn.emit('data', m.d);
    else if (m.type === 'left' && conn) { conn.open = false; conn.emit('close'); }
  };
  ws.addEventListener('close', () => { if (conn && conn.open) { conn.open = false; conn.emit('close'); } });
  return peer;
}
