// Real-time database layer — rooms, players, chat, game state
import { db, ref, dbGet, dbSet, dbRemove, dbUpdate, push, onValue, onChildAdded, off } from "./firebase";

// Re-export for direct use by GameEngineContext (atomic writes)
export { db, ref, dbUpdate, dbGet };
import type { Player, ChatMessage, NightActions, Vote, Role, GamePhase } from "./types";

// Firebase Realtime Database rejects `undefined` values — strip them recursively
function clean<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(clean) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = typeof v === "object" && v !== null ? clean(v) : v;
  }
  return out as T;
}

export function roomRef(code: string) { return `rooms/${code}`; }
export function playersRef(code: string) { return `rooms/${code}/players`; }
export function playerRef(code: string, uid: string) { return `rooms/${code}/players/${uid}`; }
export function gameStateRef(code: string) { return `rooms/${code}/gameState`; }
export function messagesRef(code: string) { return `rooms/${code}/messages`; }
export function usersRef(uid: string) { return `users/${uid}`; }

export interface RoomData {
  name: string;
  code: string;
  isPrivate: boolean;
  password?: string;
  hostId: string;
  status: "waiting" | "in-game" | "finished";
  createdAt: number;
}

export interface GameStateData {
  phase: GamePhase;
  round: number;
  timer: number;
  nightActions: NightActions;
  votes: Vote[];
  lastEliminated?: string;
  lastSaved?: boolean;
  winner?: "mafia" | "town";
  startedAt: number;
}

// Generate unique room code
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Create Room ──
export async function createRoom(code: string, name: string, hostId: string, isPrivate: boolean, password?: string): Promise<RoomData> {
  if (!db) throw new Error("Database not configured");
  const room: RoomData = { name, code, isPrivate, password, hostId, status: "waiting", createdAt: Date.now() };
  await dbSet(ref(db, roomRef(code)), clean(room));
  return room;
}

// ── Get Room ──
export async function getRoom(code: string): Promise<RoomData | null> {
  if (!db) return null;
  const snap = await dbGet(ref(db, roomRef(code)));
  return snap.exists() ? snap.val() : null;
}

// ── List Public Rooms ──
export async function listRooms(): Promise<{ code: string; room: RoomData; playerCount: number }[]> {
  if (!db) return [];
  const snap = await dbGet(ref(db, "rooms"));
  if (!snap.exists()) return [];
  const result: { code: string; room: RoomData; playerCount: number }[] = [];
  snap.forEach((childSnap: { key: string | null; val: () => RoomData }) => {
    const room = childSnap.val();
    if (room.status === "waiting" && !room.isPrivate && childSnap.key) {
      result.push({ code: childSnap.key, room, playerCount: 0 });
    }
  });
  return result.sort((a, b) => b.room.createdAt - a.room.createdAt);
}

// ── Join Room (add player) ──
export async function joinPlayer(code: string, player: Omit<Player, "role">): Promise<Player> {
  if (!db) throw new Error("Database not configured");
  const playerData = clean({ ...player });
  await dbSet(ref(db, playerRef(code, player.id)), playerData);
  return playerData as Player;
}

// ── Leave Room ──
export async function leaveRoom(code: string, uid: string): Promise<void> {
  if (!db) return;
  await dbRemove(ref(db, playerRef(code, uid)));
}

// ── Kick Player ──
export async function kickPlayer(code: string, targetId: string): Promise<void> {
  if (!db) return;
  await dbRemove(ref(db, playerRef(code, targetId)));
}

// ── Get All Players ──
export async function getPlayers(code: string): Promise<Player[]> {
  if (!db) return [];
  const snap = await dbGet(ref(db, playersRef(code)));
  if (!snap.exists()) return [];
  const players: Player[] = [];
  snap.forEach((childSnap: { val: () => Player }) => { players.push(childSnap.val()); return; });
  return players;
}

// ── Real-time Player Listener ──
export function onPlayersChanged(code: string, callback: (players: Player[]) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, playersRef(code));
  onValue(r, (snap) => {
    const players: Player[] = [];
    if (snap.exists()) {
      snap.forEach((childSnap: { val: () => Player }) => { players.push(childSnap.val()); });
    }
    callback(players);
  }, (err) => {
    console.error("onPlayersChanged error (check Firebase rules):", err);
  });
  return () => off(r);
}

// ── Update Player ──
export async function updatePlayer(code: string, uid: string, data: Partial<Player>): Promise<void> {
  if (!db) return;
  await dbUpdate(ref(db, playerRef(code, uid)), clean(data));
}

// ── Update Room Status ──
export async function updateRoomStatus(code: string, status: RoomData["status"]): Promise<void> {
  if (!db) return;
  await dbUpdate(ref(db, roomRef(code)), { status });
}

export async function updateRoomHost(code: string, hostId: string): Promise<void> {
  if (!db) return;
  await dbUpdate(ref(db, roomRef(code)), { hostId });
}

