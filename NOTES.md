# Crapette — notes

## État actuel
- Jeu de tarot de 78 cartes : 5 au milieu (neutres), le reste partagé 36 / 37 (celui qui commence en a 36).
- Chaque joueur : une pioche + un rebut. But : tout jouer le premier.
- Fondations : 5 places (As→Roi par enseigne, atouts Excuse→21). Pas d'effacement.
- Colonnes : on descend en alternant les couleurs ; atouts entre eux ; colonne vide = tout.
- Rebut (le sien ou celui de l'adversaire) : valeur ±1, couleur différente.
- Tour : on touche la pioche, la carte se retourne face visible SUR la pioche (hand). On la joue si on peut (puis on retourne la suivante), sinon on la pose sur son rebut : c'est là que le tour passe tout seul (poser une carte de colonne sur son rebut, ±1 couleur différente, le fait aussi).
- Obligation : jouer tout coup possible (fondation, colonne non vide, rebut adverse), y compris avec la carte retournée, avant de retourner une carte ou de poser la sienne sur son rebut. Sinon faute « coup oublié ».
- Les coups contraires aux règles (valet sur un 6, 2 sur une fondation vide…) sont refusés d'emblée (« Coup impossible »). Seuls les oublis (coup obligatoire non joué) passent, et « Crapette ! » (un bouton par joueur) les juge. Fautif :
- Colonnes : une suite se déplace en bloc, par sa carte la plus ancienne (la plus haute) ; elle va sur une autre colonne ou sur le rebut adverse (valeur ±1, couleur différente, testée sur cette carte), jamais sur son propre rebut (sauf pile d'une seule carte). Sur une fondation, seule la carte du dessus part.
- Trou au milieu (colonne vide) : il faut le combler avec la carte retournée ou le dessus de son rebut avant de retourner une carte ou de finir son tour, sinon coup oublié. Rien à combler avec = pas de faute.
- Fondations : l'As (Excuse pour les atouts) puis on monte dans la même enseigne ; avec l'As de pique posé, un 2 de pique retourné doit aller dessus, sinon coup oublié.
- (Ancien :) Fautif : annulation, il récupère 2 cartes du tas de l'autre (choix de l'utilisateur ; le jeu de base, lui, fait retourner 2 cartes de sa propre pioche), la main passe à celui qui a crié. Fausse alerte : celui qui crie récupère 2 cartes du tas de l'autre.
- Jouer sans avoir crié = crapette manquée (une seule à la fois, pas de chaîne).
- Réseau : l'invité envoie le `seq` qu'il voit ; un « Crapette ! » en retard est jugé sur l'état vu.

## Interface (paysage)
- Plateau en paysage : adversaire à gauche, 5 fondations + 5 colonnes au centre, toi à droite. Taille des cartes calculée sur la hauteur et la largeur (`--cw` dans style.css). En portrait sur petit écran : message « Tourne ton téléphone ». Verrouillage paysage tenté en plein écran.
- Carte sélectionnée : surélevée ; toutes les destinations (fondations, colonnes, rebuts) sont surlignées pareil, sans indiquer la légalité.
- Colonnes : chevauchement qui se resserre selon la hauteur (variable `--n` posée par main.js).
- Un seul jeu commun : toutes les cartes (faces et dos) utilisent les images de l'hôte (Bastos) ; l'invité reçoit ce jeu au début de la partie. Le dos garde la couleur rouge/bleue des propriétaires seulement s'il n'y a pas d'image de dos.
- Cartes personnalisées : dos, 16 têtes (V/C/D/R x 4), 22 atouts (Excuse + 1 à 21) avec import en lot ; l'image remplit toute la carte (images 200x280).
- Maquettes Superdesign (portrait) : canvas du projet « Crapette » ; la version paysage n'a pas été maquettée, elle a été faite directement.

- Comme le jeu de base : glisser-déposer de la carte du dessus (le toucher / toucher marche aussi), bandeau « à qui le tour », gros « CRAPETTE ! » vert, chiffre de la pioche au centre du dos.

## Lancer
- `npm start` (port 5173), `npm test` (moteur, 21 tests + garde-fou CSS).

## Pièges connus
- Ne jamais écrire une règle CSS « .nom { … } » sur une classe déjà utilisée par des boutons (`primary`, `ghost`, `mini`, `crap`) : la classe `.ghost` du glisser-déposer avait cassé « Annuler » et « Mode test » (corrigé : la carte glissée est `.drag-card`). `test/css.test.mjs` le vérifie.

## À faire / à décider
- Pas encore testé sur un vrai téléphone (glisser au doigt, verrouillage paysage).
- Mise en ligne (gratuite) pour jouer à distance ; pas encore testé entre deux téléphones.
- Fuite d'info : l'état envoyé contient la pioche adverse (acceptable entre proches).


