import { newGame, other, isRed, canTake, canMove, isLegal, canDraw, apply } from './game.js';
import { loadSkin, saveSkin, emptySkin, fileToDataUrl, headIndex, ATOUTS } from './skin.js';
import * as net from './net.js';

const SUITS = ['♠', '♥', '♦', '♣', '★'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'C', 'D', 'R'];
const atoutName = (c) => (c.rank === 0 ? 'EX' : String(c.rank));

const app = document.getElementById('app');
const mySkin = loadSkin();
const skins = { host: mySkin, guest: emptySkin() };

let screen = 'home'; // home | editor | wait | game
let mode = null; // host | guest | local
let myRole = 'host';
let state = null;
let prevState = null; // état avant la dernière action (hôte) : sert à juger un appel arrivé en retard
let lastDraw = 0;
let sel = null;
let conn = null;
let peer = null;
let code = '';
let notice = '';
let sameForAll = true;
let showRules = false;

const viewRole = () => (mode === 'local' ? state.turn : myRole);
// L'hôte (celui qui crée la partie) est Bastos, celui qui rejoint est PP.
const NAMES = { host: 'Bastos', guest: 'PP' };
const locEq =(a, b) => a.k === b.k && a.p === b.p && a.i === b.i;
// coup permis par les règles (les coups interdits sont refusés avant même d'être joués)
const allowed = (from, to) => canMove(state, viewRole(), from, to) && isLegal(state, viewRole(), from, to);
let refusUntil = 0;
function refuse() {
  refusUntil = Date.now() + 1600;
  sel = null; render();
  setTimeout(render, 1650);
}

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

// ───────────── cartes ─────────────
function cardEl(c) {
  const atout = c.suit === 4;
  const el = h('div', `card owner-${c.owner} ${atout ? 'atout' : isRed(c) ? 'red' : 'black'}`);
  el.append(h('span', 'tl', (atout ? atoutName(c) : RANKS[c.rank]) + SUITS[c.suit]));
  const mid = h('div', 'mid');
  const sk = skins.host; // un seul jeu commun : celui de l'hôte (Bastos)
  // têtes et atouts : l'image remplit toute la carte, comme dans un vrai jeu de tarot
  const img = atout ? sk.atouts && sk.atouts[c.rank] : c.rank >= 11 && sk.heads[headIndex(c.rank, c.suit)];
  if (img) {
    el.classList.add('art');
    mid.classList.add('img');
    mid.style.backgroundImage = `url(${img})`;
  } else if (atout) {
    mid.classList.add('num');
    mid.textContent = c.rank === 0 ? '★' : c.rank;
  } else if (c.rank >= 11) {
    mid.classList.add('court');
    mid.textContent = RANKS[c.rank];
  } else mid.textContent = SUITS[c.suit];
  el.append(mid);
  return el;
}

function backEl(owner) {
  const el = h('div', `card back owner-${owner}`);
  const img = skins.host.back;
  if (img) el.style.backgroundImage = `url(${img})`;
  return el;
}

// ───────────── plateau ─────────────
function slot(loc, kids, extra = '') {
  const el = h('div', 'slot ' + extra);
  el.dataset.loc = JSON.stringify(loc);
  if (loc.k === 'found' || loc.k === 'tab' || loc.k === 'waste') el.dataset.target = '1'; // destination possible
  if (sel && locEq(sel, loc)) el.classList.add('sel');
  // carte en main : toutes les destinations possibles s'éclairent pareil (rien ne dit si le coup est permis)
  else if (sel && (loc.k === 'found' || loc.k === 'tab' || loc.k === 'waste')) el.classList.add('drop');
  if (!kids.length) el.append(h('div', 'empty'));
  else el.append(...kids);
  return el;
}

function badge(n, cls = '', min = 2) { return n >= min ? h('span', 'badge ' + cls, n) : h('span'); }

