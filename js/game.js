// Moteur de règles de la crapette (2 joueurs, un jeu de tarot de 78 cartes).
// Pur et sans DOM : l'hôte applique les actions, l'invité reçoit l'état.
// 5 cartes au milieu, le reste est partagé : chacun a une pioche (face cachée) et un rebut
// (la case à côté, face visible). But : vider sa pioche et son rebut le premier.
// Les coups interdits ne sont pas bloqués : ils sont enregistrés comme fautes, et c'est
// l'adversaire qui décide de crier « Crapette ! » (ou pas).

export const other = (r) => (r === 'host' ? 'guest' : 'host');
export const ATOUT = 4; // 5e « enseigne » : les atouts 1 à 21 et l'Excuse (rang 0)
export const isRed = (c) => c.suit === 1 || c.suit === 2;
const isAtout = (c) => c.suit === ATOUT;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 4 enseignes de 14 cartes (A…10, V=11, C=12, D=13, R=14) + 21 atouts + l'Excuse
function fullDeck() {
  const cards = [];
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 1; rank <= 14; rank++) cards.push({ id: suit * 22 + rank, suit, rank });
  for (let rank = 0; rank <= 21; rank++) cards.push({ id: 88 + rank, suit: ATOUT, rank });
  return shuffle(cards);
}

// Mise en place : 5 cartes neutres au milieu, le reste partagé (36 / 37 : celui qui commence
// en a une de moins). Une carte garde le propriétaire qui l'a reçue, pour son dos et ses têtes.
export function newGame(first = Math.random() < 0.5 ? 'host' : 'guest') {
  const d = fullDeck();
  const tab = Array.from({ length: 5 }, () => [{ ...d.pop(), owner: 'neutral' }]);
  const give = (r, n) => d.splice(0, n).map((c) => ({ ...c, owner: r }));
  const sides = {};
  // hand : la carte retournée, face visible sur la pioche, en attente d'être jouée ou posée sur le rebut
  sides[first] = { stock: give(first, 36), waste: [], hand: null };
  sides[other(first)] = { stock: give(other(first), 37), waste: [], hand: null };
  const found = Array.from({ length: 5 }, () => []);
  // fault : { by, kind, prev } dernière faute non contestée, prev = état avant la faute
  // penalty : { who, why } pour l'affichage du dernier « Crapette ! »
  return { sides, tab, found, turn: first, fault: null, penalty: null, winner: null, seq: 0 };
}

const last = (a) => (a && a.length ? a[a.length - 1] : null);
const isIdx = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

function okLoc(s, l) {
  if (!l || typeof l !== 'object') return false;
  if (l.k === 'tab') return isIdx(l.i, s.tab.length);
  if (l.k === 'found') return isIdx(l.i, s.found.length);
  if (l.k === 'waste' || l.k === 'stock' || l.k === 'hand') return l.p === 'host' || l.p === 'guest';
  return false;
}

export function peek(s, loc) {
  if (!okLoc(s, loc)) return null;
  switch (loc.k) {
    case 'waste': case 'stock': return last(s.sides[loc.p][loc.k]);
    case 'hand': return s.sides[loc.p].hand || null;
    case 'tab': return last(s.tab[loc.i]);
    case 'found': return last(s.found[loc.i]);
  }
  return null;
}

// Une colonne se déplace en bloc : seule sa carte la plus ancienne (la plus haute à l'écran) compte
// pour savoir où la poser. Ailleurs, c'est la carte du dessus.
export function head(s, loc) {
  return loc && loc.k === 'tab' && okLoc(s, loc) ? s.tab[loc.i][0] || null : peek(s, loc);
}

export function canTake(s, role, loc) {
  if (s.winner || s.turn !== role || !okLoc(s, loc)) return false;
  if (loc.k === 'tab') return !!peek(s, loc);
  if (loc.k === 'waste') return !!peek(s, loc); // le rebut adverse aussi : on peut en prendre le dessus (voir canMove)
  if (loc.k === 'hand') return loc.p === role && !!peek(s, loc);
  return false;
}

