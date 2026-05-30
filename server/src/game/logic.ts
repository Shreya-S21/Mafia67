// Server-side game logic: role assignment, phase resolution, win conditions.
// Mirrors src/lib/gameEngine.ts on the client but is the authoritative source.

export const ROLE_CONFIG: Record<number, { mafia: number; police: number; doctor: number; citizens: number }> = {
  6:  { mafia: 1, police: 1, doctor: 1, citizens: 3 },
  7:  { mafia: 2, police: 1, doctor: 1, citizens: 3 },
  8:  { mafia: 2, police: 1, doctor: 1, citizens: 4 },
  9:  { mafia: 3, police: 1, doctor: 1, citizens: 4 },
  10: { mafia: 3, police: 1, doctor: 1, citizens: 5 },
  11: { mafia: 3, police: 1, doctor: 2, citizens: 5 },
  12: { mafia: 4, police: 1, doctor: 2, citizens: 5 },
};

export function assignRoles(playerCount: number): string[] {
  const n = Math.max(6, Math.min(12, playerCount));
  const cfg = ROLE_CONFIG[n];
  const roles: string[] = [];
  for (let i = 0; i < cfg.mafia; i++) roles.push("mafia");
  for (let i = 0; i < cfg.police; i++) roles.push("police");
  for (let i = 0; i < cfg.doctor; i++) roles.push("doctor");
  for (let i = 0; i < cfg.citizens; i++) roles.push("citizen");
  // Fisher-Yates
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

type Player = { uid: string; role?: string; alive: boolean };

export function resolveNight(
  players: Player[],
  actions: Record<string, { type: string; target?: string }>
): { killed?: string; saved: boolean; announcement: string } {
  const mafiaTargetUid = actions.mafia?.target;
  const doctorTargetUid = actions.doctor?.target;

  if (!mafiaTargetUid) {
    return { saved: false, announcement: "🌅 The night passed peacefully. No one was harmed." };
  }

  const saved = mafiaTargetUid === doctorTargetUid;
  if (saved) {
    return { saved: true, announcement: "🌅 Dawn breaks! The Doctor saved someone. No casualties tonight." };
  }

  const killed = players.find((p) => p.uid === mafiaTargetUid);
  return {
    killed: mafiaTargetUid,
    saved: false,
    announcement: `🌅 ${killed?.role ? `A player` : "Someone"} was eliminated by the Mafia. They were a ${killed?.role ?? "town member"}.`,
  };
}

export function resolveVotes(votes: { voterId: string; targetId: string }[]): string | null {
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.targetId] = (tally[v.targetId] ?? 0) + 1;
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const tied = entries.filter(([, c]) => c === entries[0][1]);
  if (tied.length > 1) return null; // Tie = no elimination
  return entries[0][0];
}

export function checkWinCondition(players: Player[]): "mafia" | "town" | null {
  const alive = players.filter((p) => p.alive);
  const mafia = alive.filter((p) => p.role === "mafia").length;
  const town = alive.length - mafia;
  if (mafia === 0) return "town";
  if (mafia >= town) return "mafia";
  return null;
}