function pile(role, k) {
  const arr = state.sides[role][k];
  const kids = [];
  if (arr.length) { kids.push(cardEl(arr[arr.length - 1])); kids.push(badge(arr.length)); }
  return slot({ k, p: role }, kids);
}

function stockEl(role) {
  const n = state.sides[role].stock.length;
  const held = state.sides[role].hand;
  // la carte retournée reste face visible sur la pioche, en attente d'être jouée ou posée sur le rebut
  if (held) return slot({ k: 'hand', p: role }, [cardEl(held), badge(n)]);
  const kids = n ? [backEl(role), badge(n, 'big', 1)] : [];
  const el = slot({ k: 'stock', p: role }, kids);
  if (!n && state.sides[role].waste.length) el.append(h('span', 'recycle', '↻'));
  return el;
}

function crapBtn(role) {
  const b = h('button', 'mini crap', 'Crapette !');
  b.dataset.act = 'crapette'; b.dataset.role = role;
  return b;
}

// Bande d'un joueur (à gauche l'adversaire, à droite toi) : nom, pioche, rebut, bouton Crapette.
function zone(role, me) {
  const z = h('div', 'zone ' + (role === me ? 'me' : 'opp') + (state.turn === role && !state.winner ? ' active' : ''));
  const side = state.sides[role];
  const n = side.stock.length + side.waste.length + (side.hand ? 1 : 0);
  const info = h('div', 'info');
  info.append(h('b', null, mode === 'local' ? NAMES[role] : role === me ? `${NAMES[role]} (toi)` : NAMES[role]));
  info.append(h('span', null, `${n} carte${n > 1 ? 's' : ''}`));
  z.append(info, stockEl(role), pile(role, 'waste'));
  // chacun son bouton ; en mode test les deux sont sur l'écran
  const canCall = !state.winner || state.fault;
  if (canCall && (role === me || mode === 'local')) z.append(crapBtn(role));
  return z;
}

const WHY = {
  coup: 'coup interdit', oubli: 'coup oublié',
  manque: 'crapette non annoncée', faux: 'fausse alerte',
};

function renderGame() {
  const me = viewRole();
  const opp = other(me);
  const root = h('div', 'game');

  const bar = h('div', 'bar');
  let msg;
  if (refusUntil > Date.now()) msg = 'Coup impossible';
  else if (state.winner) msg = state.winner === me ? '🎉 Tu as gagné !' : mode === 'local' ? 'Partie terminée' : 'Perdu… gros looser 😛';
  else if (state.turn === me && state.sides[me].hand) msg = 'Joue la carte, sinon pose-la sur ton rebut';
  else if (state.turn === me) msg = mode === 'local' ? `Tour de ${NAMES[me]}` : sel ? 'Choisis où poser la carte' : 'À toi de jouer';
  else msg = notice || `Tour de ${NAMES[opp]}…`;
  bar.append(h('div', 'msg' + (state.turn === me && !state.winner ? ' mine' : ''), msg));
  const btns = h('div', 'btns');
  if (state.winner && mode !== 'guest') { const b = h('button', 'mini primary', 'Rejouer'); b.dataset.act = 'rematch'; btns.append(b); }
  const r = h('button', 'mini', '?'); r.dataset.act = 'rules'; btns.append(r);
  const q = h('button', 'mini', '✕'); q.dataset.act = 'leave'; btns.append(q);
  bar.append(btns);
  root.append(bar);
  const p = state.penalty;
  if (p) {
    const mine = mode !== 'local' && p.who === me;
    const who = mode !== 'local' && mine ? 'tu' : NAMES[p.who];
    root.append(h('div', 'pen', `Crapette ! (${WHY[p.why]}) — ${who} ${mine ? 'prends' : 'prend'} 2 cartes.`));
  }

  const board = h('div', 'board');
  const center = h('div', 'center');

  const found = h('div', 'row found');
  state.found.forEach((f, i) => found.append(slot({ k: 'found', i }, f.length ? [cardEl(f[f.length - 1])] : [], 'fslot')));
  center.append(found);

  const tab = h('div', 'row tab');
  state.tab.forEach((col, i) => {
    const s = slot({ k: 'tab', i }, col.map(cardEl), 'col');
    s.style.setProperty('--n', col.length); // le chevauchement se resserre si la colonne grandit
    tab.append(s);
  });
  center.append(tab);

  board.append(zone(opp, me), center, zone(me, me));
  root.append(board);
  root.append(h('div', 'rotate', 'Tourne ton téléphone en mode paysage ↻'));
  if (showRules) root.append(rulesEl());
  announce(me);
  return root;
}

