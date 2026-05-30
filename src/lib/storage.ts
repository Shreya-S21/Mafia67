// LocalStorage persistence for user profiles and match history.
// In production, this would be a REST call to the Node.js/Prisma/SQLite backend.
import type { UserProfile, MatchResult } from "./types";

const PROFILE_KEY = "mafia.profile";
const LEADERBOARD_KEY = "mafia.leaderboard";

export function loadProfile(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`${PROFILE_KEY}.${userId}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(`${PROFILE_KEY}.${profile.id}`, JSON.stringify(profile));
    updateLeaderboard(profile);
  } catch {
    // ignore
  }
}

export function createProfile(id: string, username: string, email?: string, avatar?: string): UserProfile {
  return {
    id,
    username,
    email,
    avatar,
    totalGamesPlayed: 0,
    gamesWon: 0,
    totalPoints: 0,
    roleStats: {
      mafia: { played: 0, won: 0 },
      police: { played: 0, won: 0 },
      doctor: { played: 0, won: 0 },
      citizen: { played: 0, won: 0 },
    },
    matchHistory: [],
    createdAt: Date.now(),
  };
}

export function addMatchToProfile(profile: UserProfile, match: MatchResult): UserProfile {
  const updated: UserProfile = {
    ...profile,
    totalGamesPlayed: profile.totalGamesPlayed + 1,
    gamesWon: profile.gamesWon + (match.won ? 1 : 0),
    totalPoints: profile.totalPoints + match.pointsEarned,
    roleStats: {
      ...profile.roleStats,
      [match.role]: {
        played: profile.roleStats[match.role].played + 1,
        won: profile.roleStats[match.role].won + (match.won ? 1 : 0),
      },
    },
    matchHistory: [match, ...profile.matchHistory].slice(0, 50),
  };
  saveProfile(updated);
  return updated;
}

// --- Leaderboard ---
export interface LeaderboardEntry {
  id: string;
  username: string;
  avatar?: string;
  totalPoints: number;
  gamesWon: number;
  totalGamesPlayed: number;
}

function updateLeaderboard(profile: UserProfile): void {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    const list: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((e) => e.id === profile.id);
    const entry: LeaderboardEntry = {
      id: profile.id,
      username: profile.username,
      avatar: profile.avatar,
      totalPoints: profile.totalPoints,
      gamesWon: profile.gamesWon,
      totalGamesPlayed: profile.totalGamesPlayed,
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    list.sort((a, b) => b.totalPoints - a.totalPoints);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // ignore
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

// Seed demo leaderboard on first load so the page isn't empty
export function seedDemoLeaderboard() {
  const existing = getLeaderboard();
  if (existing.length > 0) return;
  const seeds: LeaderboardEntry[] = [
    { id: "bot-aria", username: "Aria", totalPoints: 1240, gamesWon: 18, totalGamesPlayed: 24 },
    { id: "bot-rex", username: "Rex", totalPoints: 980, gamesWon: 14, totalGamesPlayed: 22 },
    { id: "bot-nova", username: "Nova", totalPoints: 870, gamesWon: 11, totalGamesPlayed: 19 },
    { id: "bot-jett", username: "Jett", totalPoints: 640, gamesWon: 9, totalGamesPlayed: 16 },
    { id: "bot-kira", username: "Kira", totalPoints: 520, gamesWon: 7, totalGamesPlayed: 13 },
    { id: "bot-zane", username: "Zane", totalPoints: 410, gamesWon: 6, totalGamesPlayed: 12 },
    { id: "bot-lyra", username: "Lyra", totalPoints: 330, gamesWon: 5, totalGamesPlayed: 10 },
    { id: "bot-orion", username: "Orion", totalPoints: 220, gamesWon: 3, totalGamesPlayed: 8 },
  ];
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(seeds));
}
