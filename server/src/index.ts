/**
 * Mafia Game Server
 *
 * Stack:
 *   - Express  (REST API)
 *   - Socket.IO (real-time game events, chat)
 *   - Firebase Admin (JWT verification for authenticated users)
 *   - Prisma + SQLite (persistence)
 *
 * Run:
 *   cp .env.example .env && npm run db:migrate && npm run dev
 */
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { PrismaClient, type Prisma } from "@prisma/client";
import admin from "firebase-admin";
import { z } from "zod";
import { resolveNight, resolveVotes, checkWinCondition, assignRoles, ROLE_CONFIG } from "./game/logic";

// --- Firebase Admin ---
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  });
}

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// --- Middleware: verify Firebase JWT ---
async function verifyToken(req: express.Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const token = header.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// --- REST endpoints ---

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.get("/api/leaderboard", async (_req, res) => {
  const top = await prisma.user.findMany({
    orderBy: { totalPoints: "desc" },
    take: 100,
    select: { id: true, username: true, avatar: true, totalPoints: true, gamesWon: true, totalGamesPlayed: true },
  });
  res.json(top);
});

app.get("/api/profile/:firebaseUid", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid: req.params.firebaseUid } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const history = await prisma.matchHistory.findMany({
    where: { userId: user.id },
    orderBy: { playedAt: "desc" },
    take: 50,
  });
  res.json({ ...user, matchHistory: history });
});

app.get("/api/rooms", async (_req, res) => {
  const rooms = await prisma.room.findMany({
    where: { status: "waiting", isPrivate: false },
    orderBy: { createdAt: "desc" },
    include: { players: true },
    take: 50,
  });
  res.json(rooms);
});

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(40),
  isPrivate: z.boolean().optional(),
  password: z.string().optional(),
});

app.post("/api/rooms", async (req, res) => {
  const uid = await verifyToken(req);
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const user = await ensureUser(uid);
  const code = generateCode();

  const room = await prisma.room.create({
    data: {
      code,
      name: parsed.data.name,
      isPrivate: parsed.data.isPrivate ?? false,
      password: parsed.data.password,
      hostId: user.id,
      players: { create: { userId: user.id, isHost: true, isReady: true } },
    },
    include: { players: { include: { user: true } } },
  });

  res.json(room);
});

// --- Socket.IO auth ---
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Missing auth token"));
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    (socket.data as { uid: string }).uid = decoded.uid;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

// --- In-memory room state for fast access (persisted to DB on key events) ---
type SocketRoom = {
  dbId: string;
  code: string;
  name: string;
  hostUid: string;
  players: { uid: string; username: string; socketId: string; isHost: boolean; isReady: boolean; role?: string; alive: boolean }[];
  status: "waiting" | "in-game" | "finished";
  phase?: "night" | "day-discussion" | "day-voting" | "game-over";
  round: number;
  nightActions: Record<string, { type: string; target?: string }>;
  votes: Record<string, string>; // voterUid -> targetUid
  timer: NodeJS.Timeout | null;
};

const rooms = new Map<string, SocketRoom>();

/** Socket.IO event contract (see ../docs/socket-events.md for full list):
 *
 * Client -> Server:
 *   room:join        { code, password? }
 *   room:leave       {}
 *   room:ready       { ready: boolean }
 *   room:kick        { targetUid }
 *   room:start       {}
 *   chat:message     { message }
 *   game:action      { type: "kill" | "save" | "investigate", targetUid }
 *   game:vote        { targetUid }
 *
 * Server -> Client:
 *   room:state       full room snapshot
 *   room:player-joined / room:player-left
 *   chat:message
 *   game:phase       { phase, round, timer }
 *   game:announcement { message }
 *   game:role-reveal { role }
 *   game:police-result { isMafia }
 *   game:over        { winner, players }
 *   error            { message }
 */