// Bandeau « à qui le tour » et gros « CRAPETTE ! » : une seule fois par changement, même si l'écran se redessine.
let seenTurn = null;
let seenPenalty = -1;
function flash(cls, text) {
  const el = h('div', 'flash ' + cls, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1500);
}
let seenLoss = -1;
function announce(me) {
  // le perdant (ou, en mode test, l'adversaire du gagnant) se fait chambrer, une fois par fin de partie
  if (state.winner && state.seq !== seenLoss) {
    seenLoss = state.seq;
    const loser = other(state.winner);
    if (mode === 'local' || loser === me) {
      const el = h('div', 'flash loose', mode === 'local' ? `${NAMES[loser]} : gros looser 😛` : 'GROS LOOSER 😛');
      document.body.append(el);
      setTimeout(() => el.remove(), 4000);
    }
  }
  const burst = state.penalty && state.seq !== seenPenalty;
  if (burst) { seenPenalty = state.seq; flash('burst', 'CRAPETTE !'); }
  if (!state.winner && state.turn !== seenTurn) {
    if (seenTurn === null) flash('turn', `${NAMES[state.turn]} commence`); // tirage au sort
    else if (!burst)
      flash('turn', mode === 'local' ? NAMES[state.turn] : state.turn === me ? 'À TOI !' : NAMES[state.turn]);
    seenTurn = state.turn;
  }
}

function rulesEl() {
  const o = h('div', 'overlay');
  const box = h('div', 'box');
  box.append(h('h3', null, 'Règles (cette version)'));
  const ul = h('ul');
  [
    'But : jouer toutes ses cartes (pioche et rebut) avant l’adversaire. Jeu de tarot de 78 cartes : 5 au milieu, le reste partagé.',
    'Fondations (5 places en haut) : As puis 2, 3… jusqu’au Roi dans la même enseigne ; les atouts commencent par l’Excuse puis 1 à 21.',
    'Colonnes (5, communes) : on descend d’un cran en alternant rouge/noir. Les atouts ne se jouent qu’entre eux. Une colonne vide accepte tout. Quand une suite se forme, elle se déplace en bloc en la prenant par sa carte la plus ancienne (la plus haute) : sur une autre colonne, ou sur le rebut adverse (valeur ±1, couleur différente par rapport à cette carte). Sur une fondation, seule la carte du dessus d’une suite peut monter.',
    'Rebut (le tien ou celui de l’adversaire) : carte de valeur +1 ou −1 et de couleur différente. Sur le rebut adverse, la carte rejoint son tas. Tu peux aussi prendre le dessus du rebut adverse pour le jouer sur une fondation ou une colonne ; si une fondation peut le recevoir, tu dois le faire.',
    'Ton tour : joue le dessus de ton rebut ou d’une colonne, puis touche ta pioche : la carte se retourne face visible sur la pioche. Si tu peux la jouer, fais-le, puis retourne la suivante. Sinon pose-la sur ton rebut, à côté : la main passe alors automatiquement. Poser une carte d’une colonne sur ton rebut (valeur ±1, couleur différente) passe aussi la main.',
    'Obligation : avant de retourner une carte ou de poser la tienne sur ton rebut, tu dois avoir joué tout coup possible (fondation, colonne, rebut adverse), et avoir comblé tout trou du milieu avec ta carte retournée ou le dessus de ton rebut. Sinon c’est une crapette.',
    'Pioche vide : touche-la pour la reformer avec ton rebut.',
    'Chacun a son bouton « Crapette ! ». Si l’adversaire oublie une obligation, touche-le avant de jouer : son coup est annulé, il prend 2 cartes de ta pioche et c’est à toi. Si tu cries sans erreur, c’est toi qui prends 2 cartes de la sienne. Si tu joues sans avoir crié, c’est une crapette de plus pour toi.',
    'Les coups impossibles (un valet sur un 6…) sont refusés. Mais oublier un coup obligatoire n’est pas signalé : c’est à vous de vous surveiller.',
  ].forEach((t) => ul.append(h('li', null, t)));
  box.append(ul);
  const b = h('button', 'primary', 'Compris'); b.dataset.act = 'rules';
  box.append(b);
  o.append(box);
  return o;
}

