# 🎭 Mafia — Multiplayer Social Deduction Game

A production-ready, real-time multiplayer Mafia (Werewolf-style) game built with
**React + TypeScript + Tailwind** (frontend) and **Node.js + Socket.IO + Prisma +
SQLite** (backend), with **Firebase Authentication** for secure, JWT-based login.

## ✨ Features

- 🔐 **Firebase Auth** — Email/password, Google, and demo mode (runs without keys)
- 🏠 **Room system** — Create, join, public/private rooms, password protection,
  host controls, kick players, host transfer on disconnect
- 🎭 **4 Roles** — Mafia, Detective (Police), Doctor, Citizen with automatic
  balanced assignment for 6–12 players
- 🌙 **Day/Night phases** — Timed phases with automatic transitions
- 💬 **Real-time chat** — Lobby chat, day chat, private mafia chat at night
- 🗳️ **Voting** — Live tallies, tie handling, eliminated player reveal
- 🤖 **AI opponents** — Play solo against smart bots in the demo
- 🏆 **Leaderboard & profiles** — Role-wise stats, match history, points
- 📱 **Mobile-first responsive UI** — Dark-mode, animated role reveal
- 🔁 **Reconnect support** — Server persists socket state briefly for drops
- 💾 **SQLite via Prisma** — portable to Postgres when you scale

## 🏗️ Architecture

```
┌──────────────────────────┐         ┌─────────────────────────────┐
│                          │  HTTPS  │                             │
│  React + Vite + TS       │◄───────►│  Express + Socket.IO        │
│  Tailwind CSS            │   WSS   │  Firebase Admin (JWT)       │
│  Firebase Auth (client)  │         │  Prisma ORM                 │
│                          │         │                             │
└──────────────────────────┘         └─────────────┬───────────────┘
                                                   │
                                                   ▼
                                       ┌───────────────────────┐
                                       │  SQLite (dev.db)      │
                                       │  → Prisma migrations  │
                                       │  → Postgres-ready     │
                                       └───────────────────────┘
```

### Frontend (`/`)
- `src/lib/firebase.ts` — Firebase client config (uses `VITE_FIREBASE_*` env vars)
- `src/lib/gameEngine.ts` — Client-side game logic, bot AI, points calculator
- `src/lib/types.ts` — Shared TypeScript types
- `src/lib/storage.ts` — Local profile/match persistence (demo mode)
- `src/context/AuthContext.tsx` — Auth provider (Firebase or demo)
- `src/components/` — All UI: Landing, Auth, Lobby, Game, Profile, Leaderboard

### Backend (`/server/`)
- `server/src/index.ts` — Express + Socket.IO server, Firebase JWT verification
- `server/src/game/logic.ts` — Authoritative game rules
- `server/prisma/schema.prisma` — Full database schema

## 🚀 Quick start

### 1. Configure Firebase

Create a project at https://console.firebase.google.com/, enable Email/Password
and Google sign-in methods, then copy `.env.example` to `.env` and paste your
config values:

```bash
cp .env.example .env
# Edit .env with your VITE_FIREBASE_* values
```

> **No Firebase?** The game runs in **demo mode** automatically — you'll see a
> banner and can play locally with AI bots.

### 2. Install & run

```bash
npm install

# Frontend only (for demo mode / static hosting)
npm run dev        # http://localhost:5173

# Full stack
cd server && npm install && cd ..
npm run db:migrate # from server/
npm run dev        # runs frontend (5173) + backend (3001) concurrently
```

### 3. Deploy

Frontend deploys as a static site (Vercel, Netlify, GitHub Pages — just run
`npm run build` and serve `dist/`). Backend deploys to any Node host (Render,
Railway, Fly.io). Set the `VITE_FIREBASE_*` env vars on the host.

## 🎮 Game flow

1. **Lobby** — Host creates a room, players join (6–12), host clicks Start.
2. **Role reveal** — Each player sees a private card with their role.
3. **Night** (45s) — Mafia picks a victim, Doctor picks a save, Detective
   investigates. Only mafia members can chat.
4. **Day discussion** (60s) — Announcements, all alive players chat.
5. **Voting** (30s) — Alive players cast votes; majority wins. Ties = no kill.
6. **Repeat** until Mafia ≥ Town (Mafia wins) or all Mafia are gone (Town wins).

## 🏆 Points

| Outcome | Points |
|---|---|
| Mafia wins | +100 to every Mafia |
| Town wins | +50 Citizen / +80 Detective / +80 Doctor |
| Survived entire game | +20 |
| Correct police investigation | +10 each |
| Successful Doctor save | +20 |

## 📦 Database schema

See [`server/prisma/schema.prisma`](server/prisma/schema.prisma) for the full
Prisma schema (Users, Rooms, RoomPlayers, Games, GamePlayers, Votes,
NightActions, MatchHistory). Portable to Postgres by changing `provider`.

## 🔒 Security

- Firebase JWTs are verified server-side with Firebase Admin.
- Roles are never broadcast; the server emits them only to the owning socket.
- Dead players cannot vote, act, or chat.
- Mafia chat is only routed to alive mafia members.
- Server is authoritative — clients cannot self-report kills or results.

## 📂 Folder structure

```
.
├─ src/                       # React + Vite frontend
│  ├─ components/             # Landing, Auth, Lobby, Game, Profile, Leaderboard
│  ├─ context/                # AuthProvider
│  ├─ lib/                    # firebase.ts, gameEngine.ts, types.ts, storage.ts
│  ├─ App.tsx                 # Router
│  └─ main.tsx
├─ server/                    # Node.js backend (reference / production)
│  ├─ prisma/schema.prisma
│  └─ src/index.ts
├─ index.html
├─ .env.example
└─ README.md
```

## 🛠️ Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide icons |
| Auth | Firebase Auth (client SDK + Admin SDK) |
| Realtime | Socket.IO 4 |
| API | Express 4, Zod |
| Database | SQLite via Prisma (Postgres-ready) |
| Build | Vite, vite-plugin-singlefile |

Happy bluffing! 🎭