const same = (a, b) => a.k === b.k && a.p === b.p && a.i === b.i;

// Le coup est-il physiquement possible ? (même s'il est contraire aux règles)
export function canMove(s, role, from, to) {
  if (!canTake(s, role, from) || !okLoc(s, to) || same(from, to)) return false;
  // sur son propre rebut on pose la carte retournée ; une autre carte n'y va pas tant qu'on en tient une
  if (to.k === 'waste' && to.p === role && from.k !== 'hand' && s.sides[role].hand) return false;
  // le dessus du rebut adverse ne va que sur une fondation ou une colonne
  if (from.k === 'waste' && from.p !== role && to.k === 'waste') return false;
  // une pile de plusieurs cartes ne va pas sur son propre rebut (sur une fondation, seul le dessus part)
  if (from.k === 'tab' && s.tab[from.i].length > 1 && to.k === 'waste' && to.p === role) return false;
  return to.k === 'found' || to.k === 'tab' || to.k === 'waste';
}

// Fondations : l'As (l'Excuse pour les atouts), puis on monte d'un cran dans la même enseigne.
const fitsFound = (top, c) =>
  top ? top.suit === c.suit && c.rank === top.rank + 1 : c.rank === (isAtout(c) ? 0 : 1);

// Les atouts n'ont pas de couleur et ne se jouent qu'entre eux.
const mixOk = (a, b) => isAtout(a) === isAtout(b) && (isAtout(a) || isRed(a) !== isRed(b));

// Le coup est-il conforme aux règles ?
export function isLegal(s, role, from, to) {
  // sur une fondation, une colonne ne donne que sa carte du dessus ; ailleurs, c'est la pile entière
  const c = to.k === 'found' ? peek(s, from) : head(s, from);
  const top = peek(s, to);
  // la carte retournée qu'on ne peut pas jouer se pose sur son rebut, sans condition
  if (from.k === 'hand' && to.k === 'waste' && to.p === role) return true;
  if (to.k === 'found') return fitsFound(top, c);
  // colonne : on descend d'un cran en alternant les couleurs ; une colonne vide accepte tout
  if (to.k === 'tab') return top ? top.rank === c.rank + 1 && mixOk(top, c) : true;
  // rebut (le sien ou celui de l'adversaire) : valeur +/- 1 et couleur différente
  return !!top && Math.abs(top.rank - c.rank) === 1 && mixOk(top, c);
}

export function canDraw(s, role) {
  const me = s.sides[role];
  return !s.winner && s.turn === role && !me.hand && (me.stock.length > 0 || me.waste.length > 0);
}

// Obligation : avant de retourner une carte ou de finir son tour, on joue tout coup possible
// avec le dessus de son rebut ou d'une colonne (vers une fondation, une colonne non vide ou le
// rebut adverse). Poser sur son propre rebut ou dans une colonne vide n'est jamais obligatoire.
function coupObligatoire(s, role) {
  const from = [{ k: 'hand', p: role }, { k: 'waste', p: role }, { k: 'waste', p: other(role) }, ...s.tab.map((_, i) => ({ k: 'tab', i }))].filter((l) => peek(s, l));
  const to = [
    ...s.found.map((_, i) => ({ k: 'found', i })),
    ...s.tab.map((col, i) => ({ k: 'tab', i })).filter((l) => peek(s, l)),
    { k: 'waste', p: other(role) },
  ];
  // le dessus du rebut adverse n'est obligatoire que vers une fondation
  const theirs = (f) => f.k === 'waste' && f.p !== role;
  if (from.some((f) => to.some((t) => (!theirs(f) || t.k === 'found') && canMove(s, role, f, t) && isLegal(s, role, f, t)))) return true;
  // un trou au milieu doit être comblé avec la carte retournée ou le dessus de son rebut
  const trou = s.tab.findIndex((col) => !col.length);
  return trou >= 0 && from.some((f) => f.k !== 'tab' && !theirs(f) && canMove(s, role, f, { k: 'tab', i: trou }));
}

