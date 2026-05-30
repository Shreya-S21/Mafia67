// Shared types for Mafia game

export type Role = "mafia" | "police" | "doctor" | "citizen";

export interface Player {
  id: string;
  username: string;
  avatar?: string;
  isHost: boolean;
  isReady: boolean;
  isAlive: boolean;
  isBot: boolean;
  role?: Role;
  connected: boolean;
}

export type GamePhase = "lobby" | "night" | "day-discussion" | "day-voting" | "game-over";

export interface NightActions {
  mafiaTarget?: string;
  doctorTarget?: string;
  policeTarget?: string;
  policeResult?: { targetId: string; isMafia: boolean } | null;
}

export interface Vote {
  voterId: string;
  targetId: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  type: "public" | "mafia-chat" | "system";
  avatar?: string;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  isPrivate: boolean;
  password?: string;
  hostId: string;
  players: Player[];
  status: "waiting" | "in-game" | "finished";
  createdAt: number;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  round: number;
  players: Player[];
  nightActions: NightActions;
  votes: Vote[];
  timer: number;
  lastEliminated?: string;
  lastSaved?: boolean;
  winner?: "mafia" | "town";
  messages: ChatMessage[];
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  totalGamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  roleStats: {
    mafia: { played: number; won: number };
    police: { played: number; won: number };
    doctor: { played: number; won: number };
    citizen: { played: number; won: number };
  };
  matchHistory: MatchResult[];
  createdAt: number;
}

export interface MatchResult {
  id: string;
  date: number;
  role: Role;
  won: boolean;
  pointsEarned: number;
  playersCount: number;
  roundsPlayed: number;
}

export const ROLE_CONFIG: Record<string, { mafia: number; police: number; doctor: number; citizens: number }> = {
  "6": { mafia: 1, police: 1, doctor: 1, citizens: 3 },
  "7": { mafia: 2, police: 1, doctor: 1, citizens: 3 },
  "8": { mafia: 2, police: 1, doctor: 1, citizens: 4 },
  "9": { mafia: 3, police: 1, doctor: 1, citizens: 4 },
  "10": { mafia: 3, police: 1, doctor: 1, citizens: 5 },
  "11": { mafia: 3, police: 1, doctor: 2, citizens: 5 },
  "12": { mafia: 4, police: 1, doctor: 2, citizens: 5 },
};

export const ROLE_INFO: Record<Role, { name: string; description: string; color: string; icon: string }> = {
  mafia: {
    name: "Mafia",
    description: "Eliminate town members at night. Blend in during the day.",
    color: "text-red-500",
    icon: "🎭",
  },
  police: {
    name: "Detective",
    description: "Investigate one player each night to learn if they are Mafia.",
    color: "text-purple-500",
    icon: "🔍",
  },
  doctor: {
    name: "Doctor",
    description: "Protect one player each night from the Mafia's attack.",
    color: "text-emerald-500",
    icon: "⚕️",
  },
  citizen: {
    name: "Citizen",
    description: "Use logic and discussion to identify the Mafia and vote them out.",
    color: "text-blue-500",
    icon: "👤",
  },
};
