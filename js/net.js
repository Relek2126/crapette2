// Connexion à distance via PeerJS (WebRTC). L'hôte fait autorité sur les règles.
const PREFIX = 'crapette-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

// Sans relais (TURN), la connexion échoue entre deux réseaux différents (4G/5G, box strictes).
// Relais public gratuit « Open Relay » : suffisant pour jouer à deux, mais sans garantie de disponibilité.
const OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
};

// Crée une salle ; onGuest(conn) est appelé à chaque connexion d'invité.
export function host({ onReady, onGuest, onError }) {
  const attempt = () => {
    const code = randomCode();
    const peer = new Peer(PREFIX + code, OPTIONS);
    peer.on('open', () => onReady(code, peer));
    peer.on('connection', onGuest);
    peer.on('error', (e) => (e.type === 'unavailable-id' ? attempt() : onError(e)));
  };
  attempt();
}

export function join(code, { onOpen, onError }) {
  const peer = new Peer(OPTIONS);
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
    conn.on('open', () => onOpen(conn));
    conn.on('error', onError);
  });
  peer.on('error', onError);
  return peer;
}
