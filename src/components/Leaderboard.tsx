// Leaderboard page: top players by points
import { useEffect } from "react";
import { Trophy, Medal, TrendingUp, Crown } from "lucide-react";
import { Avatar, Card } from "./ui";
import { getLeaderboard, seedDemoLeaderboard, type LeaderboardEntry } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";

export function Leaderboard() {
  const { profile } = useAuth();
  const [list, setList] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    seedDemoLeaderboard();
    setList(getLeaderboard());
  }, []);

  const top3 = list.slice(0, 3);
  const myRank = list.findIndex((e) => e.id === profile?.id) + 1;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-3 text-4xl font-bold">
          <Trophy className="text-amber-400" size={36} />
          Leaderboard
        </h1>
        <p className="mt-2 text-slate-400">Top players ranked by total points earned</p>
        {myRank > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-800/50 bg-amber-950/20 px-4 py-1.5 text-sm text-amber-300">
            <Crown size={14} /> Your rank: #{myRank}
          </div>
        )}
      </div>

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* 2nd */}
          {top3[1] && <Podium entry={top3[1]} rank={2} height="h-48" />}
          {/* 1st */}
          {top3[0] && <Podium entry={top3[0]} rank={1} height="h-60" />}
          {/* 3rd */}
          {top3[2] && <Podium entry={top3[2]} rank={3} height="h-40" />}
        </div>
      )}

      {/* Rest of the leaderboard */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp size={18} />
          <h2 className="text-lg font-semibold">All Rankings</h2>
        </div>
        <div className="space-y-2">
          {list.map((entry, i) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between rounded-xl border p-3 transition ${
                entry.id === profile?.id
                  ? "border-red-800/60 bg-red-950/20"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold ${
                  i === 0 ? "bg-gradient-to-br from-amber-500 to-yellow-600 text-white" :
                  i === 1 ? "bg-gradient-to-br from-slate-400 to-slate-500 text-white" :
                  i === 2 ? "bg-gradient-to-br from-amber-700 to-amber-800 text-white" :
                  "bg-slate-800 text-slate-400"
                }`}>
                  {i + 1}
                </div>
                <Avatar name={entry.username} src={entry.avatar} size={40} />
                <div>
                  <div className="font-medium">
                    {entry.username}
                    {entry.id === profile?.id && (
                      <span className="ml-2 text-xs text-red-400">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {entry.gamesWon} wins / {entry.totalGamesPlayed} games
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-amber-400">{entry.totalPoints}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">points</div>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="py-8 text-center text-slate-500">
              No players yet. Be the first to claim the throne!
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Podium({ entry, rank, height }: { entry: LeaderboardEntry; rank: number; height: string }) {
  const colors = {
    1: {
      bg: "from-amber-500 to-yellow-600",
      ring: "ring-amber-400",
      icon: <Crown size={24} className="text-amber-300" />,
      label: "1st",
    },
    2: {
      bg: "from-slate-400 to-slate-500",
      ring: "ring-slate-300",
      icon: <Medal size={24} className="text-slate-200" />,
      label: "2nd",
    },
    3: {
      bg: "from-amber-700 to-amber-800",
      ring: "ring-amber-600",
      icon: <Medal size={24} className="text-amber-300" />,
      label: "3rd",
    },
  }[rank]!;

  return (
    <div className={`flex flex-col items-center justify-end ${height} rounded-2xl border border-slate-800 bg-gradient-to-t ${colors.bg} p-6 shadow-2xl`}>
      <div className="mb-3 text-4xl">{colors.icon}</div>
      <div className={`rounded-full bg-slate-900/60 p-1 ring-4 ${colors.ring}`}>
        <Avatar name={entry.username} src={entry.avatar} size={56} />
      </div>
      <div className="mt-3 font-bold text-white">{entry.username}</div>
      <div className="mt-1 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-amber-300">
        {entry.totalPoints} pts
      </div>
      <div className="mt-2 text-xs uppercase tracking-widest text-white/70">#{colors.label}</div>
    </div>
  );
}
