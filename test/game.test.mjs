// Tests du moteur : node test/game.test.mjs   (ou npm test)
import assert from 'node:assert/strict';
import { newGame, apply, canMove, isLegal, canDraw, ATOUT } from '../js/game.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };

const C = (suit, rank, owner = 'host') => ({ id: suit * 22 + rank + (owner === 'guest' ? 500 : 0), suit, rank, owner });
const count = (s, r) => s.sides[r].stock.length + s.sides[r].waste.length;
const W = (p) => ({ k: 'waste', p });
const H = (p) => ({ k: 'hand', p });
const T = (i) => ({ k: 'tab', i });
const F = (i) => ({ k: 'found', i });

// plateau vide (aucun coup possible), piocheuses garnies de cartes hors jeu
function base() {
  const s = newGame('host');
  s.tab = [5, 8, 11, 14, 17].map((r) => [C(ATOUT, r, 'neutral')]); // colonnes pleines et sans coup possible
  s.found = [[], [], [], [], []];
  s.sides.host = { stock: [C(3, 9), C(3, 10), C(3, 11)], waste: [], hand: null };
  s.sides.guest = { stock: [C(3, 9, 'guest'), C(3, 10, 'guest'), C(3, 11, 'guest')], waste: [], hand: null };
  return s;
}
const move = (s, role, from, to) => apply(s, role, { t: 'move', from, to });

test('mise en place : 78 cartes uniques, 5 au milieu, 36 / 37', () => {
  const s = newGame('host');
  const all = [...s.tab.flat(), ...s.sides.host.stock, ...s.sides.guest.stock];
  assert.equal(all.length, 78);
  assert.equal(new Set(all.map((c) => c.id)).size, 78);
  assert.equal(s.tab.length, 5);
  assert.equal(s.sides.host.stock.length, 36);
  assert.equal(s.sides.guest.stock.length, 37);
  assert.equal(all.filter((c) => c.suit === ATOUT).length, 22);
});

test('fondations : As, Excuse pour les atouts, pas d\'effacement au Roi', () => {
  let s = base();
  s.tab[0] = [C(0, 1)]; s.tab[1] = [C(0, 2)];
  assert.equal(isLegal(s, 'host', T(0), F(0)), true);
  assert.equal(isLegal(s, 'host', T(1), F(0)), false);
  s.tab[2] = [C(ATOUT, 0)]; s.tab[3] = [C(ATOUT, 1)];
  assert.equal(isLegal(s, 'host', T(2), F(1)), true);
  assert.equal(isLegal(s, 'host', T(3), F(1)), false);
  s.found[2] = Array.from({ length: 13 }, (_, i) => C(1, i + 1));
  s.tab[4] = [C(1, 14)];
  assert.equal(isLegal(s, 'host', T(4), F(2)), true);
  s = move(s, 'host', T(4), F(2));
  assert.equal(s.found[2].length, 14);
});

test('rebut : valeur ±1 et couleur différente, atouts entre eux', () => {
  const s = base();
  s.sides.guest.waste = [C(1, 5, 'guest')]; // 5 de coeur (rouge)
  s.tab[0] = [C(0, 4)]; s.tab[1] = [C(2, 4)]; s.tab[2] = [C(0, 7)]; s.tab[3] = [C(ATOUT, 4)];
  assert.equal(isLegal(s, 'host', T(0), W('guest')), true);
  assert.equal(isLegal(s, 'host', T(1), W('guest')), false); // même couleur
  assert.equal(isLegal(s, 'host', T(2), W('guest')), false); // écart de 2
  assert.equal(isLegal(s, 'host', T(3), W('guest')), false); // atout sur une enseigne
  s.sides.guest.waste = [C(ATOUT, 5, 'guest')];
  assert.equal(isLegal(s, 'host', T(3), W('guest')), true);
});

