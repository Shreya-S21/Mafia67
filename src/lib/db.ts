// Firebase Realtime Database layer
import { db, ref, set, get, update, remove, push, onValue, onChildAdded, off } from "./firebase";
import type { Player, ChatMessage, NightActions, Vote, Role, GamePhase } from "./types";

// Re-export Firebase primitives for engine use
export { db, ref, set, get, update, remove, push, onValue, onChildAdded, off };
export const dbGet = get;
export const dbSet = set;
export const dbRemove = remove;
export const dbUpdate = update;

// ── Paths ────────────────────────────────────────────────────────────────────
export const roomRef      = (code: string)              => `rooms/${code}`;
export const playersRef   = (code: string)              => `rooms/${code}/players`;
export const playerRef    = (code: string, uid: string) => `rooms/${code}/players/${uid}`;
export const gameStateRef = (code: string)              => `rooms/${code}/gameState`;
export const messagesRef  = (code: string)              => `rooms/${code}/messages`;
export const usersRef     = (uid: string)               => `users/${uid}`;

// ── Types ────────────────────────────────────────────────────────────────────
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
  voteMap?: Record<string, string>;
  lastEliminated?: string;
  lastSaved?: boolean;
  winner?: "mafia" | "town";
  startedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Room ─────────────────────────────────────────────────────────────────────
export async function createRoom(code: string, name: string, hostId: string, isPrivate: boolean, password?: string): Promise<RoomData> {
  if (!db) throw new Error("Database not configured");
  const room: RoomData = { name, code, isPrivate, password, hostId, status: "waiting", createdAt: Date.now() };
  await set(ref(db, roomRef(code)), clean(room));
  return room;
}

export async function getRoom(code: string): Promise<RoomData | null> {
  if (!db) return null;
  const snap = await get(ref(db, roomRef(code)));
  return snap.exists() ? snap.val() : null;
}

export async function deleteRoom(code: string): Promise<void> {
  if (!db) return;
  await Promise.all([
    remove(ref(db, roomRef(code))),
    remove(ref(db, playersRef(code))),
    remove(ref(db, messagesRef(code))),
    remove(ref(db, gameStateRef(code))),
  ]);
}

export async function updateRoomStatus(code: string, status: RoomData["status"]): Promise<void> {
  if (!db) return;
  await update(ref(db, roomRef(code)), { status });
}

export async function updateRoomHost(code: string, hostId: string): Promise<void> {
  if (!db) return;
  await update(ref(db, roomRef(code)), { hostId });
}

// ── Player ────────────────────────────────────────────────────────────────────
export async function joinPlayer(code: string, player: Omit<Player, "role">): Promise<Player> {
  if (!db) throw new Error("Database not configured");
  const data = clean({ ...player });
  await set(ref(db, playerRef(code, player.id)), data);
  return data as Player;
}

export async function leaveRoom(code: string, uid: string): Promise<void> {
  if (!db) return;
  await remove(ref(db, playerRef(code, uid)));
}

export async function updatePlayer(code: string, uid: string, data: Partial<Player>): Promise<void> {
  if (!db) return;
  await update(ref(db, playerRef(code, uid)), clean(data));
}

export async function getPlayers(code: string): Promise<Player[]> {
  if (!db) return [];
  const snap = await get(ref(db, playersRef(code)));
  if (!snap.exists()) return [];
  const out: Player[] = [];
  snap.forEach(c => { out.push(c.val() as Player); return undefined; });
  return out;
}

export function onPlayersChanged(code: string, cb: (players: Player[]) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, playersRef(code));
  onValue(r, snap => {
    const out: Player[] = [];
    if (snap.exists()) snap.forEach(c => { out.push(c.val() as Player); return undefined; });
    cb(out);
  });
  return () => off(r);
}

export async function kickPlayer(code: string, targetId: string): Promise<void> {
  if (!db) return;
  await remove(ref(db, playerRef(code, targetId)));
}