// ───────────── écrans ─────────────
function renderHome() {
  const el = h('div', 'home');
  el.append(h('h1', null, 'Crapette'));
  el.append(h('p', 'sub', 'À deux, chacun sur son téléphone, avec vos propres cartes.'));
  if (notice) el.append(h('p', 'notice', notice));
  const c1 = h('button', 'primary', 'Créer une partie'); c1.dataset.act = 'host';
  const join = h('div', 'joinrow');
  const inp = h('input'); inp.id = 'code'; inp.placeholder = 'CODE'; inp.maxLength = 5; inp.autocapitalize = 'characters';
  const c2 = h('button', null, 'Rejoindre'); c2.dataset.act = 'join';
  join.append(inp, c2);
  const c3 = h('button', null, '🎨 Mes cartes'); c3.dataset.act = 'editor';
  const c4 = h('button', 'ghost', 'Mode test (2 joueurs sur cet écran)'); c4.dataset.act = 'local';
  el.append(c1, join, c3, c4);
  return el;
}

function renderWait() {
  const el = h('div', 'home');
  el.append(h('h1', null, mode === 'host' ? 'Partie créée' : 'Connexion…'));
  if (mode === 'host') {
    if (!code) { el.append(h('p', 'sub', 'Création de la salle…')); }
    else {
      el.append(h('div', 'bigcode', code));
      el.append(h('p', 'sub', 'Envoie ce code (ou le lien) à ta partenaire, puis attends qu’elle rejoigne.'));
      const s = h('button', 'primary', 'Partager le lien'); s.dataset.act = 'share';
      el.append(s);
    }
  }
  if (notice) el.append(h('p', 'notice', notice));
  const b = h('button', 'ghost', 'Annuler'); b.dataset.act = 'leave';
  el.append(b);
  return el;
}

