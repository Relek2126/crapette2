// Garde-fou : une règle CSS « .xxx { … } » ne doit pas viser une classe déjà donnée à un bouton
// (ex. « .ghost » avait rendu les boutons « Annuler » et « Mode test » fixes et impossibles à cliquer).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const split = (s) => s.split(/\s+/).filter(Boolean);
const buttonClasses = (js) => [...js.matchAll(/h\('button', '([^']+)'/g)].flatMap((m) => split(m[1]));
// classes données à autre chose qu'un bouton (h('div', 'cls'), classList.add('cls'))
const otherClasses = (js) => [
  ...[...js.matchAll(/h\('(?!button)\w+', '([^']+)'/g)].flatMap((m) => split(m[1])),
  ...[...js.matchAll(/classList\.add\('([^']+)'/g)].flatMap((m) => split(m[1])),
];
const bareRules = (css, cls) => css.split('\n').filter((l) => new RegExp(`^\\.${cls}[\\s{.:,>+~\\[]`).test(l));

// classe partagée entre un bouton et un autre élément, avec une règle CSS qui la vise seule
function conflicts(js, css) {
  const others = new Set(otherClasses(js));
  return [...new Set(buttonClasses(js))].filter((c) => others.has(c) && bareRules(css, c).length);
}

// le détecteur lui-même doit repérer le cas qui a posé problème
const bug = "h('button', 'ghost', 'x'); g.classList.add('ghost');";
assert.deepEqual(conflicts(bug, '.ghost { position: fixed; }'), ['ghost']);
assert.deepEqual(conflicts(bug, 'button.ghost { background: none; }'), []);
assert.deepEqual(conflicts("h('button', 'edx', 'x')", '.edx { top: 0; }'), []); // classe propre au bouton : normal

const js = readFileSync(new URL('js/main.js', root), 'utf8');
const css = readFileSync(new URL('style.css', root), 'utf8');
assert.deepEqual(conflicts(js, css), [], 'une règle CSS écrase la classe d\'un bouton');
console.log('ok css : aucune règle ne vise une classe de bouton');