io.on("connection", (socket) => {
  const uid = (socket.data as { uid: string }).uid;
  let currentRoomCode: string | null = null;

  socket.on("room:join", async (payload: { code: string; password?: string }) => {
    let room = rooms.get(payload.code);

    if (!room) {
      // Load from DB
      const dbRoom = await prisma.room.findUnique({
        where: { code: payload.code },
        include: { players: { include: { user: true } } },
      });
      if (!dbRoom) return socket.emit("error", { message: "Room not found" });
      if (dbRoom.isPrivate && dbRoom.password !== payload.password) {
        return socket.emit("error", { message: "Invalid password" });
      }

      const hostPlayer = dbRoom.players.find((p) => p.isHost);
      room = {
        dbId: dbRoom.id,
        code: dbRoom.code,
        name: dbRoom.name,
        hostUid: hostPlayer?.user.firebaseUid ?? "",
        players: [],
        status: "waiting",
        round: 0,
        nightActions: {},
        votes: {},
        timer: null,
      };
      rooms.set(payload.code, room);
    }

    if (room.players.length >= 12) return socket.emit("error", { message: "Room full" });
    if (room.players.find((p) => p.uid === uid)) {
      // Reconnect
      const p = room.players.find((x) => x.uid === uid)!;
      p.socketId = socket.id;
    } else {
      const user = await ensureUser(uid);
      room.players.push({
        uid, username: user.username, socketId: socket.id,
        isHost: room.players.length === 0, isReady: true, alive: true,
      });
    }

    socket.join(payload.code);
    currentRoomCode = payload.code;
    io.to(payload.code).emit("room:state", sanitizeRoom(room, uid));
  });

  socket.on("room:start", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostUid !== uid) return socket.emit("error", { message: "Only host can start" });
    if (room.players.length < 6) return socket.emit("error", { message: "Need 6+ players" });

    // Assign roles
    const roles = assignRoles(room.players.length);
    room.players.forEach((p, i) => {
      p.role = roles[i];
      p.alive = true;
    });
    room.status = "in-game";
    room.round = 1;
    room.phase = "night";

    // Persist to DB
    persistGameStart(room).catch(console.error);

    // Private role reveal
    room.players.forEach((p) => {
      io.to(p.socketId).emit("game:role-reveal", { role: p.role });
    });
    io.to(currentRoomCode).emit("game:phase", { phase: "night", round: 1, timer: 45 });
    io.to(currentRoomCode).emit("game:announcement", { message: "🌙 Night 1 begins. The town falls asleep..." });

    startPhaseTimer(room, currentRoomCode);
  });

  socket.on("game:action", (payload: { type: "kill" | "save" | "investigate"; targetUid: string }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.phase !== "night") return;
    const me = room.players.find((p) => p.uid === uid);
    if (!me || !me.alive) return;

    if (me.role === "mafia" && payload.type === "kill") {
      room.nightActions.mafia = { type: "kill", target: payload.targetUid };
      // Broadcast to mafia members
      room.players.filter((p) => p.role === "mafia" && p.alive).forEach((m) => {
        io.to(m.socketId).emit("game:announcement", { message: `🎭 Mafia chose to kill ${nameOf(room!, payload.targetUid)}` });
      });
    } else if (me.role === "doctor" && payload.type === "save") {
      room.nightActions.doctor = { type: "save", target: payload.targetUid };
    } else if (me.role === "police" && payload.type === "investigate") {
      const target = room.players.find((p) => p.uid === payload.targetUid);
      io.to(socket.id).emit("game:police-result", { isMafia: target?.role === "mafia" });
      room.nightActions.police = { type: "investigate", target: payload.targetUid };
    }
  });

  socket.on("game:vote", (payload: { targetUid: string }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.phase !== "day-voting") return;
    const me = room.players.find((p) => p.uid === uid);
    if (!me || !me.alive) return;
    room.votes[uid] = payload.targetUid;
    io.to(currentRoomCode!).emit("game:vote-update", { votes: tallyVotes(room) });
  });

  socket.on("chat:message", (payload: { message: string }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    const me = room.players.find((p) => p.uid === uid);
    if (!me || !me.alive) return;
    if (room.phase === "night" && me.role !== "mafia") return;

    const isMafiaChat = room.phase === "night" && me.role === "mafia";
    const recipients = isMafiaChat
      ? room.players.filter((p) => p.role === "mafia" && p.alive)
      : room.players;

    recipients.forEach((p) => {
      io.to(p.socketId).emit("chat:message", {
        uid, username: me.username, message: payload.message,
        type: isMafiaChat ? "mafia-chat" : "public", timestamp: Date.now(),
      });
    });
  });

  socket.on("disconnect", () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const p = room.players.find((x) => x.uid === uid);
        if (p) p.socketId = "";
        io.to(currentRoomCode).emit("room:state", sanitizeRoom(room, uid));
      }
    }
  });
});

// --- Helpers ---

function startPhaseTimer(room: SocketRoom, code: string) {
  if (room.timer) clearTimeout(room.timer);
  const duration = room.phase === "night" ? 45000 : room.phase === "day-discussion" ? 60000 : 30000;

  room.timer = setTimeout(() => {
    advancePhase(room, code);
  }, duration);
}

function advancePhase(room: SocketRoom, code: string) {
  if (room.phase === "night") {
    const { killed, saved, announcement } = resolveNight(room.players, room.nightActions);
    if (killed) {
      const p = room.players.find((x) => x.uid === killed);
      if (p) p.alive = false;
    }
    io.to(code).emit("game:announcement", { message: announcement });
    const winner = checkWinCondition(room.players);
    if (winner) return endGame(room, code, winner);
    room.phase = "day-discussion";
    room.nightActions = {};
    io.to(code).emit("game:phase", { phase: "day-discussion", round: room.round, timer: 60 });
  } else if (room.phase === "day-discussion") {
    room.phase = "day-voting";
    room.votes = {};
    io.to(code).emit("game:phase", { phase: "day-voting", round: room.round, timer: 30 });
  } else if (room.phase === "day-voting") {
    const eliminatedUid = resolveVotes(Object.entries(room.votes).map(([voterId, targetId]) => ({ voterId, targetId })));
    let announcement = "";
    if (eliminatedUid) {
      const p = room.players.find((x) => x.uid === eliminatedUid);
      if (p) {
        p.alive = false;
        announcement = `🗳️ ${p.username} was eliminated. They were a ${p.role}.`;
      }
    } else {
      announcement = "🗳️ Vote tied. No one was eliminated.";
    }
    io.to(code).emit("game:announcement", { message: announcement });
    const winner = checkWinCondition(room.players);
    if (winner) return endGame(room, code, winner);
    room.round += 1;
    room.phase = "night";
    room.votes = {};
    io.to(code).emit("game:phase", { phase: "night", round: room.round, timer: 45 });
    io.to(code).emit("game:announcement", { message: `🌙 Night ${room.round} begins...` });
  }
  startPhaseTimer(room, code);
}