export async function deleteRoom(code: string): Promise<void> {
  if (!db) return;
  // Delete room doc, players, messages, and game state
  await Promise.all([
    dbRemove(ref(db, roomRef(code))),
    dbRemove(ref(db, playersRef(code))),
    dbRemove(ref(db, messagesRef(code))),
    dbRemove(ref(db, gameStateRef(code))),
  ]);
}

// ── Save Game State ──
export async function saveGameState(code: string, gs: GameStateData): Promise<void> {
  if (!db) return;
  await dbUpdate(ref(db, gameStateRef(code)), clean(gs));
}

// ── Get Game State ──
export async function getGameState(code: string): Promise<GameStateData | null> {
  if (!db) return null;
  const snap = await dbGet(ref(db, gameStateRef(code)));
  return snap.exists() ? snap.val() : null;
}

// ── Real-time Game State Listener ──
export function onGameStateChanged(code: string, callback: (gs: GameStateData | null) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, gameStateRef(code));
  onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
  return () => off(r);
}

// ── Send Chat Message ──
export async function sendChatMessage(code: string, msg: Omit<ChatMessage, "timestamp">): Promise<void> {
  if (!db) return;
  await push(ref(db, messagesRef(code)), clean({ ...msg, timestamp: Date.now() }));
}

// ── Get Recent Messages ──
export async function getMessages(code: string): Promise<ChatMessage[]> {
  if (!db) return [];
  const snap = await dbGet(ref(db, messagesRef(code)));
  const msgs: ChatMessage[] = [];
  if (snap.exists()) {
    snap.forEach((childSnap: { val: () => ChatMessage }) => { msgs.push(childSnap.val()); });
  }
  return msgs;
}

// ── Real-time Message Listener ──
export function onNewMessage(code: string, callback: (msg: ChatMessage) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, messagesRef(code));
  onChildAdded(r, (snap) => callback(snap.val() as ChatMessage));
  return () => off(r);
}

// ── Clear Room Messages ──
export async function clearMessages(code: string): Promise<void> {
  if (!db) return;
  await dbRemove(ref(db, messagesRef(code)));
}

// ── Save User Profile ──
export async function saveUserToDB(uid: string, username: string, email?: string, avatar?: string): Promise<void> {
  if (!db) return;
  const snap = await dbGet(ref(db, usersRef(uid)));
  if (!snap.exists()) {
    await dbSet(ref(db, usersRef(uid)), clean({
      uid, username, email, avatar,
      totalGamesPlayed: 0, gamesWon: 0, totalPoints: 0,
      roleStats: { mafia: { played: 0, won: 0 }, police: { played: 0, won: 0 }, doctor: { played: 0, won: 0 }, citizen: { played: 0, won: 0 } },
      matchHistory: [],
      createdAt: Date.now(),
    }));
  } else {
    // Keep Firebase profile aligned with the chosen in-app username/avatar.
    // This prevents Google display names/photos from becoming the game identity.
    await dbUpdate(ref(db, usersRef(uid)), clean({ username, email, avatar }));
  }
}

// ── Update User Stats ──
export async function updateUserStats(uid: string, role: Role, won: boolean, points: number, playersCount: number, roundsPlayed: number): Promise<void> {
  if (!db) return;
  const snap = await dbGet(ref(db, usersRef(uid)));
  if (!snap.exists()) return;
  const user = snap.val() as any;
  const updates: Record<string, any> = {
    totalGamesPlayed: (user.totalGamesPlayed || 0) + 1,
    gamesWon: (user.gamesWon || 0) + (won ? 1 : 0),
    totalPoints: (user.totalPoints || 0) + points,
    [`roleStats.${role}.played`]: (user.roleStats?.[role]?.played || 0) + 1,
    [`roleStats.${role}.won`]: (user.roleStats?.[role]?.won || 0) + (won ? 1 : 0),
  };
  const history = user.matchHistory || [];
  history.unshift({ id: cryptoId(), date: Date.now(), role, won, pointsEarned: points, playersCount, roundsPlayed });
  if (history.length > 50) history.length = 50;
  updates.matchHistory = history;
  await dbUpdate(ref(db, usersRef(uid)), updates);
}

// ── Get Leaderboard ──
export async function getLeaderboardDB(limit = 100): Promise<{ uid: string; username: string; avatar?: string; totalPoints: number; gamesWon: number; totalGamesPlayed: number }[]> {
  if (!db) return [];
  const snap = await dbGet(ref(db, "users"));
  if (!snap.exists()) return [];
  const users: any[] = [];
  snap.forEach((childSnap: { val: () => any }) => { users.push(childSnap.val()); return undefined; });
  users.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  return users.slice(0, limit).map(u => ({ uid: u.uid, username: u.username, avatar: u.avatar, totalPoints: u.totalPoints || 0, gamesWon: u.gamesWon || 0, totalGamesPlayed: u.totalGamesPlayed || 0 }));
}

// ── Cleanup Room ──
export async function cleanupRoom(code: string): Promise<void> {
  if (!db) return;
  await dbUpdate(ref(db, roomRef(code)), { status: "finished" });
}