function renderEditor() {
  const el = h('div', 'editor');
  el.append(h('h2', null, 'Mes cartes'));
  el.append(h('p', 'sub', 'Ces images seront visibles par ton adversaire pendant la partie.'));

  const prev = h('div', 'preview');
  prev.append(backEl('host'));
  [[11, 1], [13, 0], [14, 2]].forEach(([rank, suit]) => prev.append(cardEl({ id: 0, owner: 'host', suit, rank })));
  el.append(prev);

  const grid = h('div', 'edgrid');
  const backSlot = edSlot('Dos', mySkin.back, 'back');
  grid.append(backSlot);
  el.append(grid);

  const chk = h('label', 'chk');
  const cb = h('input'); cb.type = 'checkbox'; cb.checked = sameForAll; cb.id = 'same';
  chk.append(cb, document.createTextNode(' Même image pour les 4 enseignes'));
  el.append(chk);

  [11, 12, 13, 14].forEach((rank) => {
    el.append(h('h4', null, { 11: 'Valets', 12: 'Cavaliers', 13: 'Dames', 14: 'Rois' }[rank]));
    const row = h('div', 'edrow');
    for (let suit = 0; suit < 4; suit++) {
      row.append(edSlot(SUITS[suit], mySkin.heads[headIndex(rank, suit)], `head:${headIndex(rank, suit)}`, isRed({ suit })));
    }
    el.append(row);
  });

  el.append(h('h4', null, 'Atouts (Excuse, puis 1 à 21)'));
  const batch = h('label', 'batch', '📥 Importer plusieurs images d’un coup (classées par nom : Excuse, 1, 2… 21)');
  const bf = h('input'); bf.type = 'file'; bf.accept = 'image/*'; bf.multiple = true; bf.dataset.edit = 'atouts';
  batch.append(bf);
  el.append(batch);
  const atouts = h('div', 'edrow atouts');
  for (let r = 0; r < ATOUTS; r++) atouts.append(edSlot(atoutName({ rank: r }), mySkin.atouts[r], `atout:${r}`));
  el.append(atouts);

  const back = h('button', 'primary', 'Terminé'); back.dataset.act = 'home';
  const reset = h('button', 'ghost', 'Tout réinitialiser'); reset.dataset.act = 'resetskin';
  el.append(back, reset);
  return el;
}

function edSlot(label, img, key, red) {
  const l = h('label', 'edslot' + (red ? ' red' : ''));
  if (img) l.style.backgroundImage = `url(${img})`;
  l.append(h('span', 'edlabel', label));
  const f = h('input'); f.type = 'file'; f.accept = 'image/*'; f.dataset.edit = key;
  l.append(f);
  if (img) { const x = h('button', 'edx', '×'); x.dataset.act = 'clear:' + key; l.append(x); }
  return l;
}

// À la souris, la carte qu'on vient de retourner de sa pioche est directement attrapée (elle suit le curseur).
// Une seule fois par carte : si on la lâche (clic dessus ou Échap), elle reste en place.
let autoId = null;
function autoHold() {
  if (!usedMouse || screen !== 'game' || !state || state.winner) return;
  const me = viewRole();
  const hd = state.sides[me].hand;
  if (hd && state.turn === me && hd.id !== autoId) { autoId = hd.id; sel = { k: 'hand', p: me }; }
}

function render() {
  autoHold();
  app.replaceChildren();
  if (!state) { seenTurn = null; seenPenalty = -1; } // nouvelle partie : on réannonce le tour
  const ingame = screen === 'game' && !!state;
  app.classList.toggle('ingame', ingame);
  // en plein écran / appli installée, on verrouille le paysage (ignoré ailleurs)
  if (ingame) try { window.screen.orientation.lock('landscape').catch(() => {}); } catch {}
  if (screen === 'home') app.append(renderHome());
  else if (screen === 'editor') app.append(renderEditor());
  else if (screen === 'wait') app.append(renderWait());
  else if (screen === 'game' && state) app.append(renderGame());
  updateFollow();
}

// ───────────── réseau et actions ─────────────
function broadcast() {
  if (mode === 'host' && conn && conn.open) conn.send({ t: 'state', state });
}

function act(a, role = viewRole()) {
  if (mode === 'guest') {
    if (conn && conn.open) conn.send({ t: 'act', a, seq: state.seq });
    sel = null; render();
    return;
  }
  const next = apply(state, role, a);
  if (!next) { sel = null; render(); return; }
  prevState = state; state = next; sel = null;
  broadcast(); render();
}

function startHost() {
  mode = 'host'; myRole = 'host'; screen = 'wait'; code = ''; notice = ''; state = null;
  render();
  net.host({
    onReady: (c, p) => { code = c; peer = p; render(); },
    onGuest: attachGuest,
    onError: (e) => { notice = 'Erreur réseau : ' + (e.type || e.message); render(); },
  });
}

