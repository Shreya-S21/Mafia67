# 🎭 Mafia 67

<div align="center">

![React](https://img.shields.io/badge/React-18-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-purple?logo=vite)
![Firebase](https://img.shields.io/badge/Firebase-Authentication-orange?logo=firebase)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38BDF8?logo=tailwindcss)
![Status](https://img.shields.io/badge/Status-Live-success)

### 🔥 Real-Time Multiplayer Social Deduction Experience

Play, deceive, investigate, survive.

🌐 **Live Demo:** https://mafia67-ribr.vercel.app/

</div>

---

## 🎮 About The Project

**Mafia 67** is a modern multiplayer social deduction game inspired by Mafia and Werewolf.

Players are assigned hidden roles and must work together, deceive opponents, uncover secrets, and survive through day and night cycles.

Built with a focus on:

- ⚡ Real-time gameplay
- 🔐 Secure authentication
- 📱 Responsive user experience
- 🎨 Modern UI/UX
- 🚀 Fast deployment and scalability

---

## 🌟 Live Demo

### 🚀 Play Now

👉 **https://mafia67-ribr.vercel.app/**

No installation required.

Create a room, invite friends, and start playing instantly.

---

## ✨ Core Features

### 👥 Multiplayer Rooms

- Create public or private rooms
- Password-protected game sessions
- Host management controls
- Join with room codes
- Automatic host transfer

### 🎭 Hidden Roles

| Role | Ability |
|--------|---------|
| 🔫 Mafia | Eliminate players secretly |
| 🕵️ Detective | Investigate suspicious players |
| 🩺 Doctor | Protect players during the night |
| 👤 Citizen | Find and eliminate the Mafia |

### 🌙 Dynamic Day & Night Cycles

- Automatic phase transitions
- Timed discussions
- Strategic voting
- Night actions
- Win condition detection

### 💬 Real-Time Communication

- Lobby chat
- Day discussion chat
- Mafia-only private night chat
- Instant updates with live synchronization

### 🤖 AI Opponents

- Practice without friends
- Smart bot decision-making
- Solo gameplay support

### 🏆 Progress Tracking

- Match history
- Leaderboards
- Player statistics
- Role-based performance tracking

---

## 🎯 Game Flow

```text
Create Room
      ↓
Players Join
      ↓
Role Assignment
      ↓
Night Phase
      ↓
Day Discussion
      ↓
Voting Phase
      ↓
Player Eliminated
      ↓
Repeat Until Victory
```

---

## 🏗️ Architecture

```text
┌──────────────────────────────┐
│       React + Vite           │
│      TypeScript UI           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     Firebase Authentication  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Socket.IO Realtime      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Prisma + SQLite Database     │
└──────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS v4
- React Router
- Lucide Icons

### Backend

- Node.js
- Express
- Socket.IO
- Prisma ORM

### Database

- SQLite
- PostgreSQL Ready

### Authentication

- Firebase Authentication
- Google Login
- Email & Password Login

### Deployment

- Vercel

---

## 📂 Project Structure

```bash
src/
│
├── components/
├── context/
├── pages/
├── hooks/
├── lib/
├── assets/
│
├── App.tsx
└── main.tsx

server/
│
├── prisma/
├── src/
└── package.json
```

---

## 🔒 Security Features

- JWT Authentication
- Firebase Token Verification
- Server-authoritative Game Logic
- Protected Mafia Communication
- Anti-cheat State Validation
- Role Privacy Enforcement

---

## 📈 Future Enhancements

- 🎙️ Voice Chat Integration
- 🏅 Ranked Matchmaking
- 🎨 Custom Themes
- 🌎 Global Matchmaking
- 📱 Progressive Web App
- 🎭 Additional Roles
- 👑 Tournament Mode

---

## 🚀 Local Development

### Clone Repository

```bash
git clone <your-repository-url>
cd mafia-game
```

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build Production Version

```bash
npm run build
```

---

## 🎲 Strategy Tips

### As Mafia

- Blend into discussions
- Avoid obvious accusations
- Coordinate with teammates

### As Detective

- Gather information quietly
- Reveal findings strategically
- Protect your identity

### As Doctor

- Predict Mafia targets
- Stay unpredictable
- Protect valuable players

### As Citizen

- Analyze voting patterns
- Watch player behavior
- Build alliances carefully

---

## 🤝 Contributing

Contributions, suggestions, and feature requests are welcome.

Feel free to fork the project and submit a pull request.

---

## ⭐ Support

If you enjoyed the project:

⭐ Star the repository

🎮 Share it with friends

🚀 Play the live version

### 🌐 Live Demo

**https://mafia67-ribr.vercel.app/**

---

<div align="center">

### 🎭 Trust Nobody. Question Everyone. Survive The Night.

Made with ❤️ using React, TypeScript, Firebase & Vite

</div>
