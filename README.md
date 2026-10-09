# Draftroom

Fast prototype for a live NBA fantasy draft room.

## Current slice

- Create a room with configurable team count and roster size
- Toggle snake-draft order
- Join with a six-character room code
- Search and draft from a seeded NBA player pool
- Persist rooms and picks in SQLite
- Broadcast picks to all connected clients through Socket.IO

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in two browser windows to test multiplayer updates. The API/socket server runs on `http://localhost:3001`.

NBA data is intentionally seeded for this first slice. The next integration point is a server-side provider adapter for a live stats API.
