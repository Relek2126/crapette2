// Relais de parties : met en relation un hôte et un invité par un code, puis recopie leurs messages.
// Les deux joueurs se connectent à ce serveur en WebSocket (aucune connexion directe entre téléphones).
import { WebSocketServer } from 'ws';

// Messages client → serveur : { type: 'host', code } | { type: 'join', code } | { type: 'data', d } | { type: 'ping' }
// Messages serveur → client : ready, taken, nohost, guest (à l'hôte), open (à l'invité), data, left
export function attachRelay(server, path = '/ws') {
  const wss = new WebSocketServer({ server, path, maxPayload: 16 * 1024 * 1024 }); // les images de cartes pèsent
  const rooms = new Map(); // code -> { host, guest }

  const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      const code = typeof m.code === 'string' ? m.code.slice(0, 16).toUpperCase() : '';

      if (m.type === 'host') {
        if (ws.room || !code) return;
        if (rooms.has(code)) return send(ws, { type: 'taken' });
        rooms.set(code, { host: ws, guest: null });
        ws.room = code; ws.role = 'host';
        send(ws, { type: 'ready' });
      } else if (m.type === 'join') {
        if (ws.room || !code) return;
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'nohost' });
        if (room.guest) { room.guest.room = null; room.guest.close(); } // un nouvel invité remplace l'ancien
        room.guest = ws; ws.room = code; ws.role = 'guest';
        send(room.host, { type: 'guest' });
        send(ws, { type: 'open' });
      } else if (m.type === 'data') {
        const room = rooms.get(ws.room);
        if (!room) return;
        send(ws.role === 'host' ? room.guest : room.host, { type: 'data', d: m.d });
      }
    });

    ws.on('close', () => {
      const room = rooms.get(ws.room);
      if (!room) return;
      if (ws.role === 'host') {
        rooms.delete(ws.room);
        send(room.guest, { type: 'left' });
        if (room.guest) { room.guest.room = null; room.guest.close(); }
      } else if (room.guest === ws) {
        room.guest = null;
        send(room.host, { type: 'left' });
      }
    });
  });

  // coupe les connexions mortes (téléphone éteint, réseau perdu)
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(beat));
  return wss;
}