test('colonnes : on descend en alternant, colonne vide acceptée', () => {
  const s = base();
  s.tab[0] = [C(0, 6)]; s.tab[1] = [C(1, 5)]; s.tab[2] = [C(0, 5)]; s.tab[3] = [C(ATOUT, 5)]; s.tab[4] = [];
  assert.equal(isLegal(s, 'host', T(1), T(0)), true);
  assert.equal(isLegal(s, 'host', T(2), T(0)), false);
  assert.equal(isLegal(s, 'host', T(3), T(0)), false);
  assert.equal(isLegal(s, 'host', T(1), T(4)), true);
});

test('retourner la pioche montre la carte sur la pioche, sans finir le tour', () => {
  let s = base();
  s.sides.host.waste = [C(0, 5)];
  s = apply(s, 'host', { t: 'draw' });
  assert.equal(s.turn, 'host');
  assert.ok(s.sides.host.hand);
  assert.equal(s.sides.host.stock.length, 2);
  assert.equal(s.sides.host.waste.length, 1);
  assert.equal(s.fault, null);
  assert.equal(apply(s, 'host', { t: 'draw' }), null); // pas de seconde carte tant qu'on tient la première
});

test('carte retournée injouable : la poser sur son rebut termine le tour', () => {
  let s = apply(base(), 'host', { t: 'draw' });
  s = move(s, 'host', H('host'), W('host')); // sans condition de valeur ni de couleur
  assert.equal(s.turn, 'guest');
  assert.equal(s.sides.host.hand, null);
  assert.equal(s.sides.host.waste.length, 1);
  assert.equal(s.fault, null);
});

test('carte retournée jouable : on la joue puis on retourne la suivante', () => {
  let s = base();
  s.sides.host.stock.push(C(0, 1)); // l'As de pique sera retourné
  s = apply(s, 'host', { t: 'draw' });
  s = move(s, 'host', H('host'), F(0));
  assert.equal(s.turn, 'host');
  assert.equal(s.fault, null);
  assert.equal(s.found[0].length, 1);
  assert.ok(apply(s, 'host', { t: 'draw' }));
});

test('poser sur son rebut une carte jouable ailleurs : coup oublié', () => {
  let s = base();
  s.sides.host.stock.push(C(0, 1));
  s = apply(s, 'host', { t: 'draw' });
  s = move(s, 'host', H('host'), W('host')); // l'As allait sur une fondation
  assert.equal(s.fault.kind, 'oubli');
  const c = apply(s, 'guest', { t: 'crapette' });
  assert.equal(c.turn, 'guest');
  assert.equal(c.sides.host.hand, null);
  assert.equal(count(c, 'host'), 3 + 1 + 2); // 3 en pioche + l'As sur le rebut + 2 de guest
});

test('la carte retournée ne se joue que par son propriétaire, et seule elle va sur son rebut', () => {
  let s = apply(base(), 'host', { t: 'draw' });
  s.tab[0] = [C(2, 5)];
  s.sides.host.waste = [C(0, 6)];
  assert.equal(canMove(s, 'host', T(0), W('host')), false); // on tient déjà une carte
  assert.equal(canMove(s, 'guest', H('host'), F(0)), false);
});

test('poser sur son propre rebut termine le tour', () => {
  let s = base();
  s.sides.host.waste = [C(0, 6)];
  s.tab[0] = [C(2, 5)];
  s = move(s, 'host', T(0), W('host'));
  assert.equal(s.turn, 'guest');
  assert.equal(s.fault, null);
});

test('coup oublié : détecté, puis crapette valide', () => {
  let s = base();
  s.sides.host.waste = [C(0, 1)]; // As jouable sur une fondation vide
  s = apply(s, 'host', { t: 'draw' });
  assert.equal(s.fault.kind, 'oubli');
  const c = apply(s, 'guest', { t: 'crapette' });
  assert.equal(c.turn, 'guest');
  // le tour fautif est annulé (l'As est revenu sur le rebut), puis le fautif récupère 2 cartes de l'autre
  assert.equal(c.sides.host.waste.length, 1);
  assert.equal(c.sides.host.waste[0].rank, 1);
  assert.equal(count(c, 'host'), 3 + 1 + 2);
  assert.equal(count(c, 'guest'), 3 - 2);
  assert.equal(c.penalty.who, 'host');
  assert.equal(c.fault, null);
});

