Run the highscores Express API locally

1. Install dependencies:

```bash
cd /workspaces/catch_your_mess
npm install
```

2. Start the server:

```bash
npm start
```

The server listens on port 3000 by default and exposes:
- GET /api/highscores -> returns top 10 highscores JSON
- POST /api/highscores -> accepts { name: string, score: number } and returns updated top 10

Notes:
- The server stores data in `data/highscores.json` in the repo.
- The client (`scripts/script.js`) will try the server first; if unreachable it falls back to browser localStorage for offline play.
- To make the leaderboard visible across devices, host the server on a public URL or deploy it (Railway, Render, Heroku, etc.).
