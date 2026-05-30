// Game entry point — uses Firebase engine when configured, demo mode otherwise
import { isFirebaseConfigured } from "../lib/firebase";
import { GameEngineProvider } from "../context/GameEngineContext";
import { useParams } from "react-router-dom";

// Firebase-connected game
function FirebaseGame() {
  const { code } = useParams<{ code: string }>();
  if (!code) return null;
  return <GameEngineProvider code={code}><GameInner /></GameEngineProvider>;
}

// Import GameInner lazily to avoid circular deps
function GameInner(): null { return null; }

export function Game() {
  // When Firebase is configured, use real-time engine
  if (isFirebaseConfigured) {
    const { code } = useParams<{ code: string }>();
    if (!code) return null;
    return (
      <GameEngineProvider code={code}>
        <FirebaseGameInner />
      </GameEngineProvider>
    );
  }
  // Otherwise use local demo mode
  const { DemoGame } = require("./DemoGame");
  return <DemoGame />;
}

// Firebase-connected game inner component
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Vote, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { useGameEngine } from "../context/GameEngineContext";
import { FloatingParticles, Confetti } from "./Effects";
import { sfx, isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { ROLE_INFO } from "../lib/types";
import type { Role, ChatMessage } from "../lib/types";

function FirebaseGameInner() {
  const navigate = useNavigate();
  const { user, updateUserStats } = useAuth();
  const { gameState, players, messages, phase, timer, round, isHost, myRole, amAlive, winner, submitAction, castVote, sendMessage: sendMsg } = useGameEngine();
  const [screen, setScreen] = useState(phase === "game-over" ? "game-over" : "role-reveal");
  const [chatInput, setChatInput] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [confetti, setConfetti] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const me = players.find((p: any) => p.id === user?.uid);

  useEffect(() => {
    if (phase === "game-over" && screen !== "game-over") {
      setScreen("game-over");
      const iWon = (winner === "mafia" && myRole === "mafia") || (winner === "town" && myRole !== "mafia");
      if (iWon) { sfx.win(); setConfetti(true); setTimeout(() => setConfetti(false), 3000); } else sfx.lose();
      if (me?.role) updateUserStats(me.role, iWon, iWon ? (me.role === "mafia" ? 100 : me.role === "police" || me.role === "doctor" ? 80 : 50) : 0, players.length, round);
    }
    if (phase === "night" && screen === "role-reveal") setScreen("game");
  }, [phase]);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  if (!user) { navigate("/auth"); return null; }
  if (!gameState && phase === "lobby") return <div className="flex min-h-[60vh] items-center justify-center"><Card className="text-center p-12"><div className="text-5xl mb-4 animate-float">🎭</div><h2 className="text-2xl font-bold">Waiting...</h2><p className="text-slate-400 mb-6">{isHost ? "Click Start to begin!" : "Host will start soon..."}</p></Card></div>;

  if (screen === "role-reveal" && myRole) return <RoleReveal role={myRole} onDone={() => setScreen("game")} />;
  if (screen === "game-over" && me) return <GameOver me={me} winner={winner!} round={round} confetti={confetti} onExit={() => navigate("/")} />;

  const isNight = phase === "night";
  const canChat = amAlive && (phase !== "night" || myRole === "mafia");
  const phaseLabel: Record<string, string> = { night: "Night", "day-discussion": "Discussion", "day-voting": "Voting" };
  const phaseTag: Record<string, string> = { night: "🤫 Shhh...", "day-discussion": "🗣️ Accuse!", "day-voting": "⚖️ Vote!" };

  return (
    <div className={`animate-fade-in ${isNight ? "bg-gradient-to-b from-indigo-950/20 to-transparent" : ""}`}>
      <Confetti fire={confetti} />
      <div className={`relative mb-6 overflow-hidden rounded-2xl border p-5 ${isNight ? "border-indigo-700/50 bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-950" : "border-amber-700/40 bg-gradient-to-r from-amber-900/40 via-orange-900/30"}`}>
        <FloatingParticles variant={isNight ? "night" : "day"} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-5xl ${isNight ? "animate-moon-glow" : "animate-float"}`}>{isNight ? "🌙" : "☀️"}</div>
            <div><div className="text-xs uppercase tracking-widest text-slate-400">Round {round}</div><h1 className="text-2xl font-bold">{phaseLabel[phase] || phase}</h1><div className="text-xs text-slate-400">{phaseTag[phase]}</div></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right"><div className="text-xs uppercase tracking-wide text-slate-400">Time</div><div className={`font-mono text-3xl font-bold ${timer <= 5 ? "text-red-400 animate-heartbeat" : ""}`}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</div></div>
            <button onClick={() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); }} className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10">{soundOn ? <Volume2 size={18} className="text-emerald-400" /> : <VolumeX size={18} className="text-slate-500" />}</button>
            <button onClick={() => setShowRole(v => !v)} className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10">{showRole ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </div>
        {showRole && myRole && (<div className="relative mt-4 animate-slide-up rounded-xl border border-white/5 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="text-3xl">{ROLE_INFO[myRole as Role].icon}</div><div><div className={`text-sm font-bold ${ROLE_INFO[myRole as Role].color}`}>You: {ROLE_INFO[myRole as Role].name}</div><div className="text-xs text-slate-400">{ROLE_INFO[myRole as Role].description}</div></div></div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {isNight && amAlive && myRole && myRole !== "citizen" && !gameState.nightActions[myRole === "mafia" ? "mafiaTarget" : myRole === "doctor" ? "doctorTarget" : "policeTarget"] && (
            <Card className={`border-2 ${myRole === "mafia" ? "border-red-800/60" : myRole === "doctor" ? "border-emerald-800/60" : "border-purple-800/60"}`}>
              <h3 className={`mb-4 text-lg font-bold ${ROLE_INFO[myRole as Role].color}`}>{myRole === "mafia" ? "🎭 Choose victim" : myRole === "doctor" ? "⚕️ Save" : "🔍 Investigate"}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{players.filter((p: any) => p.isAlive && (myRole === "mafia" ? p.id !== user!.uid : true)).map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedAction(p.id); }} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition hover-pop ${selectedAction === p.id ? "border-red-500 bg-red-950/40" : "border-white/5 bg-white/5"}`}><Avatar name={p.username} size={28} /><span>{p.username}</span>{selectedAction === p.id && <span className="ml-auto">🎯</span>}</button>
              ))}</div>
              <Button className="mt-4 w-full" onClick={() => { if (selectedAction) submitAction(myRole === "mafia" ? "kill" : myRole === "doctor" ? "save" : "investigate", selectedAction); setSelectedAction(null); }} disabled={!selectedAction}>Confirm</Button>
              {gameState.nightActions.policeResult && myRole === "police" && (<div className={`mt-3 rounded-lg border p-3 ${gameState.nightActions.policeResult.isMafia ? "border-red-700/60 bg-red-950/40" : "border-white/5"}`}><div className={`font-semibold ${gameState.nightActions.policeResult.isMafia ? "text-red-400" : "text-emerald-400"}`}>{players.find((p: any) => p.id === gameState.nightActions.policeResult.targetId)?.username} is {gameState.nightActions.policeResult.isMafia ? "" : "NOT "}Mafia</div></div>)}
            </Card>
          )}
          {phase === "day-voting" && amAlive && (<Card className="border-2 border-amber-800/50"><h3 className="mb-4 text-lg font-bold text-amber-300">🗳️ Vote</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{players.filter((p: any) => p.isAlive && p.id !== user!.uid).map((p: any) => { const c = gameState.votes.filter((v: any) => v.targetId === p.id).length; const mv = gameState.votes.find((v: any) => v.voterId === user!.uid)?.targetId; return (<button key={p.id} onClick={() => castVote(p.id)} className={`flex items-center justify-between rounded-lg border p-2 text-left text-sm transition hover-pop ${mv === p.id ? "border-amber-500 bg-amber-950/40" : "border-white/5 bg-white/5"}`}><div className="flex items-center gap-2"><Avatar name={p.username} size={28} /><span>{p.username}</span></div>{c > 0 && <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-bold text-amber-200">{c}</span>}</button>); })}</div></Card>)}
          {!amAlive && (<Card className="text-center"><div className="mb-2 text-5xl animate-float">👻</div><div className="text-lg font-semibold">Ghost mode 🍿</div></Card>)}
          <Card><h2 className="mb-4 text-lg font-semibold">👥 Suspects <span className="text-xs text-slate-500">({players.filter((p: any) => p.isAlive).length} alive)</span></h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{players.map((p: any) => { const vf = gameState.votes.filter((v: any) => v.targetId === p.id).length; return (<div key={p.id} className={`relative rounded-xl border p-3 transition ${p.isAlive ? "border-white/5 bg-white/5" : "border-red-900/30 bg-red-950/10 opacity-60 grayscale"} ${p.id === user!.uid ? "ring-2 ring-red-500/40" : ""}`}>{!p.isAlive && <div className="absolute right-2 top-2">💀</div>}<div className="flex items-center gap-2"><Avatar name={p.username} size={36} /><div><div className="text-sm font-medium">{p.username} {p.id === user!.uid && <span className="text-xs text-red-400">(you)</span>}</div><div className="text-xs text-slate-500">{!p.isAlive && p.role ? `was ${ROLE_INFO[p.role as Role]?.icon}` : p.isBot ? "🤖" : ""}</div></div></div>{phase === "day-voting" && vf > 0 && p.isAlive && <div className="mt-2 rounded-md bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-300"><Vote size={11} /> {vf}</div>}</div>); })}</div></Card>
        </div>
        <Card className="flex h-[600px] flex-col">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{isNight && myRole === "mafia" ? "🤫 Mafia" : isNight ? "🔇 Night" : "💬 Chat"}</h2>{!amAlive && <Badge color="red">💀</Badge>}</div>
          {canChat && <div className="flex flex-wrap gap-1 mb-2">{["👀","🤔","😱","🤥","😡","🙏","👆","💀","🤝","🃏"].map(e => (<button key={e} onClick={() => setChatInput(c => c + e)} className="rounded px-1.5 py-1 text-lg hover:bg-white/10 hover:scale-125">{e}</button>))}</div>}
          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">{messages.filter((m: ChatMessage) => m.type === "system" || m.type === "public" || (m.type === "mafia-chat" && (myRole === "mafia" || !amAlive))).map((m: ChatMessage) => (<ChatLine key={m.id} msg={m} isMine={m.userId === user!.uid} />))}</div>
          <div className="mt-2 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (canChat && (sendMsg(chatInput.trim()), setChatInput(""))) } placeholder="Type..." disabled={!canChat} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none disabled:opacity-50" /><Button size="sm" disabled={!canChat || !chatInput.trim()} onClick={() => { sendMsg(chatInput.trim()); setChatInput(""); }}><Send size={14} /></Button></div>
        </Card>
      </div>
    </div>
  );
}

function RoleReveal({ role, onDone }: { role: Role; onDone: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const info = ROLE_INFO[role];
  const hype: Record<Role, string> = { mafia: "😈 Cause chaos!", police: "🕵️ Last hope!", doctor: "💉 Save lives!", citizen: "🫣 Trust no one!" };
  useEffect(() => { const t = setTimeout(() => { setFlipped(true); sfx.reveal(); }, 1000); return () => clearTimeout(t); }, []);
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center">
      <FloatingParticles variant="night" />
      <div className="relative mb-6 text-center"><h2 className="text-3xl font-bold gradient-text">🎭 Your Role</h2></div>
      <div className={`relative h-80 w-56 rounded-2xl border-2 transition-all ${flipped ? "border-red-500/60 animate-pulse-glow" : "border-white/10 bg-white/5"}`}>
        {!flipped ? <div className="flex h-full items-center justify-center"><div className="text-7xl animate-float">🎴</div></div> : (
          <div className={`flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br ${role === "mafia" ? "from-red-900/60" : role === "police" ? "from-purple-900/60" : role === "doctor" ? "from-emerald-900/60" : "from-blue-900/60"} to-slate-900 animate-bounce-in p-6`}>
            <div className="text-8xl animate-wiggle">{info.icon}</div><div className={`text-3xl font-bold ${info.color}`}>{info.name}</div><div className="text-xs">{hype[role]}</div>
          </div>
        )}
      </div>
      {flipped && <Button className="mt-8" size="lg" onClick={onDone}>Play →</Button>}
    </div>
  );
}

function GameOver({ me, winner, round, confetti, onExit }: { me: any; winner: "mafia" | "town"; round: number; confetti: boolean; onExit: () => void }) {
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
  return (<div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}><Avatar name={msg.username} src={msg.avatar} size={28} /><div className={`max-w-[80%]`}><div className={`text-[11px] font-medium ${isMine ? "text-right" : ""} ${isMafia ? "text-red-400" : "text-slate-400"}`}>{msg.username}</div><div className={`rounded-xl px-3 py-2 text-sm ${isMafia ? "bg-red-950/60 border border-red-900/60 text-red-100" : isMine ? "bg-gradient-to-br from-red-600 to-orange-600 text-white" : "bg-white/5 text-slate-100"}`}>{msg.message}</div></div></div>);
}
