// Test du relais : un hôte et un invité s'échangent des messages par un vrai serveur WebSocket local.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { attachRelay } from '../relay.js';

const server = createServer();
const wss = attachRelay(server);
await new Promise((r) => server.listen(0, r));
const url = `ws://localhost:${server.address().port}/ws`;

function client() {
  const ws = new WebSocket(url);
  const got = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const w = waiters.findIndex((x) => x.type === m.type);
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else got.push(m);
  };
  const next = (type) => {
    const i = got.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ type, resolve });
      setTimeout(() => reject(new Error('attendu : ' + type)), 3000);
    });
  };
  const send = (m) => ws.send(JSON.stringify(m));
  return new Promise((r) => { ws.onopen = () => r({ ws, send, next }); });
}

try {
  const h = await client();
  h.send({ type: 'host', code: 'abcde' });
  await h.next('ready');

  const dup = await client();
  dup.send({ type: 'host', code: 'ABCDE' });
  await dup.next('taken'); // le code est déjà pris (insensible à la casse)

  const ghost = await client();
  ghost.send({ type: 'join', code: 'ZZZZZ' });
  await ghost.next('nohost');

  const g = await client();
  g.send({ type: 'join', code: 'abcde' });
  await g.next('open');
  await h.next('guest');

  g.send({ type: 'data', d: { t: 'hello', n: 1 } });
  assert.deepEqual((await h.next('data')).d, { t: 'hello', n: 1 });
  h.send({ type: 'data', d: { t: 'init' } });
  assert.deepEqual((await g.next('data')).d, { t: 'init' });

  // gros message (les images de cartes)
  const big = 'x'.repeat(3 * 1024 * 1024);
  h.send({ type: 'data', d: { big } });
  assert.equal((await g.next('data')).d.big.length, big.length);

  g.ws.close(); // l'invité part : l'hôte est prévenu
  await h.next('left');
  const g2 = await client(); // un nouvel invité peut rejoindre
  g2.send({ type: 'join', code: 'ABCDE' });
  await g2.next('open');
  await h.next('guest');

  h.ws.close(); // l'hôte part : l'invité est prévenu et la salle disparaît
  await g2.next('left');
  const late = await client();
  late.send({ type: 'join', code: 'ABCDE' });
  await late.next('nohost');
  console.log('ok relais : salle, code pris, message, gros message, départ, nouvel invité');
} finally {
  for (const c of wss.clients) c.terminate();
  wss.close();
  server.close();
}