function attachGuest(c) {
  if (conn) { const old = conn; conn = null; try { old.close(); } catch {} }
  conn = c;
  c.on('data', (m) => {
    if (m.t === 'hello') {
      skins.guest = m.skin;
      if (!state) state = newGame();
      c.send({ t: 'init', skin: mySkin, state });
      screen = 'game'; notice = ''; render();
    } else if (m.t === 'act') {
      // Un « Crapette ! » criqué sur un état que l'hôte a déjà dépassé (latence) est jugé sur
      // l'état que l'invité voyait ; toute autre action périmée est ignorée.
      let base = state;
      if (m.seq !== state.seq) {
        const vu = prevState && prevState.seq === m.seq && m.a && m.a.t === 'crapette';
        if (!vu) { c.send({ t: 'state', state }); return; }
        if (prevState.fault && prevState.fault.by !== 'guest') base = prevState;
      }
      const next = apply(base, 'guest', m.a);
      if (next) { prevState = state; state = next; sel = null; broadcast(); render(); }
      else c.send({ t: 'state', state });
    }
  });
  c.on('close', () => { if (conn === c) { conn = null; notice = 'L’adversaire s’est déconnecté…'; render(); } });
}

function startGuest(c) {
  mode = 'guest'; myRole = 'guest'; screen = 'wait'; notice = ''; state = null;
  render();
  peer = net.join(c, {
    onOpen: (cn) => {
      conn = cn;
      cn.send({ t: 'hello', skin: mySkin });
      cn.on('data', (m) => {
        if (m.t === 'init') { skins.host = m.skin; state = m.state; screen = 'game'; notice = ''; }
        else if (m.t === 'state') state = m.state;
        sel = null; render();
      });
      cn.on('close', () => { notice = 'Connexion perdue. Recharge la page pour rejoindre à nouveau.'; render(); });
    },
    onError: (e) => { leave(); notice = e.type === 'peer-unavailable' ? 'Code introuvable. Vérifie-le avec ta partenaire.' : 'Impossible de rejoindre : ' + (e.type || e.message); render(); },
  });
}

function startLocal() {
  mode = 'local'; myRole = 'host'; state = newGame(); sel = null; screen = 'game';
  skins.guest = emptySkin();
  render();
}

function leave() {
  try { conn && conn.close(); } catch {}
  try { peer && peer.destroy(); } catch {}
  conn = null; peer = null; state = null; sel = null; mode = null; notice = ''; code = ''; screen = 'home';
  history.replaceState(null, '', location.pathname);
}

// ───────────── glisser-déposer ─────────────
// On attrape la carte du dessus et on la lâche sur sa destination. Un simple toucher garde le
// fonctionnement toucher / toucher (voir le clic plus bas).
let drag = null;
let suppressClick = false;