test('coups contraires aux règles : refusés d\'emblée', () => {
  const s = base();
  s.tab[0] = [C(0, 11)]; s.tab[1] = [C(1, 6)]; s.tab[2] = [C(0, 2)]; // valet de pique, 6 de coeur, 2 de pique
  assert.equal(move(s, 'host', T(0), T(1)), null); // un valet sur un 6
  assert.equal(move(s, 'host', T(2), F(0)), null); // le 2 sur une fondation vide
  s.found[0] = [C(0, 1)];
  assert.ok(move(s, 'host', T(2), F(0))); // sur l'As de pique, oui
  assert.equal(move(s, 'host', T(2), F(1)), null); // pas sur une autre fondation vide
});

test('un 2 retourné alors que l\'As est posé : il faut le jouer dessus, sinon coup oublié', () => {
  let s = base();
  s.found[0] = [C(0, 1)];
  s.sides.host.stock.push(C(0, 2));
  s = apply(s, 'host', { t: 'draw' });
  s = move(s, 'host', H('host'), W('host')); // le pose sur son rebut au lieu de l'As
  assert.equal(s.fault.kind, 'oubli');
  const c = apply(s, 'guest', { t: 'crapette' });
  assert.equal(c.turn, 'guest');
  assert.equal(c.penalty.why, 'oubli');
});

test('un trou au milieu non comblé : coup oublié', () => {
  let s = base();
  s.tab[0] = [C(0, 9)]; s.tab[1] = [C(0, 5)]; s.tab[2] = [C(0, 7)]; s.tab[3] = [C(0, 3)]; s.tab[4] = []; // colonne 5 vide
  s.sides.host.waste = [C(1, 13)];
  const d = apply(s, 'host', { t: 'draw' }); // on retourne au lieu de combler le trou avec son rebut
  assert.equal(d.fault.kind, 'oubli');
  const ok = move(s, 'host', W('host'), T(4)); // on comble le trou
  assert.equal(ok.fault, null);
  s.sides.host.waste = [];
  assert.equal(apply(s, 'host', { t: 'draw' }).fault, null); // rien pour combler : pas de faute
});

test('colonne : on déplace la pile entière, par sa carte la plus ancienne', () => {
  let s = base();
  s.tab[0] = [C(1, 14), C(0, 13), C(2, 12)]; // Roi de coeur, Dame de pique, Cavalier de carreau
  s.sides.guest.waste = [C(3, 13, 'guest')]; // Dame de trèfle (noire)
  assert.equal(isLegal(s, 'host', T(0), W('guest')), true); // le Roi rouge va sur la Dame noire
  assert.equal(canMove(s, 'host', T(0), W('host')), false);
  s.found[0] = [C(2, 11)]; // Valet de carreau posé : le Cavalier du dessus peut monter seul
  assert.equal(isLegal(s, 'host', T(0), F(0)), true);
  const f = move(s, 'host', T(0), F(0));
  assert.deepEqual(f.tab[0].map((c) => c.rank), [14, 13]);
  assert.equal(f.found[0].length, 2);
  s.found[0] = [];
  assert.equal(isLegal(s, 'host', T(0), F(0)), false); // le Roi du dessous ne compte pas : le dessus n'est pas un As
  assert.equal(canMove(s, 'host', T(0), W('host')), false); // ni sur son propre rebut
  s = move(s, 'host', T(0), W('guest'));
  assert.equal(s.tab[0].length, 0);
  assert.deepEqual(s.sides.guest.waste.map((c) => c.rank), [13, 14, 13, 12]);
  assert.equal(s.turn, 'host'); // la main ne passe pas : ce n'est pas son rebut
});

