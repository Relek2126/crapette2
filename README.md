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

Il faut un hébergeur Node.js (pas un simple hébergeur de fichiers) : `server.js` sert le jeu et le relais WebSocket (`/ws`) par lequel passent les deux joueurs. Exemple sur Render (gratuit) : Web Service relié à ce dépôt, build `npm install`, start `npm start`. Les joueurs ouvrent l'adresse Render.

Règles et décisions de conception : voir [NOTES.md](NOTES.md).