function dropTarget(x, y) {
  let best = null, bestD = Infinity;
  for (const s of app.querySelectorAll('.slot[data-target]')) {
    const r = s.getBoundingClientRect();
    if (x < r.left - 8 || x > r.right + 8 || y < r.top - 8 || y > r.bottom + 8) continue;
    const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

// Copie flottante de la carte (ou de la pile) attrapée ; pile : les cartes restent décalées comme dans la colonne.
function buildGhost(grab) {
  const r = grab[0].getBoundingClientRect();
  let g;
  if (grab.length === 1) {
    g = grab[0].cloneNode(true);
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
  } else {
    g = h('div');
    const last = grab[grab.length - 1].getBoundingClientRect();
    g.style.width = r.width + 'px'; g.style.height = last.bottom - r.top + 'px';
    for (const c of grab) {
      const k = c.cloneNode(true);
      k.style.cssText = `position:absolute;left:0;margin:0;width:${r.width}px;height:${r.height}px;top:${c.getBoundingClientRect().top - r.top}px`;
      g.append(k);
    }
  }
  g.classList.add('drag-card'); // pas « ghost » : c'est la classe des boutons transparents
  document.body.append(g);
  return g;
}

// Sur ordinateur, une carte choisie d'un clic suit la souris jusqu'au clic suivant (au toucher, rien ne change).
let usedMouse = false;
let mouse = null;
let follow = null;
function updateFollow() {
  if (follow) { follow.el.remove(); follow = null; if (!drag) document.body.classList.remove('dragging'); }
  if (!usedMouse || !mouse || !sel || screen !== 'game' || !state) return;
  const slotEl = [...app.querySelectorAll('[data-loc]')].find((s) => locEq(JSON.parse(s.dataset.loc), sel));
  const cards = slotEl ? [...slotEl.children].filter((c) => c.classList.contains('card')) : [];
  if (!cards.length) return;
  const grab = sel.k === 'tab' ? cards : [cards[cards.length - 1]];
  const r = grab[0].getBoundingClientRect();
  follow = { el: buildGhost(grab), grab, dx: r.width / 2, dy: Math.min(24, r.height / 3) };
  document.body.classList.add('dragging'); // surligne les destinations
  for (const c of grab) c.style.opacity = '.3';
  moveFollow();
}
function moveFollow() {
  if (!follow || !mouse) return;
  follow.el.style.left = mouse.x - follow.dx + 'px';
  follow.el.style.top = mouse.y - follow.dy + 'px';
  document.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
  const t = dropTarget(mouse.x, mouse.y);
  if (t) t.classList.add('over');
}
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse = { x: e.clientX, y: e.clientY };
  moveFollow();
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sel) { sel = null; render(); } });

function endDrag() {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  for (const c of drag.grab) c.style.opacity = '';
  document.body.classList.remove('dragging');
  document.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
  drag = null;
}

app.addEventListener('pointerdown', (e) => {
  usedMouse = e.pointerType === 'mouse';
  if (usedMouse) mouse = { x: e.clientX, y: e.clientY };
  if (screen !== 'game' || !state || e.button > 0) return;
  const card = e.target.closest('.card');
  const slotEl = card && card.closest('[data-loc]');
  if (!slotEl) return;
  const loc = JSON.parse(slotEl.dataset.loc);
  if (!canTake(state, viewRole(), loc)) return;
  const cards = [...slotEl.children].filter((c) => c.classList.contains('card'));
  // une colonne se glisse en bloc (n'importe quelle carte de la pile l'attrape) ; ailleurs, la carte du dessus
  if (loc.k !== 'tab' && cards[cards.length - 1] !== card) return;
  const grab = loc.k === 'tab' ? cards : [card];
  drag = { loc, card: grab[0], grab, id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null, dx: 0, dy: 0 };
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    const r = drag.card.getBoundingClientRect();
    drag.ghost = buildGhost(drag.grab);
    drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
    for (const c of drag.grab) c.style.opacity = '.3';
    document.body.classList.add('dragging');
    sel = null;
  }
  drag.ghost.style.left = e.clientX - drag.dx + 'px';
  drag.ghost.style.top = e.clientY - drag.dy + 'px';
  document.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
  const t = dropTarget(e.clientX, e.clientY);
  if (t) t.classList.add('over');
  e.preventDefault();
});

window.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  const dragged = !!d.ghost;
  const t = dragged ? dropTarget(e.clientX, e.clientY) : null;
  endDrag();
  if (!dragged) return; // simple toucher : le clic prend le relais
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const me = viewRole();
  const to = t && JSON.parse(t.dataset.loc);
  if (to && allowed(d.loc, to)) act({ t: 'move', from: d.loc, to });
  else if (to && !locEq(d.loc, to)) refuse();
  else render();
});
window.addEventListener('pointercancel', () => { if (drag) { endDrag(); render(); } });

