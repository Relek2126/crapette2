# Crapette

Jeu de crapette à deux joueurs, avec un jeu de tarot de 78 cartes, directement dans le navigateur (pas de compte, pas de build).

- Partie en ligne entre deux appareils (PeerJS / WebRTC) : un joueur crée la partie (Bastos), l'autre la rejoint avec le lien (PP).
- « Mode test » pour jouer à deux sur le même écran, sans connexion.
- Cartes personnalisables (dos, têtes, atouts) depuis l'éditeur ; les images restent dans le navigateur.
- À mettre en paysage sur téléphone.

## Lancer en local

```bash
npm start
```

Puis ouvrir http://localhost:5173.

## Tests

```bash
npm test
```

## Mettre en ligne

Le site est statique : n'importe quel hébergement de fichiers convient (GitHub Pages, Netlify, Cloudflare Pages…). Pas besoin de serveur ; `server.js` ne sert qu'au développement.

Règles et décisions de conception : voir [NOTES.md](NOTES.md).