function endGame(room: SocketRoom, code: string, winner: "mafia" | "town") {
  room.status = "finished";
  room.phase = "game-over";
  if (room.timer) clearTimeout(room.timer);
  io.to(code).emit("game:over", {
    winner,
    players: room.players.map((p) => ({ username: p.username, role: p.role, alive: p.alive })),
  });
  // Persist results to DB
  persistGameEnd(room, winner).catch(console.error);
}

function tallyVotes(room: SocketRoom): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.values(room.votes).forEach((uid) => { counts[uid] = (counts[uid] ?? 0) + 1; });
  return counts;
}

function nameOf(room: SocketRoom, uid: string) {
  return room.players.find((p) => p.uid === uid)?.username ?? "Unknown";
}

function sanitizeRoom(room: SocketRoom, forUid: string) {
  return {
    code: room.code,
    name: room.name,
    status: room.status,
    phase: room.phase,
    round: room.round,
    players: room.players.map((p) => ({
      uid: p.uid,
      username: p.username,
      isHost: p.isHost,
      isReady: p.isReady,
      connected: !!p.socketId,
      alive: p.alive,
      // Role is only visible to yourself (or revealed at end)
      role: p.uid === forUid ? p.role : undefined,
    })),
  };
}

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function ensureUser(uid: string) {
  let user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user) {
    try {
      const fbUser = await admin.auth().getUser(uid);
      user = await prisma.user.create({
        data: {
          firebaseUid: uid,
          username: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Player",
          email: fbUser.email,
          avatar: fbUser.photoURL,
        },
      });
    } catch {
      user = await prisma.user.create({ data: { firebaseUid: uid, username: "Player" } });
    }
  }
  return user;
}

async function persistGameStart(room: SocketRoom) {
  const dbRoom = await prisma.room.findUnique({ where: { code: room.code }, include: { players: { include: { user: true } } } });
  if (!dbRoom) return;
  await prisma.room.update({ where: { id: dbRoom.id }, data: { status: "in-game" } });
  const game = await prisma.game.create({ data: { roomId: dbRoom.id, phase: "night", round: 1 } });
  for (const p of room.players) {
    const dbPlayer = dbRoom.players.find((x) => x.user.firebaseUid === p.uid);
    if (!dbPlayer) continue;
    await prisma.gamePlayer.create({ data: { gameId: game.id, userId: dbPlayer.userId, role: p.role ?? "citizen" } });
  }
}

async function persistGameEnd(room: SocketRoom, winner: "mafia" | "town") {
  const game = await prisma.game.findFirst({ where: { room: { code: room.code } }, orderBy: { startedAt: "desc" } });
  if (!game) return;
  await prisma.game.update({ where: { id: game.id }, data: { phase: "game-over", winner, endedAt: new Date() } });

  for (const p of room.players) {
    const dbPlayer = await prisma.user.findFirst({ where: { firebaseUid: p.uid } });
    if (!dbPlayer || !p.role) continue;
    const won = (winner === "mafia" && p.role === "mafia") || (winner === "town" && p.role !== "mafia");
    const points = calculatePoints(p.role, won, p.alive);

    await prisma.user.update({
      where: { id: dbPlayer.id },
      data: {
        totalGamesPlayed: { increment: 1 },
        gamesWon: { increment: won ? 1 : 0 },
        totalPoints: { increment: points },
        [`${p.role}Played`]: { increment: 1 },
        [`${p.role}Won`]: { increment: won ? 1 : 0 },
      } as Prisma.UserUpdateInput,
    });

    await prisma.matchHistory.create({
      data: {
        gameId: game.id,
        userId: dbPlayer.id,
        role: p.role,
        won,
        pointsEarned: points,
        roundsPlayed: room.round,
        playersCount: room.players.length,
      },
    });
  }
}

function calculatePoints(role: string, won: boolean, survived: boolean): number {
  let pts = 0;
  if (won) {
    if (role === "mafia") pts += 100;
    else if (role === "police") pts += 80;
    else if (role === "doctor") pts += 80;
    else pts += 50;
  }
  if (survived) pts += 20;
  return pts;
}

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => console.log(`🎭 Mafia server listening on :${PORT}`));