// ───────────── événements ─────────────
app.addEventListener('click', async (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const btn = e.target.closest('[data-act]');
  if (btn) {
    e.preventDefault();
    const a = btn.dataset.act;
    if (a === 'host') startHost();
    else if (a === 'join') { const v = document.getElementById('code').value.trim(); if (v) startGuest(v); }
    else if (a === 'editor') { notice = ''; screen = 'editor'; render(); }
    else if (a === 'home') { screen = 'home'; render(); }
    else if (a === 'local') startLocal();
    else if (a === 'leave') { if (screen !== 'game' || confirm('Quitter la partie ?')) { leave(); render(); } }
    else if (a === 'rules') { showRules = !showRules; render(); }
    else if (a === 'crapette') act({ t: 'crapette' }, btn.dataset.role);
    else if (a === 'rematch') {
      state = newGame(); sel = null; seenTurn = null; seenPenalty = -1; broadcast(); render();
    } else if (a === 'share') {
      const url = location.origin + location.pathname + '?join=' + code;
      try { navigator.share ? await navigator.share({ title: 'Crapette', text: 'Rejoins ma partie de crapette !', url }) : await navigator.clipboard.writeText(url); notice = navigator.share ? '' : 'Lien copié !'; }
      catch {}
      render();
    } else if (a === 'resetskin') {
      if (confirm('Supprimer toutes tes images ?')) { Object.assign(mySkin, emptySkin()); saveSkin(mySkin); render(); }
    } else if (a.startsWith('clear:')) {
      const key = a.slice(6);
      if (key === 'back') mySkin.back = null;
      else if (key.startsWith('atout:')) mySkin.atouts[+key.split(':')[1]] = null;
      else mySkin.heads[+key.split(':')[1]] = null;
      saveSkin(mySkin); render();
    }
    return;
  }
  if (screen !== 'game' || !state) return;
  const el = e.target.closest('[data-loc]');
  if (!el) { if (sel) { sel = null; render(); } return; }
  const loc = JSON.parse(el.dataset.loc);
  const me = viewRole();
  if (state.winner || state.turn !== me) return;
  if (loc.k === 'stock') {
    // anti double-tap : un second tap ne doit pas retourner une autre carte
    const now = Date.now();
    if (loc.p === me && canDraw(state, me) && now - lastDraw > 400) { lastDraw = now; act({ t: 'draw' }); }
    return;
  }
  if (sel) {
    if (locEq(sel, loc)) { sel = null; render(); return; }
    if (allowed(sel, loc)) { act({ t: 'move', from: sel, to: loc }); return; }
    if (canMove(state, me, sel, loc)) { refuse(); return; }
  }
  sel = canTake(state, me, loc) ? loc : null;
  render();
});

app.addEventListener('change', async (e) => {
  const f = e.target;
  if (f.id === 'same') { sameForAll = f.checked; return; }
  if (!f.dataset.edit || !f.files[0]) return;
  try {
    const key = f.dataset.edit;
    const art = (file) => fileToDataUrl(file, 200, 280, 0.78); // au format d'une carte
    if (key === 'back') mySkin.back = await fileToDataUrl(f.files[0], 200, 280, 0.78);
    else if (key === 'atouts') {
      // import en lot : Excuse, 1, 2 … 21 dans l'ordre des noms de fichier
      const files = [...f.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, ATOUTS);
      for (let i = 0; i < files.length; i++) mySkin.atouts[i] = await art(files[i]);
    } else if (key.startsWith('atout:')) mySkin.atouts[+key.split(':')[1]] = await art(f.files[0]);
    else {
      const idx = +key.split(':')[1];
      const data = await art(f.files[0]);
      if (sameForAll) { const rankBase = idx - (idx % 4); for (let i = 0; i < 4; i++) mySkin.heads[rankBase + i] = data; }
      else mySkin.heads[idx] = data;
    }
    saveSkin(mySkin);
  } catch { notice = 'Image illisible'; }
  render();
});

// lien d'invitation : ?join=CODE
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) startGuest(joinParam);
else render();
