// Game page — Firebase connected when keys set, local demo otherwise
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Send, Vote, Eye, EyeOff, Volume2, VolumeX, Skull, Target } from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { FloatingParticles, Confetti } from "./Effects";
import { sfx, isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { ROLE_INFO } from "../lib/types";
import type { Role, ChatMessage, Player, GameState } from "../lib/types";
import { isFirebaseConfigured } from "../lib/firebase";
import { GameEngineProvider, useGameEngine } from "../context/GameEngineContext";
import { DemoGame } from "./DemoGame";

// ── Entry point ──────────────────────────────────────────────────────────────
export function Game() {
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (!code) return null;
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-5xl animate-float">🎭</div>
          <div className="text-slate-400 text-sm">Loading your session...</div>
        </div>
      </div>
    );
  }
  if (!user) { navigate("/auth"); return null; }

  if (isFirebaseConfigured) {
    return (
      <GameEngineProvider code={code} myUid={user.uid}>
        <FirebaseGameUI code={code} />
      </GameEngineProvider>
    );
  }
  return <DemoGame />;
}

// ── Firebase-connected game UI ───────────────────────────────────────────────
function FirebaseGameUI({ code }: { code: string }) {
  const navigate = useNavigate();
  const { user, profile, setProfile, updateUserStats } = useAuth();
  const engine = useGameEngine();
  const { gameState, players, messages, phase, timer, round, myUid, isHost, myRole, amAlive, winner, submitAction, castVote, sendMessage: sendMsg, startGame } = engine;

  const [screen, setScreen] = useState<"role-reveal" | "game" | "game-over">("role-reveal");
  const [chatInput, setChatInput] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [confetti, setConfetti] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const me = players.find(p => p.id === myUid);

  useEffect(() => {
    if (phase === "night" && screen === "role-reveal") setScreen("game");
    if (phase === "game-over" && screen !== "game-over") {
      setScreen("game-over");
      const iWon = (winner === "mafia" && myRole === "mafia") || (winner === "town" && myRole !== "mafia");
      if (iWon) { sfx.win(); setConfetti(true); setTimeout(() => setConfetti(false), 4000); } else sfx.lose();
      if (me?.role) {
        const pts = me.role === "mafia" ? 100 : me.role === "police" || me.role === "doctor" ? 80 : 50;
        updateUserStats(me.role, iWon, iWon ? pts : 0, players.length, round);
      }
    }
  }, [phase, winner]);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);
  if (!user) { navigate("/auth"); return null; }

  if (phase === "lobby" || !gameState) {
    return (
      <WaitingRoom players={players} isHost={isHost} myUid={myUid} user={user} profile={profile} onStart={startGame} onSetProfile={setProfile} code={code} />
    );
  }

  if (screen === "role-reveal" && myRole) return <DramaticRoleReveal role={myRole} onContinue={() => setScreen("game")} />;
  if (screen === "game-over" && me) return <GameOverScreen state={gameState} me={me} winner={winner!} round={round} confetti={confetti} onExit={() => navigate("/")} />;

  const isNight = phase === "night";
  const canChat = amAlive && (phase !== "night" || myRole === "mafia");
  const phaseLabel: Record<string, string> = { night: "Night", "day-discussion": "Day — Discussion", "day-voting": "Day — Voting", "game-over": "Game Over" };
  const phaseTag: Record<string, string> = { night: "🤫 Shhh... evil is afoot", "day-discussion": "🗣️ Point fingers! Accuse!", "day-voting": "⚖️ TIME TO VOTE!" };
  const hasActed = myRole === "mafia" ? !!gameState.nightActions.mafiaTarget : myRole === "doctor" ? !!gameState.nightActions.doctorTarget : myRole === "police" ? !!gameState.nightActions.policeTarget : true;

  return (
    <div className={`animate-fade-in ${isNight ? "bg-gradient-to-b from-indigo-950/40 to-transparent" : "bg-gradient-to-b from-amber-950/20 to-transparent"}`}>
      <Confetti fire={confetti} />

      {/* Phase Banner */}
      <div className={`relative mb-6 overflow-hidden rounded-3xl border p-6 shadow-2xl ${isNight ? "border-indigo-500/30 bg-gradient-to-r from-indigo-950/90 via-purple-950/80 to-slate-950" : phase === "day-voting" ? "border-red-500/50 bg-gradient-to-r from-red-950/80 via-orange-950/60 to-red-950/80 animate-pulse-slow" : "border-amber-700/40 bg-gradient-to-r from-amber-900/40 via-orange-900/30 to-yellow-900/20"}`}>
        <FloatingParticles variant={isNight ? "night" : "day"} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-6xl ${isNight ? "animate-moon-glow" : "animate-float"}`}>{isNight ? "🌙" : phase === "day-voting" ? "⚖️" : "☀️"}</div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Round {round}</div>
              <h1 className="text-3xl font-bold">{phaseLabel[phase] ?? phase}</h1>
              <div className="text-sm text-slate-300">{phaseTag[phase]}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Time Left</div>
              <div className={`font-mono text-4xl font-bold ${timer <= 10 ? "text-red-500 animate-heartbeat" : timer < 20 ? "text-amber-400" : "text-white"}`}>
                {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </div>
            </div>
            <button onClick={() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); }} className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition">
              {soundOn ? <Volume2 size={20} className="text-emerald-400" /> : <VolumeX size={20} className="text-slate-500" />}
            </button>
            <button onClick={() => { setShowRole(v => !v); sfx.click(); }} className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition">
              {showRole ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        {showRole && myRole && (
          <div className="relative mt-4 animate-slide-up rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{ROLE_INFO[myRole as Role].icon}</div>
              <div>
                <div className={`text-lg font-bold ${ROLE_INFO[myRole as Role].color}`}>You are the {ROLE_INFO[myRole as Role].name}</div>
                <div className="text-sm text-slate-300">{ROLE_INFO[myRole as Role].description}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          
          {/* FIX: Huge Voting UI */}
          {phase === "day-voting" && amAlive && (
            <Card className="border-4 border-red-500/50 bg-red-950/20 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse-slow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-red-400 flex items-center gap-2"><Skull size={24} /> CAST YOUR VOTE</h3>
                <div className="text-sm text-red-300 font-mono">Time is running out!</div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {players.filter(p => p.isAlive && p.id !== myUid).map(p => {
                  const count = gameState.votes.filter(v => v.targetId === p.id).length;
                  const myVote = gameState.votes.find(v => v.voterId === myUid)?.targetId;
                  return (
                    <button key={p.id} onClick={() => castVote(p.id)} className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition hover:scale-105 ${myVote === p.id ? "border-red-500 bg-red-500/20 ring-4 ring-red-500/30" : "border-white/10 bg-white/5 hover:border-red-500/50"}`}>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.username} src={p.avatar} uid={p.id} size={36} />
                        <span className="font-semibold">{p.username}</span>
                      </div>
                      {count > 0 && <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white animate-bounce">{count} votes</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Night Action Panel */}
          {isNight && amAlive && myRole && myRole !== "citizen" && !hasActed && (
            <Card className={`border-2 ${myRole === "mafia" ? "border-red-800/60 bg-red-950/20" : myRole === "doctor" ? "border-emerald-800/60 bg-emerald-950/20" : "border-purple-800/60 bg-purple-950/20"}`}>
              <h3 className={`mb-4 text-xl font-bold ${ROLE_INFO[myRole as Role].color}`}>
                {myRole === "mafia" ? "🎭 Choose your victim" : myRole === "doctor" ? "⚕️ Choose who to save" : "🔍 Choose who to investigate"}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {players.filter(p => p.isAlive && (myRole === "mafia" ? p.id !== myUid : true)).map(p => (
                  <button key={p.id} onClick={() => { setSelectedAction(p.id); sfx.hover(); }} className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition hover-pop ${selectedAction === p.id ? "border-red-500 bg-red-950/40 ring-2 ring-red-500/30" : "border-white/5 bg-white/5 hover:border-white/20"}`}>
                    <Avatar name={p.username} src={p.avatar} uid={p.id} size={28} />
                    <span className="truncate">{p.username}</span>
                    {selectedAction === p.id && <span className="ml-auto">🎯</span>}
                  </button>
                ))}
              </div>
              <Button className="mt-4 w-full" onClick={() => { if (selectedAction) submitAction(myRole === "mafia" ? "kill" : myRole === "doctor" ? "save" : "investigate", selectedAction); setSelectedAction(null); }} disabled={!selectedAction}>Confirm action</Button>
              {gameState.nightActions.policeResult && myRole === "police" && (
                <div className={`mt-3 rounded-lg border p-3 ${gameState.nightActions.policeResult.isMafia ? "border-red-700/60 bg-red-950/40" : "border-emerald-700/60 bg-emerald-950/20"}`}>
                  <div className="text-xs text-slate-400 mb-1">🔍 Investigation result</div>
                  <div className={`font-semibold ${gameState.nightActions.policeResult.isMafia ? "text-red-400" : "text-emerald-400"}`}>
                    {players.find(p => p.id === gameState.nightActions.policeResult?.targetId)?.username} is {gameState.nightActions.policeResult.isMafia ? "⚠️ MAFIA!" : "✅ NOT Mafia"}
                  </div>
                </div>
              )}
            </Card>
          )}

          {isNight && amAlive && myRole && myRole !== "citizen" && hasActed && (
            <Card className="border-emerald-800/40 text-center py-8 bg-emerald-950/10">
              <div className="text-4xl mb-2 animate-bounce">✅</div>
              <div className="font-semibold text-emerald-400 text-lg">Action submitted!</div>
              <div className="text-sm text-slate-500">Waiting for others to wake up...</div>
            </Card>
          )}

          {isNight && amAlive && myRole === "citizen" && (
            <Card className="border-slate-700/50 text-center py-8 bg-slate-900/50">
              <div className="text-5xl mb-2 animate-moon-glow">😴</div>
              <div className="font-semibold text-lg">You're a Citizen</div>
              <div className="text-sm text-slate-500">No night action. Sleep tight...</div>
            </Card>
          )}

          {!amAlive && (
            <Card className="text-center py-8 border-red-900/30 bg-red-950/10">
              <div className="mb-2 text-6xl animate-float">👻</div>
              <div className="text-xl font-semibold">You're a ghost!</div>
              <div className="text-sm text-slate-500">Grab some popcorn 🍿 and watch the chaos.</div>
            </Card>
          )}

          {/* Players grid */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">👥 The Suspects <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{players.filter(p => p.isAlive).length} alive</span></h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {players.map(p => {
                const votedFor = gameState.votes.filter(v => v.targetId === p.id).length;
                const isMe = p.id === myUid;
                return (
                  <div key={p.id} className={`relative rounded-xl border p-3 transition ${p.isAlive ? "border-white/5 bg-white/5 hover:border-red-500/20" : "border-red-900/30 bg-red-950/10 opacity-60 grayscale"} ${isMe ? "ring-2 ring-red-500/40" : ""}`}>
                    {!p.isAlive && <div className="absolute right-2 top-2 text-lg">💀</div>}
                    <div className="flex items-center gap-2">
                      <div className="relative"><Avatar name={p.username} src={p.avatar} uid={p.id} size={36} />{p.isAlive && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#05050a]" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.username} {isMe && <span className="ml-1 text-xs text-red-400">(you)</span>}</div>
                        <div className="text-xs text-slate-500">{!p.isAlive && p.role ? `was ${ROLE_INFO[p.role as Role]?.icon} ${p.role}` : p.isBot ? "🤖 Bot" : "🎮"}</div>
                      </div>
                    </div>
                    {phase === "day-voting" && votedFor > 0 && p.isAlive && (<div className="mt-2 flex items-center gap-1 rounded-md bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-300"><Vote size={11} /> {votedFor} vote{votedFor > 1 ? "s" : ""}</div>)}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Chat Panel */}
        <Card className="flex h-[600px] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isNight && myRole === "mafia" ? "🤫 Mafia Chat" : isNight ? "🔇 Chat (Night)" : "💬 Chat"}</h2>
            {!amAlive && <Badge color="red">👻 Spectating</Badge>}
          </div>
          {canChat && (
            <div className="flex flex-wrap gap-1 mb-2">
              {["👀","🤔","😱","🤥","😡","🙏","👆","💀","🤝","🎭"].map(e => (
                <button key={e} onClick={() => { setChatInput(c => c + e); sfx.hover(); }} className="rounded-md px-1.5 py-1 text-lg transition hover:bg-white/10 hover:scale-125">{e}</button>
              ))}
            </div>
          )}
          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.filter(m => m.type === "system" || m.type === "public" || (m.type === "mafia-chat" && (myRole === "mafia" || !amAlive))).map(m => <ChatLine key={m.id} msg={m} isMine={m.userId === myUid} />)}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && canChat && (sendMsg(chatInput.trim()), setChatInput(""))} placeholder={canChat ? "Say something..." : "Can't chat"} disabled={!canChat} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-red-500/50 disabled:opacity-50" />
            <Button size="sm" onClick={() => { sendMsg(chatInput.trim()); setChatInput(""); }} disabled={!canChat || !chatInput.trim()}><Send size={14} /></Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── DRAMATIC ROLE REVEAL ─────────────────────────────────────────────────────
function DramaticRoleReveal({ role, onContinue }: { role: string; onContinue: () => void }) {
  const [step, setStep] = useState(0);
  const info = ROLE_INFO[role as Role];
  
  useEffect(() => {
    const t1 = setTimeout(() => { setStep(1); sfx.night(); }, 2500); // Town sleeps
    const t2 = setTimeout(() => { setStep(2); sfx.reveal(); }, 5000); // Reveal
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden">
      <FloatingParticles variant="night" />
      
      {step === 0 && (
        <div className="text-center animate-fade-in space-y-4">
          <div className="text-8xl animate-moon-glow mb-4">🌙</div>
          <h2 className="text-3xl font-bold text-slate-300 tracking-widest uppercase">The town falls asleep...</h2>
          <p className="text-slate-500">Close your eyes. The Mafia is watching.</p>
        </div>
      )}

      {step === 1 && (
        <div className="text-center animate-fade-in space-y-4">
          <div className="text-8xl animate-pulse text-red-600 mb-4">👁️</div>
          <h2 className="text-3xl font-bold text-red-500 tracking-widest uppercase animate-heartbeat">The Mafia wakes up...</h2>
          <p className="text-red-400/70">They choose their victim.</p>
        </div>
      )}

      {step === 2 && (
        <div className="text-center animate-bounce-in space-y-6 p-8 max-w-md w-full">
          <div className={`relative mx-auto flex h-32 w-32 items-center justify-center rounded-full border-4 shadow-2xl ${role === 'mafia' ? 'border-red-600 bg-red-950/50 shadow-red-900/50' : role === 'police' ? 'border-purple-600 bg-purple-950/50 shadow-purple-900/50' : role === 'doctor' ? 'border-emerald-600 bg-emerald-950/50 shadow-emerald-900/50' : 'border-blue-600 bg-blue-950/50 shadow-blue-900/50'}`}>
            <div className="text-7xl animate-wiggle">{info?.icon}</div>
          </div>
          <div>
            <h2 className={`text-5xl font-bold ${info?.color} mb-2`}>{info?.name}</h2>
            <p className="text-slate-300 text-lg">{info?.description}</p>
          </div>
          <div className="pt-4">
            <Button size="lg" className="w-full text-lg py-6" onClick={onContinue}>
              I understand my role →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Waiting Room ──────────────────────────────────────────────────────────────
function WaitingRoom({ players, isHost, myUid, user, profile, onStart, onSetProfile, code }: { players: Player[]; isHost: boolean; myUid: string; user: any; profile: any; onStart: () => void; onSetProfile: (p: any) => void; code: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center animate-fade-in">
      <Card className="text-center p-12 max-w-md w-full border-red-500/20">
        <div className="text-6xl mb-4 animate-float">🎭</div>
        <h2 className="text-2xl font-bold mb-2">{isHost ? "You're the Host!" : "Get ready..."}</h2>
        <p className="text-slate-400 text-sm mb-6">{isHost ? `${players.length} players ready. Hit Start!` : "Waiting for host to start..."}</p>
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {players.map(p => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar name={p.username} src={p.avatar} uid={p.id} size={44} ring={p.id === myUid ? "ring-2 ring-red-500" : ""} />
              <div className="text-[11px] text-slate-400 max-w-[52px] truncate">{p.id === myUid ? "you" : p.username}</div>
            </div>
          ))}
        </div>
        {isHost ? (
          <Button size="lg" className="w-full" onClick={onStart} disabled={players.length < 6}>
            🚀 Start Game {players.length < 6 ? `(${6 - players.length} more needed)` : ""}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Waiting for host...
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Game Over ────────────────────────────────────────────────────────────────
function GameOverScreen({ state, me, winner, round, confetti, onExit }: { state: GameState; me: Player; winner: "mafia" | "town"; round: number; confetti: boolean; onExit: () => void }) {
  const iWon = (winner === "mafia" && me.role === "mafia") || (winner === "town" && me.role !== "mafia");
  return (
    <div className="flex min-h-[70vh] items-center justify-center animate-fade-in">
      <Confetti fire={confetti} />
      <Card className="w-full max-w-xl overflow-hidden p-0 text-center">
        <div className={`p-8 ${iWon ? "bg-gradient-to-br from-amber-900/40 to-orange-900/20" : "bg-gradient-to-br from-slate-900 to-red-950/30"}`}>
          {iWon && <FloatingParticles variant="celebrate" />}
          <div className="mx-auto mb-4 text-6xl animate-bounce-in">{iWon ? "🏆" : "💀"}</div>
          <h1 className={`text-5xl font-bold ${iWon ? "gradient-text animate-heartbeat" : ""}`}>{iWon ? "VICTORY!" : "DEFEAT"}</h1>
          <p className="mt-2 text-slate-400">The {winner === "mafia" ? "Mafia" : "Town"} won ({round} rounds)</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] text-slate-500">Role</div><div className="text-lg font-bold">{ROLE_INFO[me.role as Role]?.icon}</div></div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] text-slate-500">Points</div><div className="text-lg font-bold text-amber-400">+{iWon ? 80 : 0}</div></div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] text-slate-500">Status</div><div className="text-lg font-bold">{me.isAlive ? "✓" : "💀"}</div></div>
          </div>
          <Button className="w-full" size="lg" onClick={onExit}>Home</Button>
        </div>
      </Card>
    </div>
  );
}

function ChatLine({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  if (msg.type === "system") return <div className="flex justify-center"><div className="rounded-full bg-white/5 px-3 py-1.5 text-xs italic text-slate-300">{msg.message}</div></div>;
  const isMafia = msg.type === "mafia-chat";
  return (<div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}><Avatar name={msg.username} src={msg.avatar} uid={msg.userId} size={28} /><div className={`max-w-[80%]`}><div className={`text-[11px] font-medium ${isMine ? "text-right" : ""} ${isMafia ? "text-red-400" : "text-slate-400"}`}>{msg.username}</div><div className={`rounded-xl px-3 py-2 text-sm ${isMafia ? "bg-red-950/60 border border-red-900/60 text-red-100" : isMine ? "bg-gradient-to-br from-red-600 to-orange-600 text-white" : "bg-white/5 text-slate-100"}`}>{msg.message}</div></div></div>);
}