// ── Game State ────────────────────────────────────────────────────────────────
export async function saveGameState(code: string, gs: Partial<GameStateData>): Promise<void> {
  if (!db) return;
  await update(ref(db, gameStateRef(code)), clean({ ...gs, startedAt: Date.now() }));
}

export async function getGameState(code: string): Promise<GameStateData | null> {
  if (!db) return null;
  const snap = await get(ref(db, gameStateRef(code)));
  return snap.exists() ? snap.val() : null;
}

export function onGameStateChanged(code: string, cb: (gs: GameStateData | null) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, gameStateRef(code));
  onValue(r, snap => cb(snap.exists() ? snap.val() : null));
  return () => off(r);
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export async function sendChatMessage(code: string, msg: Omit<ChatMessage, "timestamp">): Promise<void> {
  if (!db) return;
  await push(ref(db, messagesRef(code)), clean({ ...msg, timestamp: Date.now() }));
}

export async function getMessages(code: string): Promise<ChatMessage[]> {
  if (!db) return [];
  const snap = await get(ref(db, messagesRef(code)));
  if (!snap.exists()) return [];
  const out: ChatMessage[] = [];
  snap.forEach(c => { out.push(c.val() as ChatMessage); return undefined; });
  return out;
}

export function onNewMessage(code: string, cb: (msg: ChatMessage) => void): () => void {
  if (!db) return () => {};
  const r = ref(db, messagesRef(code));
  onChildAdded(r, snap => cb(snap.val() as ChatMessage));
  return () => off(r);
}

// ── User ──────────────────────────────────────────────────────────────────────
export async function saveUserToDB(uid: string, username: string, email?: string, avatar?: string): Promise<void> {
  if (!db) return;
  const snap = await get(ref(db, usersRef(uid)));
  if (!snap.exists()) {
    await set(ref(db, usersRef(uid)), clean({
      uid, username, email, avatar,
      totalGamesPlayed: 0, gamesWon: 0, totalPoints: 0,
      roleStats: { mafia: { played: 0, won: 0 }, police: { played: 0, won: 0 }, doctor: { played: 0, won: 0 }, citizen: { played: 0, won: 0 } },
      matchHistory: [], createdAt: Date.now(),
    }));
  } else {
    await update(ref(db, usersRef(uid)), clean({ username, email, avatar }));
  }
}

export async function updateUserStats(uid: string, role: Role, won: boolean, points: number, playersCount: number, roundsPlayed: number): Promise<void> {
  if (!db) return;
  const snap = await get(ref(db, usersRef(uid)));
  if (!snap.exists()) return;
  const user = snap.val() as any;
  const rs: any = user.roleStats ?? {};
  const history: unknown[] = user.matchHistory ?? [];
  history.unshift({ id: cryptoId(), date: Date.now(), role, won, pointsEarned: points, playersCount, roundsPlayed });
  if (history.length > 50) history.length = 50;
  await update(ref(db, usersRef(uid)), {
    totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
    gamesWon: (user.gamesWon ?? 0) + (won ? 1 : 0),
    totalPoints: (user.totalPoints ?? 0) + points,
    [`roleStats.${role}.played`]: (rs[role]?.played ?? 0) + 1,
    [`roleStats.${role}.won`]: (rs[role]?.won ?? 0) + (won ? 1 : 0),
    matchHistory: history,
  });
}

export async function getLeaderboardDB(limit = 100): Promise<{ uid: string; username: string; avatar?: string; totalPoints: number; gamesWon: number; totalGamesPlayed: number }[]> {
  if (!db) return [];
  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return [];
  const users: any[] = [];
  snap.forEach(c => { users.push(c.val()); return undefined; });
  users.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  return users.slice(0, limit).map((u: any) => ({
    uid: u.uid, username: u.username, avatar: u.avatar,
    totalPoints: u.totalPoints ?? 0, gamesWon: u.gamesWon ?? 0, totalGamesPlayed: u.totalGamesPlayed ?? 0,
  }));
}
