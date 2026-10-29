// Connexion à distance via PeerJS (WebRTC). L'hôte fait autorité sur les règles.
const PREFIX = 'crapette-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

// Crée une salle ; onGuest(conn) est appelé à chaque connexion d'invité.
export function host({ onReady, onGuest, onError }) {
  const attempt = () => {
    const code = randomCode();
    const peer = new Peer(PREFIX + code);
    peer.on('open', () => onReady(code, peer));
    peer.on('connection', onGuest);
    peer.on('error', (e) => (e.type === 'unavailable-id' ? attempt() : onError(e)));
  };
  attempt();
}

export function join(code, { onOpen, onError }) {
  const peer = new Peer();
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
    conn.on('open', () => onOpen(conn));
    conn.on('error', onError);
  });
  peer.on('error', onError);
  return peer;
}
