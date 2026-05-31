// Landing / Home page
// - Unauthenticated: Full-screen animated hero with floating role cards
// - Authenticated: Personalized animated dashboard
import { useState, useEffect, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, Plus, LogIn, Lock, Globe, Trophy, Shield, Moon, Sun, Play, ArrowRight, Clock, Zap } from "lucide-react";
import { Button, Card, Input, Modal, Badge, Avatar } from "./ui";
import { useAuth } from "../context/AuthContext";
import { getLeaderboard, seedDemoLeaderboard, type LeaderboardEntry } from "../lib/storage";
import { AmbientBlobs, FloatingParticles } from "./Effects";
import { sfx } from "../lib/sound";
import type { UserProfile } from "../lib/types";

interface PublicRoom {
  code: string;
  name: string;
  players: number;
  isPrivate: boolean;
  createdAt: number;
}

export function Landing() {
  const { user, profile } = useAuth();

  if (user && profile) {
    return <UserDashboard user={user} profile={profile} />;
  }

  return <MarketingLanding />;
}

// ── User Dashboard ──
function UserDashboard({ user, profile }: { user: { uid: string; username: string; avatar?: string | null }; profile: UserProfile }) {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    seedDemoLeaderboard();
    setLeaderboard(getLeaderboard().slice(0, 5));
    const rooms: PublicRoom[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("mafia.room.")) {
        try {
          const room = JSON.parse(localStorage.getItem(key)!);
          const playersRaw = localStorage.getItem(`mafia.players.${room.code}`);
          const count = playersRaw ? JSON.parse(playersRaw).length : 0;
          if (room.status !== "finished") {
            rooms.push({ code: room.code, name: room.name, players: count, isPrivate: room.isPrivate, createdAt: room.createdAt });
          }
        } catch {}
      }
    }
    setPublicRooms(rooms.sort((a, b) => b.createdAt - a.createdAt).slice(0, 6));
  }, []);

  const winRate = profile.totalGamesPlayed > 0
    ? Math.round((profile.gamesWon / profile.totalGamesPlayed) * 100)
    : 0;

  return (
    <div className="animate-fade-in space-y-8">
      <AmbientBlobs variant="default" />

      {/* Welcome header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-r from-red-950/30 via-transparent to-purple-950/30 p-6 sm:p-8">
        <FloatingParticles variant="default" count={10} />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="animate-float">
              <Avatar name={profile.username} src={profile.avatar} uid={user.uid} size={64} ring="ring-4 ring-red-500/30" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">
                Welcome back,{" "}
                <span className="gradient-text">{profile.username.split(" ")[0]}</span>
                <span className="animate-pulse"> ✨</span>
              </h1>
              <p className="text-slate-400">Ready to deceive the town tonight?</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="lg" onClick={() => setShowCreate(true)} className="shadow-red-500/20">
              <Plus size={18} /> New Game
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setShowJoin(true)}>
              <LogIn size={18} /> Join Room
            </Button>
          </div>
        </div>
      </div>

      {/* Quick stats with staggered animation */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Trophy className="text-amber-400" />} label="Total Points" value={profile.totalPoints} delay={0} shimmer />
        <StatCard icon={<Shield className="text-emerald-400" />} label="Games Won" value={profile.gamesWon} delay={100} />
        <StatCard icon={<Play className="text-blue-400" />} label="Games Played" value={profile.totalGamesPlayed} delay={200} />
        <StatCard icon={<Clock className="text-purple-400" />} label="Win Rate" value={`${winRate}%`} delay={300} />
      </div>

      {/* Quick actions + Public rooms */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Zap className="text-amber-400" size={18} /> Quick Play
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickAction icon={<Plus size={22} />} title="New Room" desc="Host a game" onClick={() => { sfx.click(); setShowCreate(true); }} />
            <QuickAction icon={<LogIn size={22} />} title="Join" desc="Enter room code" onClick={() => { sfx.click(); setShowJoin(true); }} />
            <QuickAction icon={<Trophy size={22} />} title="Leaderboard" desc="Top players" onClick={() => { sfx.click(); navigate("/leaderboard"); }} />
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">🏠 Active Rooms</h2>
            <Badge color="cyan">Live</Badge>
          </div>
          {publicRooms.length > 0 ? (
            <div className="space-y-2">
              {publicRooms.map((room, i) => (
                <button
                  key={room.code}
                  onClick={() => { sfx.click(); navigate(`/lobby/${room.code}`); }}
                  className="group flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 text-left transition hover:border-red-500/30 hover:bg-white/10"
                  style={{ animation: `slideInRight 0.4s ${i * 0.08}s ease-out both` }}
                >
                  <div>
                    <div className="font-medium">{room.name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      {room.isPrivate ? <Lock size={11} /> : <Globe size={11} />}
                      {room.code} • {room.players} players
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-600 transition group-hover:text-red-400 group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/5 py-8 text-center text-sm text-slate-500">
              <div className="text-3xl mb-2">🏚️</div>
              No rooms right now. Be the first!
            </div>
          )}
        </Card>
      </div>

      {/* Leaderboard preview + Recent matches */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">🏆 Top Players</h2>
            <Link to="/leaderboard" className="text-xs text-red-400 hover:underline">Full →</Link>
          </div>
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition hover:bg-white/10"
                style={{ animation: `fadeIn 0.4s ${index * 0.1}s ease-out both` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-amber-400">
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                  </div>
                  <Avatar name={entry.username} src={entry.avatar} uid={entry.id} size={32} />
                  <div className="font-medium">{entry.username}</div>
                </div>
                <div className="font-mono text-sm font-bold text-amber-400">{entry.totalPoints}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">📜 Recent</h2>
          {profile.matchHistory.length > 0 ? (
            <div className="space-y-2 text-sm">
              {profile.matchHistory.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${m.won ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}
                  style={{ animation: `slideInLeft 0.4s ${i * 0.1}s ease-out both` }}
                >
                  <div>
                    <span className="font-medium">{m.won ? "🏆 Victory" : "💀 Defeat"}</span>
                    <span className="ml-2 text-slate-400">as {m.role}</span>
                  </div>
                  <div className="font-mono text-xs font-bold text-amber-400">+{m.pointsEarned}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/5 py-8 text-center text-sm text-slate-500">
              <div className="text-3xl mb-2">🎮</div>
              Play your first game!
            </div>
          )}
          <Link to="/profile" className="mt-4 inline-block text-xs text-red-400 hover:underline">Full profile →</Link>
        </Card>
      </div>

      <CreateRoomModal hostId={user.uid} open={showCreate} onClose={() => setShowCreate(false)} onCreated={(code) => navigate(`/lobby/${code}`)} />
      <JoinRoomModal open={showJoin} onClose={() => setShowJoin(false)} onJoined={(code) => navigate(`/lobby/${code}`)} />
    </div>
  );
}

function StatCard({ icon, label, value, delay = 0, shimmer }: { icon: ReactNode; label: string; value: string | number; delay?: number; shimmer?: boolean }) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5 transition hover:border-red-500/20 hover:bg-white/10"
      style={{ animation: `bounceIn 0.5s ${delay}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
    >
      {shimmer && <div className="absolute inset-0 shimmer-bg" />}
      <div className="relative">
        <div className="mb-2 text-slate-400 group-hover:scale-110 transition-transform">{icon}</div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <div className="text-xs uppercase tracking-widest text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start rounded-xl border border-white/5 bg-white/5 p-4 text-left transition hover:border-red-500/30 hover:bg-white/10 hover:-translate-y-1"
    >
      <div className="mb-3 rounded-xl bg-white/5 p-2 text-red-400 transition group-hover:bg-red-500/20 group-hover:scale-110">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-slate-500">{desc}</div>
    </button>
  );
}

// ── Marketing Landing ──
function MarketingLanding() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div className="animate-fade-in">
      <AmbientBlobs variant="default" />

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl border border-white/5 p-8 sm:p-12"
        style={{
          background: `radial-gradient(ellipse at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(239,68,68,0.08) 0%, transparent 50%), linear-gradient(135deg, rgba(17,17,24,0.9), rgba(17,17,24,0.6))`,
        }}
      >
        <FloatingParticles variant="default" count={20} />

        <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <Badge color="red" className="mb-4">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 mr-1" />
              Live multiplayer
            </Badge>
            <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
              <span className="gradient-text" style={{ animation: "glow-pulse 3s ease-in-out infinite" }}>Mafia67</span>
              <br />
              <span className="text-slate-100">The game of lies.</span>
            </h1>
            <div className="mt-1 text-sm text-slate-500 font-medium tracking-widest uppercase">Where trust goes to die.</div>
            <p className="mt-4 max-w-lg text-slate-400">
              A real-time social deduction game. Bluff your way through the night,
              vote out the guilty by day, and survive to tell the tale.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => { sfx.click(); navigate("/auth"); }}>
                <Zap size={18} /> Play Now
              </Button>
              <Button size="lg" variant="secondary" onClick={() => { sfx.click(); setShowJoin(true); }}>
                <LogIn size={18} /> Join Room
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-xs text-slate-500">
              {[
                [<Moon size={12} />, "Night & Day"],
                [<Shield size={12} />, "4 Unique Roles"],
                [<Trophy size={12} />, "Ranked Points"],
                [<Users size={12} />, "6–12 Players"],
              ].map(([icon, label], i) => (
                <div key={i} className="flex items-center gap-1.5" style={{ animation: `fadeIn 0.5s ${i * 0.15}s ease-out both` }}>
                  {icon} {label}
                </div>
              ))}
            </div>
          </div>

          {/* Floating role cards */}
          <div className="relative h-72 sm:h-80">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {[
                { emoji: "🎭", name: "MAFIA", color: "text-red-300", border: "border-red-800/50", bg: "from-red-900/80 to-slate-900", rot: "-12deg", delay: "0s" },
                { emoji: "🔍", name: "DETECTIVE", color: "text-purple-300", border: "border-purple-800/50", bg: "from-purple-900/80 to-slate-900", rot: "0deg", delay: "0.15s" },
                { emoji: "⚕️", name: "DOCTOR", color: "text-emerald-300", border: "border-emerald-800/50", bg: "from-emerald-900/80 to-slate-900", rot: "12deg", delay: "0.3s" },
              ].map((card, i) => (
                <div
                  key={i}
                  className={`absolute h-44 w-30 rounded-xl border ${card.border} bg-gradient-to-br ${card.bg} p-3 shadow-2xl hover:scale-110 transition-transform duration-300 cursor-pointer`}
                  style={{
                    position: "absolute",
                    left: i === 0 ? "-96px" : i === 1 ? "-56px" : "-32px",
                    top: `${i === 0 ? "16px" : i === 1 ? "0px" : "16px"}`,
                    width: "112px",
                    transform: `rotate(${card.rot})`,
                    animation: `fadeIn 0.8s ${card.delay} ease-out both`,
                  }}
                >
                  <div className="text-4xl">{card.emoji}</div>
                  <div className={`mt-2 text-xs font-bold ${card.color}`}>{card.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How to play */}
      <section className="mt-10">
        <h2 className="mb-6 text-2xl font-bold">How to play</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Moon className="text-indigo-400" size={22} />, title: "Night Falls", body: "Mafia strikes, Doctor protects, Detective investigates." },
            { icon: <Sun className="text-amber-400" size={22} />, title: "Day Rises", body: "Discuss, debate, discover who's lying." },
            { icon: <Users className="text-emerald-400" size={22} />, title: "Cast Votes", body: "The town votes as one. The accused is revealed." },
            { icon: <Trophy className="text-yellow-400" size={22} />, title: "Earn Points", body: "Win games, survive rounds, climb the leaderboard." },
          ].map((f, i) => (
            <Card key={i} className="group transition hover:-translate-y-2" style={{ animation: `slideUp 0.6s ${i * 0.12}s ease-out both` }}>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 group-hover:bg-red-500/20 transition-colors">{f.icon}</div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="mt-12">
        <h2 className="mb-6 text-2xl font-bold">Roles</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { emoji: "🎭", name: "Mafia", color: "from-red-600/15 to-red-900/5", border: "border-red-800/30", desc: "Eliminate town members at night. Lie by day." },
            { emoji: "🔍", name: "Detective", color: "from-purple-600/15 to-purple-900/5", border: "border-purple-800/30", desc: "Investigate one player each night. Guide the town." },
            { emoji: "⚕️", name: "Doctor", color: "from-emerald-600/15 to-emerald-900/5", border: "border-emerald-800/30", desc: "Save one player each night. Be the town's shield." },
            { emoji: "👤", name: "Citizen", color: "from-blue-600/15 to-blue-900/5", border: "border-blue-800/30", desc: "Your voice and vote are your only weapons." },
          ].map((r, i) => (
            <div
              key={i}
              className={`group rounded-2xl border ${r.border} bg-gradient-to-br ${r.color} p-5 transition hover:scale-[1.03] hover:-translate-y-1`}
              style={{ animation: `slideUp 0.6s ${i * 0.12}s ease-out both` }}
            >
              <div className="text-5xl group-hover:animate-wiggle transition-all">{r.emoji}</div>
              <h3 className="mt-3 text-lg font-bold">{r.name}</h3>
              <p className="mt-1 text-sm text-slate-300">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <CreateRoomModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={(code) => navigate(`/lobby/${code}`)} />
      <JoinRoomModal open={showJoin} onClose={() => setShowJoin(false)} onJoined={(code) => navigate(`/lobby/${code}`)} />
    </div>
  );
}

// ── Modals ──
function CreateRoomModal({ hostId, open, onClose, onCreated }: { hostId?: string; open: boolean; onClose: () => void; onCreated: (code: string) => void }) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  function handleCreate() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem(`mafia.room.${code}`, JSON.stringify({ code, name: name || "Mafia67 Room", isPrivate, password: isPrivate ? password : undefined, createdAt: Date.now() }));
    if (hostId) localStorage.setItem(`mafia.createdBy.${code}`, hostId);
    onCreated(code);
  }
  return (
    <Modal open={open} onClose={onClose} title="Create Room">
      <div className="space-y-4">
        <Input label="Room name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Godfather's Den" autoFocus />
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4 accent-red-500" />
          {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
          <span>{isPrivate ? "Private (password)" : "Public room"}</span>
        </label>
        {isPrivate && <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate}><Plus size={14} /> Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function JoinRoomModal({ open, onClose, onJoined }: { open: boolean; onClose: () => void; onJoined: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { setError("Code must be 4+ characters"); return; }
    const rk = `mafia.room.${c}`;
    if (!localStorage.getItem(rk)) localStorage.setItem(rk, JSON.stringify({ code: c, name: `Room ${c}`, isPrivate: false, createdAt: Date.now() }));
    onJoined(c);
  }
  return (
    <Modal open={open} onClose={onClose} title="Join Room">
      <div className="space-y-4">
        <Input label="Room code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }} placeholder="ABC123" error={error} maxLength={8} autoFocus />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleJoin}><LogIn size={14} /> Join</Button>
        </div>
      </div>
    </Modal>
  );
}