test('pile posée sur une autre colonne si sa carte la plus ancienne s\'y range', () => {
  let s = base();
  s.tab[0] = [C(1, 9), C(3, 8)]; // 9 de coeur, 8 de trèfle
  s.tab[1] = [C(0, 10)]; // 10 de pique
  s.tab[2] = [C(2, 5)];
  assert.equal(isLegal(s, 'host', T(0), T(1)), true);
  assert.equal(isLegal(s, 'host', T(0), T(2)), false);
  s = move(s, 'host', T(0), T(1));
  assert.deepEqual(s.tab[1].map((c) => c.rank), [10, 9, 8]);
  assert.equal(s.tab[0].length, 0);
});

test('jouer sans avoir crié : crapette manquée, sans chaîne infinie', () => {
  let s = base();
  s.tab[0] = [C(0, 1)]; // l'As de pique pouvait aller sur une fondation
  s.sides.host.waste = [C(1, 2)];
  s = move(s, 'host', T(0), W('host')); // 2 rouge puis As noir sur le rebut : légal, mais coup oublié
  assert.equal(s.fault.kind, 'oubli');
  assert.equal(s.turn, 'guest');
  const g = apply(s, 'guest', { t: 'draw' }); // guest ne crie pas
  assert.equal(g.fault.by, 'guest');
  assert.equal(g.fault.kind, 'manque');
  const g2 = structuredClone(g);
  g2.sides.host.waste = []; // l'As n'est plus à jouer : aucune autre faute en vue
  const h = apply({ ...g2, turn: 'host' }, 'host', { t: 'draw' }); // host ne crie pas non plus
  assert.equal(h.fault, null);
  const c = apply(g, 'host', { t: 'crapette' }); // host punit guest
  assert.equal(c.penalty.who, 'guest');
  assert.equal(c.turn, 'host');
});

test('fausse alerte : celui qui crie récupère 2 cartes de l\'autre', () => {
  const s = base();
  const c = apply(s, 'guest', { t: 'crapette' });
  assert.equal(c.penalty.why, 'faux');
  assert.equal(count(c, 'guest'), 5);
  assert.equal(count(c, 'host'), 1);
  assert.equal(c.turn, 'host'); // le tour ne change pas
});

test('crier sur sa propre faute : fausse alerte, la faute reste contestable', () => {
  let s = base();
  s.sides.host.waste = [C(0, 1)];
  s = apply(s, 'host', { t: 'draw' }); // coup oublié
  const own = apply(s, 'host', { t: 'crapette' });
  assert.equal(own.penalty.why, 'faux');
  assert.ok(own.fault);
});

test('victoire en vidant, pénalité avec moins de 2 cartes', () => {
  let s = base();
  s.sides.host = { stock: [], waste: [C(0, 1)] };
  const w = move(s, 'host', W('host'), F(0));
  assert.equal(w.winner, 'host');
  s = base();
  s.sides.guest = { stock: [C(3, 9, 'guest')], waste: [] };
  const c = apply(s, 'host', { t: 'crapette' }); // fausse alerte : host prend la dernière carte de guest
  assert.equal(count(c, 'guest'), 0);
  assert.equal(c.winner, 'guest'); // un joueur sans carte a gagné
});

test('pioche vide : le rebut est retourné dans l\'ordre', () => {
  let s = base();
  s.sides.host = { stock: [], waste: [C(0, 7), C(0, 8)] };
  assert.equal(canDraw(s, 'host'), true);
  s = apply(s, 'host', { t: 'draw' });
  assert.equal(s.sides.host.hand.rank, 7); // la plus ancienne ressort la première
  assert.equal(s.sides.host.stock[0].rank, 8);
  assert.equal(s.sides.host.waste.length, 0);
});

test('emplacements invalides : refusés sans exception', () => {
  const s = base();
  s.tab[0] = [C(0, 1)];
  assert.equal(move(s, 'host', T(99), F(0)), null);
  assert.equal(move(s, 'host', T(0), F(99)), null);
  assert.equal(move(s, 'host', T(0), { k: 'waste', p: 'nobody' }), null);
  assert.equal(move(s, 'host', null, F(0)), null);
  assert.equal(canMove(s, 'guest', T(0), F(0)), false); // pas son tour
  assert.equal(apply(s, 'host', { t: 'pass' }), null);
});

console.log(`${n} tests passés`);
