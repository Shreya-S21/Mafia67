// Core game engine: role assignment, phase logic, AI bot behavior, win conditions
import {
  type Player,
  type Role,
  type GameState,
  type GamePhase,
  type ChatMessage,
  type NightActions,
  ROLE_CONFIG,
} from "./types";

// --- Role assignment ---
export function assignRoles(players: Player[]): Player[] {
  const count = players.length;
  const key = String(Math.min(Math.max(count, 6), 12));
  const cfg = ROLE_CONFIG[key] ?? ROLE_CONFIG["12"];

  const roles: Role[] = [];
  for (let i = 0; i < cfg.mafia; i++) roles.push("mafia");
  for (let i = 0; i < cfg.police; i++) roles.push("police");
  for (let i = 0; i < cfg.doctor; i++) roles.push("doctor");
  for (let i = 0; i < cfg.citizens; i++) roles.push("citizen");

  // Fisher-Yates shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, i) => ({
    ...p,
    role: roles[i % roles.length],
    isAlive: true,
  }));
}

// --- Initial state ---
export function createInitialGameState(roomId: string, players: Player[]): GameState {
  const withRoles = assignRoles(players);
  return {
    roomId,
    phase: "night",
    round: 1,
    players: withRoles,
    nightActions: {},
    votes: [],
    timer: 45,
    messages: [
      {
        id: cryptoId(),
        userId: "system",
        username: "System",
        message: `🌙 Night 1 begins. The town falls asleep...`,
        timestamp: Date.now(),
        type: "system",
      },
    ],
  };
}

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Win condition ---
export function checkWinCondition(players: Player[]): "mafia" | "town" | null {
  const alive = players.filter((p) => p.isAlive);
  const mafiaCount = alive.filter((p) => p.role === "mafia").length;
  const townCount = alive.length - mafiaCount;

  if (mafiaCount === 0) return "town";
  if (mafiaCount >= townCount) return "mafia";
  return null;
}

// --- Bot AI ---
const BOT_NAMES = [
  "Aria", "Rex", "Nova", "Jett", "Kira",
  "Zane", "Lyra", "Orion", "Sage", "Finn", "Ivy",
];

export function generateBotNames(count: number): string[] {
  const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function createBot(id: string, username: string, isHost = false): Player {
  return {
    id,
    username,
    isHost,
    isReady: true,
    isAlive: true,
    isBot: true,
    connected: true,
  };
}

// --- Bot night actions ---
export function botNightAction(bot: Player, state: GameState): Partial<NightActions> | string {
  const alivePlayers = state.players.filter((p) => p.isAlive);
  const aliveOthers = alivePlayers.filter((p) => p.id !== bot.id);

  if (bot.role === "mafia") {
    // Mafia targets non-mafia alive players
    const targets = aliveOthers.filter((p) => p.role !== "mafia");
    if (targets.length === 0) return {};
    const target = targets[Math.floor(Math.random() * targets.length)];
    return { mafiaTarget: target.id };
  }

  if (bot.role === "doctor") {
    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    return { doctorTarget: target.id };
  }

  if (bot.role === "police") {
    const targets = aliveOthers.filter((p) => p.role !== "police");
    if (targets.length === 0) return {};
    const target = targets[Math.floor(Math.random() * targets.length)];
    return { policeTarget: target.id };
  }

  return {};
}

// --- Bot voting ---
export function botVote(bot: Player, state: GameState): string | null {
  const aliveOthers = state.players.filter((p) => p.isAlive && p.id !== bot.id);
  if (aliveOthers.length === 0) return null;

  // Mafia avoids voting fellow mafia
  if (bot.role === "mafia") {
    const nonMafia = aliveOthers.filter((p) => p.role !== "mafia");
    if (nonMafia.length > 0) {
      return nonMafia[Math.floor(Math.random() * nonMafia.length)].id;
    }
  }

  return aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id;
}

// --- Bot chat messages ---
const BOT_MESSAGES = {
  day: [
    "I think {name} is acting suspicious...",
    "Anyone else notice how quiet {name} has been?",
    "I trust {name}, they seem honest.",
    "We need to vote carefully this round.",
    "My gut says {name} is mafia.",
    "Let's not rush the vote.",
    "{name}, where were you last night?",
    "I have a bad feeling about this.",
    "The police should reveal soon.",
    "Stay calm everyone, think logically.",
  ],
  night: [
    "This is getting intense.",
    "Hope the doctor saves the right person.",
    "Who do we trust anymore?",
    "I'm scared for tomorrow.",
  ],
};

export function botChatMessage(bot: Player, state: GameState): ChatMessage | null {
  if (!bot.isAlive) return null;
  if (Math.random() > 0.4) return null; // 40% chance to chat

  const pool = state.phase === "night" ? BOT_MESSAGES.night : BOT_MESSAGES.day;
  let msg = pool[Math.floor(Math.random() * pool.length)];

  const aliveOthers = state.players.filter((p) => p.isAlive && p.id !== bot.id);
  if (aliveOthers.length > 0 && msg.includes("{name}")) {
    const target = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
    msg = msg.replace("{name}", target.username);
  }

  return {
    id: cryptoId(),
    userId: bot.id,
    username: bot.username,
    message: msg,
    timestamp: Date.now(),
    type: "public",
    avatar: bot.avatar,
  };
}

// --- Resolve night ---
export function resolveNight(state: GameState): {
  killed?: Player;
  saved: boolean;
  announcement: string;
} {
  const { nightActions, players } = state;
  const mafiaTarget = players.find((p) => p.id === nightActions.mafiaTarget);
  const doctorTarget = players.find((p) => p.id === nightActions.doctorTarget);

  const saved = !!mafiaTarget && !!doctorTarget && mafiaTarget.id === doctorTarget.id;

  if (!mafiaTarget) {
    return {
      saved: false,
      announcement: "🌅 The night passed peacefully. No one was harmed.",
    };
  }

  if (saved) {
    return {
      saved: true,
      announcement: "🌅 Dawn breaks! The doctor saved someone from the Mafia's attack. No casualties tonight.",
    };
  }

  return {
    killed: mafiaTarget,
    saved: false,
    announcement: `🌅 Dawn reveals a grim scene. ${mafiaTarget.username} was eliminated by the Mafia during the night. They were a ${mafiaTarget.role}.`,
  };
}

// --- Resolve voting ---
export function resolveVotes(votes: { voterId: string; targetId: string }[]): string | null {
  const tally: Record<string, number> = {};
  for (const v of votes) {
    tally[v.targetId] = (tally[v.targetId] ?? 0) + 1;
  }

  const entries = Object.entries(tally);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const tied = entries.filter(([, count]) => count === top[1]);

  // Tie → no elimination
  if (tied.length > 1) return null;
  return top[0];
}

// --- Points calculation ---
export function calculatePoints(
  player: Player,
  winner: "mafia" | "town",
  stats: { correctInvestigations: number; successfulSaves: number; survivedGame: boolean }
): number {
  let points = 0;
  const isMafia = player.role === "mafia";
  const won = (winner === "mafia" && isMafia) || (winner === "town" && !isMafia);

  if (won) {
    if (isMafia) points += 100;
    else if (player.role === "police") points += 80;
    else if (player.role === "doctor") points += 80;
    else points += 50;
  }

  if (stats.survivedGame) points += 20;
  points += stats.correctInvestigations * 10;
  points += stats.successfulSaves * 20;

  return points;
}

export function initialPhaseForPhase(phase: GamePhase): number {
  if (phase === "night") return 45;
  if (phase === "day-discussion") return 60;
  if (phase === "day-voting") return 30;
  return 0;
}