// Pénalité : le fautif récupère 2 cartes du tas de l'autre (pioche, sinon rebut), glissées sous sa pioche.
function transfer(s, from, to, n = 2) {
  const src = s.sides[from];
  for (let i = 0; i < n; i++) {
    const c = src.stock.length ? src.stock.pop() : src.waste.pop();
    if (c) s.sides[to].stock.unshift(c);
  }
}

function checkWinner(s) {
  for (const r of ['host', 'guest'])
    if (!s.sides[r].stock.length && !s.sides[r].waste.length && !s.sides[r].hand) s.winner = r;
}

export function callCrapette(state, role) {
  const f = state.fault;
  if (state.winner && !f) return null;
  let s;
  if (f && f.by !== role) {
    // bien vu : sa faute est annulée, il récupère 2 cartes chez l'adversaire et la main passe à celui qui a crié
    s = structuredClone(f.prev);
    s.fault = null;
    // une carte retournée mais non jouée retourne sur le rebut du fautif
    const fh = s.sides[f.by];
    if (fh.hand) { fh.waste.push(fh.hand); fh.hand = null; }
    transfer(s, role, f.by);
    s.turn = role;
    s.penalty = { who: f.by, why: f.kind };
  } else {
    // fausse alerte : c'est celui qui a crié qui récupère 2 cartes chez l'adversaire
    s = structuredClone(state);
    s.winner = null;
    transfer(s, other(role), role);
    s.penalty = { who: role, why: 'faux' };
  }
  s.winner = null;
  checkWinner(s);
  s.seq = state.seq + 1;
  return s;
}

// Applique une action. Renvoie un nouvel état, ou null si elle est impossible.
export function apply(state, role, a) {
  if (!a || (role !== 'host' && role !== 'guest')) return null;
  if (a.t === 'crapette') return callCrapette(state, role);

  const s = structuredClone(state);
  const me = s.sides[role];
  let fault = null;

  // Retourner la pioche montre une carte (face visible sur la pioche) : on la joue si on peut,
  // sinon on la pose sur son rebut. Le tour se termine tout seul dès qu'une carte arrive sur son
  // propre rebut, et il faut alors avoir joué tout coup possible.
  let endTurn = false;
  if (a.t === 'draw') {
    if (!canDraw(s, role)) return null;
    if (coupObligatoire(s, role)) fault = 'oubli';
    if (!me.stock.length) { me.stock = me.waste.reverse(); me.waste = []; }
    me.hand = me.stock.pop();
  } else if (a.t === 'move') {
    if (!canMove(s, role, a.from, a.to)) return null;
    // un coup contraire aux règles est refusé d'emblée (il ne reste que les oublis à punir)
    if (!isLegal(s, role, a.from, a.to)) return null;
    const t = a.to;
    endTurn = t.k === 'waste' && t.p === role;
    if (endTurn && coupObligatoire(s, role)) fault = 'oubli';
    let cards;
    if (a.from.k === 'tab') cards = t.k === 'found' ? [s.tab[a.from.i].pop()] : s.tab[a.from.i].splice(0);
    else if (a.from.k === 'hand') { cards = [me.hand]; me.hand = null; }
    else cards = [s.sides[a.from.p].waste.pop()];
    if (t.k === 'found') s.found[t.i].push(...cards);
    else if (t.k === 'tab') s.tab[t.i].push(...cards);
    else s.sides[t.p].waste.push(...cards);
  } else return null;
  if (endTurn) s.turn = other(role);

  // Jouer sans avoir crié : trop tard pour contester, et c'est une crapette en soi
  // (les crapettes se cumulent). Une crapette manquée n'en entraîne pas une autre.
  if (s.fault && s.fault.by !== role) {
    const was = s.fault.kind;
    s.fault = null;
    if (!fault && was !== 'manque') fault = 'manque';
  }
  if (fault && !s.fault) {
    const prev = structuredClone(state);
    prev.fault = null; prev.penalty = null;
    s.fault = { by: role, kind: fault, prev };
  }

  s.penalty = null;
  checkWinner(s);
  s.seq++;
  return s;
}

