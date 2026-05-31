// Profile page: stats, role breakdown, match history, avatar picker
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Trophy, Target, Award, Gamepad2, Check } from "lucide-react";
import { Avatar, Card, Badge, Button } from "./ui";
import { useAuth } from "../context/AuthContext";
import { ROLE_INFO } from "../lib/types";
import { SELECTABLE_AVATARS } from "../lib/avatars";
import { saveProfile } from "../lib/storage";
import type { Role } from "../lib/types";

export function Profile() {
  const { user, profile, setProfile } = useAuth();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user || !profile) return <Navigate to="/auth" replace />;

  const winRate = profile.totalGamesPlayed > 0
    ? Math.round((profile.gamesWon / profile.totalGamesPlayed) * 100)
    : 0;

  function pickAvatar(emoji: string) {
    if (!profile) return;
    const updated = { ...profile, avatar: emoji };
    saveProfile(updated);
    setProfile(updated);
    setSaved(true);
    setTimeout(() => { setSaved(false); setShowAvatarPicker(false); }, 1000);
  }

  const roles: Role[] = ["mafia", "police", "doctor", "citizen"];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Avatar with edit button */}
          <div className="relative flex-shrink-0">
            <div
              className="cursor-pointer transition hover:scale-105"
              onClick={() => setShowAvatarPicker(v => !v)}
              title="Click to change avatar"
            >
              <Avatar
                name={profile.username}
                src={profile.avatar}
                uid={user.uid}
                size={96}
                ring="ring-4 ring-red-500/30"
              />
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 border border-white/10 text-xs shadow-lg">
                ✏️
              </div>
            </div>

            {/* Avatar picker dropdown */}
            {showAvatarPicker && (
              <div className="absolute left-0 top-24 z-50 w-72 animate-slide-up rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
                <div className="mb-3 text-sm font-semibold text-slate-300">Choose your avatar</div>
                <div className="grid grid-cols-8 gap-1.5">
                  {SELECTABLE_AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => pickAvatar(emoji)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-white/10 hover:scale-110 ${
                        profile.avatar === emoji ? "bg-red-500/20 ring-2 ring-red-500/50" : "bg-white/5"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {saved && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                    <Check size={14} /> Saved!
                  </div>
                )}
                <button
                  onClick={() => setShowAvatarPicker(false)}
                  className="mt-3 w-full rounded-lg bg-white/5 py-1.5 text-xs text-slate-400 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-bold">{profile.username}</h1>
            <p className="mt-1 text-sm text-slate-400">{profile.email || (user.isDemo ? "Demo player" : "Player")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge color="yellow"><Trophy size={10} /> {profile.totalPoints} pts</Badge>
              <Badge color="green"><Award size={10} /> {profile.gamesWon} wins</Badge>
              <Badge color="slate"><Gamepad2 size={10} /> {profile.totalGamesPlayed} games</Badge>
            </div>
            <p className="mt-3 text-xs text-slate-500">Click your avatar to change it</p>
          </div>

          {/* Win rate */}
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-slate-500">Win rate</div>
            <div className="text-4xl font-bold text-amber-400">{winRate}%</div>
          </div>
        </div>
      </Card>

      {/* Role stats */}
      <div>
        <h2 className="mb-3 text-xl font-bold">Role Statistics</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role, i) => {
            const stats = profile.roleStats[role];
            const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
            return (
              <Card
                key={role}
                className="transition hover:border-white/10 hover:-translate-y-1"
                style={{ animation: `bounceIn 0.4s ${i * 0.08}s cubic-bezier(0.34,1.56,0.64,1) both` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-3xl">{ROLE_INFO[role].icon}</div>
                  <div>
                    <div className={`font-bold ${ROLE_INFO[role].color}`}>{ROLE_INFO[role].name}</div>
                    <div className="text-xs text-slate-500">{stats.played} games</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
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
          <Card className="text-center py-12">
            <div className="text-4xl mb-3">🎮</div>
            <p className="text-slate-400">No matches yet. Jump in and play your first game!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {profile.matchHistory.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-center justify-between rounded-xl border p-4 transition hover:-translate-y-0.5 ${
                  m.won
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                }`}
                style={{ animation: `fadeIn 0.3s ${i * 0.05}s ease-out both` }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{ROLE_INFO[m.role].icon}</div>
                  <div>
                    <div className="font-medium">
                      {m.won ? "🏆 Victory" : "💀 Defeat"}
                      <span className="ml-2 text-slate-400 text-sm">as {ROLE_INFO[m.role].name}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(m.date).toLocaleDateString()} • {m.playersCount} players • {m.roundsPlayed} rounds
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${m.won ? "text-emerald-400" : "text-slate-500"}`}>
                    +{m.pointsEarned}
                  </div>
                  <div className="text-xs text-slate-500">pts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
