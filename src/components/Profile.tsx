// Profile page: user stats, role breakdown, match history
import { Navigate } from "react-router-dom";
import { Trophy, Target, Award, Gamepad2 } from "lucide-react";
import { Avatar, Badge, Card } from "./ui";
import { useAuth } from "../context/AuthContext";
import { ROLE_INFO } from "../lib/types";
import type { Role } from "../lib/types";

export function Profile() {
  const { user, profile } = useAuth();

  if (!user || !profile) return <Navigate to="/auth" replace />;

  const winRate = profile.totalGamesPlayed > 0
    ? Math.round((profile.gamesWon / profile.totalGamesPlayed) * 100)
    : 0;

  const roles: Role[] = ["mafia", "police", "doctor", "citizen"];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <Card className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
        <Avatar name={profile.username} src={user.avatar} size={96} ring="ring-4 ring-red-900/40" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{profile.username}</h1>
          <p className="mt-1 text-sm text-slate-400">{profile.email || "Demo player"}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Badge color="yellow"><Trophy size={10} /> {profile.totalPoints} pts</Badge>
            <Badge color="green"><Award size={10} /> {profile.gamesWon} wins</Badge>
            <Badge color="slate"><Gamepad2 size={10} /> {profile.totalGamesPlayed} games</Badge>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-slate-500">Win rate</div>
          <div className="text-4xl font-bold text-amber-400">{winRate}%</div>
        </div>
      </Card>

      {/* Role stats */}
      <div>
        <h2 className="mb-3 text-xl font-bold">Role Statistics</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => {
            const stats = profile.roleStats[role];
            const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
            return (
              <Card key={role} className="transition hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{ROLE_INFO[role].icon}</div>
                  <div>
                    <div className={`font-bold ${ROLE_INFO[role].color}`}>{ROLE_INFO[role].name}</div>
                    <div className="text-xs text-slate-500">{stats.played} games played</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold">{stats.played}</div>
                    <div className="text-[10px] uppercase text-slate-500">Played</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-400">{stats.won}</div>
                    <div className="text-[10px] uppercase text-slate-500">Won</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-400">{rate}%</div>
                    <div className="text-[10px] uppercase text-slate-500">Rate</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Match history */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
          <Target size={20} /> Match History
        </h2>
        {profile.matchHistory.length === 0 ? (
          <Card className="text-center text-slate-400">
            <p>No matches yet. Join a game to start building your history!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {profile.matchHistory.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  m.won
                    ? "border-emerald-900/50 bg-emerald-950/20"
                    : "border-red-900/50 bg-red-950/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{ROLE_INFO[m.role].icon}</div>
                  <div>
                    <div className="font-medium">
                      {m.won ? "Victory" : "Defeat"}{" "}
                      <span className="text-slate-500">as {ROLE_INFO[m.role].name}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(m.date).toLocaleDateString()} • {m.playersCount} players • {m.roundsPlayed} rounds
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${m.won ? "text-emerald-400" : "text-slate-400"}`}>
                    +{m.pointsEarned}
                  </div>
                  <div className="text-xs text-slate-500">points</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
