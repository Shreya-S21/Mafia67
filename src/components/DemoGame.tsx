// Demo game mode — runs entirely in browser with localStorage + AI bots
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, Vote, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { FloatingParticles, Confetti } from "./Effects";
import { sfx, isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { ROLE_INFO, type Role, type GameState, type ChatMessage, type Player, type NightActions } from "../lib/types";
import { botNightAction, botVote, resolveNight, resolveVotes, checkWinCondition, cryptoId, assignRoles } from "../lib/gameEngine";

type Screen = "role-reveal" | "game" | "game-over";

export function DemoGame() {
  const { code } = useParams<{ code: string }>();
  const { user, updateUserStats } = useAuth();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("role-reveal");
  const [state, setState] = useState<GameState | null>(() => {
    if (!code) return null;
    const raw = localStorage.getItem(`mafia.game.${code}`);
    if (raw) try { return JSON.parse(raw); } catch {}
    return null;
  });
  const [chatInput, setChatInput] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [confetti, setConfetti] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const myUid = user?.uid || "";
  const me = state?.players.find(p => p.id === myUid);
  const myRole = me?.role;
  const amAlive = !!me?.isAlive;
  const phase = state?.phase ?? "lobby";
  const timer = state?.timer ?? 0;
  const round = state?.round ?? 1;
  const winner = state?.winner;
  const isNight = phase === "night";
  const canChat = amAlive && (phase !== "night" || myRole === "mafia");
  const players = state?.players ?? [];
  const messages = state?.messages ?? [];

  // Init
  useEffect(() => {
    if (!code || !user || state) return;
    const raw = localStorage.getItem(`mafia.players.${code}`);
    if (!raw) { navigate("/"); return; }
    let p: Player[];
    try { p = JSON.parse(raw); } catch { navigate("/"); return; }
    const gs: GameState = { roomId: code, phase: "night", round: 1, players: assignRoles(p), nightActions: {}, votes: [], timer: 45, messages: [{ id: cryptoId(), userId: "system", username: "System", message: "🌙 Night 1 begins!", timestamp: Date.now(), type: "system" }] };
    setState(gs); sfx.night();
  }, [code, user, state, navigate]);

  // Persist
  useEffect(() => { if (state && code) localStorage.setItem(`mafia.game.${code}`, JSON.stringify(state)); }, [state, code]);

  // Timer
  useEffect(() => {
    if (!state || phase === "game-over" || phase === "lobby") return;
    const t = setInterval(() => {
      setState(prev => {
        if (!prev || prev.phase === "game-over" || prev.timer > 0) return prev;
        if (prev.phase === "night") {
          sfx.day();
          const { killed, saved, announcement } = resolveNight(prev);
          let up = prev.players.map(p => ({ ...p }));
          if (killed && !saved) { up = up.map(p => p.id === killed.id ? { ...p, isAlive: false } : p); sfx.death(); }
          if (saved) sfx.saved();
          const w = checkWinCondition(up);
          if (w) {
            const gs: GameState = { ...prev, phase: "game-over", players: up, timer: 0, winner: w, nightActions: {}, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: w === "mafia" ? "🎭 MAFIA WINS!" : "🏛️ TOWN WINS!", timestamp: Date.now(), type: "system" }] };
            setTimeout(() => setScreen("game-over"), 1500);
            return gs;
          }
          return { ...prev, phase: "day-discussion", players: up, timer: 60, nightActions: {}, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: announcement, timestamp: Date.now(), type: "system" }] };
        }
        if (prev.phase === "day-discussion") return { ...prev, phase: "day-voting", timer: 30, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: "⚖️ Voting!", timestamp: Date.now(), type: "system" }] };
        if (prev.phase === "day-voting") {
          const eid = resolveVotes(prev.votes);
          let up = prev.players.map(p => ({ ...p }));
          let ann = "";
          if (eid) { const el = up.find(p => p.id === eid); if (el) { up = up.map(p => p.id === el.id ? { ...p, isAlive: false } : p); ann = `🗳️ ${el.username} eliminated (${el.role})`; sfx.death(); } }
          else ann = "🗳️ Vote tied.";
          const w = checkWinCondition(up);
          if (w) {
            const gs: GameState = { ...prev, phase: "game-over", players: up, timer: 0, winner: w, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: ann, timestamp: Date.now(), type: "system" }] };
            setTimeout(() => setScreen("game-over"), 1500);
            return gs;
          }
          return { ...prev, phase: "night", round: prev.round + 1, players: up, votes: [], timer: 45, nightActions: {}, messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: ann, timestamp: Date.now(), type: "system" }, { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${prev.round + 1}`, timestamp: Date.now() + 100, type: "system" }] };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Game over
  useEffect(() => {
    if (!state || phase !== "game-over" || !me) return;
    const iWon = (winner === "mafia" && me.role === "mafia") || (winner === "town" && me.role !== "mafia");
    if (iWon) { sfx.win(); setConfetti(true); setTimeout(() => setConfetti(false), 3000); } else sfx.lose();
    if (me.role) updateUserStats(me.role, iWon, iWon ? (me.role === "mafia" ? 100 : me.role === "police" || me.role === "doctor" ? 80 : 50) : 0, players.length, round);
    localStorage.removeItem(`mafia.game.${code}`);
  }, [phase]);

  // Bot night actions
  useEffect(() => {
    if (phase !== "night") return;
    const bots = players.filter((p: Player) => p.isBot && p.isAlive && p.role && p.role !== "citizen");
    const timers = bots.map((bot, i) => setTimeout(() => {
      setState(prev => {
        if (!prev || prev.phase !== "night") return prev;
        const action = botNightAction(bot, prev);
        const na: NightActions = { ...prev.nightActions };
        if (typeof action === "object") {
          if (bot.role === "mafia" && action.mafiaTarget) na.mafiaTarget = action.mafiaTarget;
          if (bot.role === "doctor" && action.doctorTarget) na.doctorTarget = action.doctorTarget;
          if (bot.role === "police" && action.policeTarget) { const tgt = prev.players.find(p => p.id === action.policeTarget); if (tgt) { na.policeTarget = action.policeTarget; na.policeResult = { targetId: tgt.id, isMafia: tgt.role === "mafia" }; } }
        }
        return { ...prev, nightActions: na };
      });
    }, 2000 + i * 1800));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Bot voting
  useEffect(() => {
    if (phase !== "day-voting") return;
    const bots = players.filter((p: Player) => p.isBot && p.isAlive);
    const timers = bots.map((bot, i) => setTimeout(() => {
      setState(prev => {
        if (!prev || prev.phase !== "day-voting" || prev.votes.find(v => v.voterId === bot.id)) return prev;
        const target = botVote(bot, prev);
        return target ? { ...prev, votes: [...prev.votes, { voterId: bot.id, targetId: target }] } : prev;
      });
    }, 1500 + i * 1200));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Auto-scroll
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);
  useEffect(() => { if (phase === "night" && screen === "role-reveal") setScreen("game"); }, [phase]);

  function submitAction(_t: "kill" | "save" | "investigate", targetId: string) {
    sfx.select(); if (!state || !myRole) return;
    const na: NightActions = { ...state.nightActions };
    if (myRole === "mafia") na.mafiaTarget = targetId;
    else if (myRole === "doctor") na.doctorTarget = targetId;
    else if (myRole === "police") { na.policeTarget = targetId; const t = state.players.find(p => p.id === targetId); if (t) na.policeResult = { targetId, isMafia: t.role === "mafia" }; }
    setState({ ...state, nightActions: na });
  }

  function castVote(targetId: string) {
    sfx.vote(); if (!state || !amAlive || phase !== "day-voting") return;
    setState({ ...state, votes: [...state.votes.filter(v => v.voterId !== myUid), { voterId: myUid, targetId }] });
  }

  function sendMessage() {
    if (!chatInput.trim() || !canChat || !state) return;
    const msg: ChatMessage = { id: cryptoId(), userId: myUid, username: me?.username || "You", message: chatInput.trim(), type: phase === "night" ? "mafia-chat" : "public", timestamp: Date.now() };
    setState({ ...state, messages: [...state.messages, msg] });
    setChatInput("");
  }

  function toggleSound() { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); if (n) sfx.click(); }

  if (!user) { navigate("/auth"); return null; }
  if (!state) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400">Loading...</div>;

  const phaseLabel: Record<string, string> = { lobby: "Lobby", night: "Night", "day-discussion": "Day", "day-voting": "Voting", "game-over": "Done" };
  const phaseTag: Record<string, string> = { night: "🤫 Shhh...", "day-discussion": "🗣️ Accuse!", "day-voting": "⚖️ Vote!" };

  if (screen === "role-reveal" && myRole) return <RoleRevealScreen role={myRole} onContinue={() => setScreen("game")} />;
  if (screen === "game-over" && me) return <GameOverScreen state={state} me={me} winner={winner} onExit={() => navigate("/")} confetti={confetti} />;

  return (
    <div className={`animate-fade-in ${isNight ? "bg-gradient-to-b from-indigo-950/20 to-transparent" : ""}`}>
      <Confetti fire={confetti} />
      <div className={`relative mb-6 overflow-hidden rounded-2xl border p-5 ${isNight ? "border-indigo-700/50 bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-950" : "border-amber-700/40 bg-gradient-to-r from-amber-900/40 via-orange-900/30"}`}>
        <FloatingParticles variant={isNight ? "night" : "day"} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-5xl ${isNight ? "animate-moon-glow" : "animate-float"}`}>{isNight ? "🌙" : "☀️"}</div>
            <div><div className="text-xs uppercase tracking-widest text-slate-400">Round {round}</div><h1 className="text-2xl font-bold">{phaseLabel[phase]}</h1><div className="text-xs text-slate-400">{phaseTag[phase]}</div></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right"><div className="text-xs uppercase tracking-wide text-slate-400">Time</div><div className={`font-mono text-3xl font-bold ${timer <= 5 ? "text-red-400 animate-heartbeat" : ""}`}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</div></div>
            <button onClick={toggleSound} className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10">{soundOn ? <Volume2 size={18} className="text-emerald-400" /> : <VolumeX size={18} className="text-slate-500" />}</button>
            <button onClick={() => setShowRole(v => !v)} className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10">{showRole ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </div>
        {showRole && myRole && (<div className="relative mt-4 animate-slide-up rounded-xl border border-white/5 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="text-3xl">{ROLE_INFO[myRole].icon}</div><div><div className={`text-sm font-bold ${ROLE_INFO[myRole].color}`}>You: {ROLE_INFO[myRole].name}</div><div className="text-xs text-slate-400">{ROLE_INFO[myRole].description}</div></div></div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {isNight && amAlive && myRole && myRole !== "citizen" && !state.nightActions[myRole === "mafia" ? "mafiaTarget" : myRole === "doctor" ? "doctorTarget" : "policeTarget"] && (
            <Card className={`border-2 ${myRole === "mafia" ? "border-red-800/60" : myRole === "doctor" ? "border-emerald-800/60" : "border-purple-800/60"}`}>
              <h3 className={`mb-4 text-lg font-bold ${ROLE_INFO[myRole].color}`}>{myRole === "mafia" ? "🎭 Choose victim" : myRole === "doctor" ? "⚕️ Save someone" : "🔍 Investigate"}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{players.filter((p: Player) => p.isAlive && (myRole === "mafia" ? p.id !== myUid : true)).map((p: Player) => (
                <button key={p.id} onClick={() => { setSelectedAction(p.id); sfx.hover(); }} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition hover-pop ${selectedAction === p.id ? "border-red-500 bg-red-950/40" : "border-white/5 bg-white/5"}`}><Avatar name={p.username} size={28} /><span className="truncate">{p.username}</span>{selectedAction === p.id && <span className="ml-auto">🎯</span>}</button>
              ))}</div>
              <Button className="mt-4 w-full" onClick={() => { if (selectedAction) submitAction(myRole === "mafia" ? "kill" : myRole === "doctor" ? "save" : "investigate", selectedAction); setSelectedAction(null); }} disabled={!selectedAction}>Confirm</Button>
              {state.nightActions.policeResult && myRole === "police" && (<div className={`mt-3 rounded-lg border p-3 ${state.nightActions.policeResult.isMafia ? "border-red-700/60 bg-red-950/40" : "border-white/5"}`}><div className="text-xs text-slate-400">Result</div><div className={`mt-1 font-semibold ${state.nightActions.policeResult.isMafia ? "text-red-400" : "text-emerald-400"}`}>{players.find((p: Player) => p.id === state.nightActions.policeResult!.targetId)?.username} is {state.nightActions.policeResult.isMafia ? "" : "NOT "}Mafia</div></div>)}
            </Card>
          )}
          {phase === "day-voting" && amAlive && (
            <Card className="border-2 border-amber-800/50"><h3 className="mb-4 text-lg font-bold text-amber-300">🗳️ Vote</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{players.filter((p: Player) => p.isAlive && p.id !== myUid).map((p: Player) => {
                const count = state.votes.filter(v => v.targetId === p.id).length;
                const mv = state.votes.find(v => v.voterId === myUid)?.targetId;
                return (<button key={p.id} onClick={() => castVote(p.id)} className={`flex items-center justify-between rounded-lg border p-2 text-left text-sm transition hover-pop ${mv === p.id ? "border-amber-500 bg-amber-950/40" : "border-white/5 bg-white/5"}`}><div className="flex items-center gap-2"><Avatar name={p.username} size={28} /><span className="truncate">{p.username}</span></div>{count > 0 && <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-bold text-amber-200">{count}</span>}</button>);
              })}</div>
            </Card>
          )}
          {!amAlive && (<Card className="text-center"><div className="mb-2 text-5xl animate-float">👻</div><div className="text-lg font-semibold">You're a ghost! 🍿</div></Card>)}
          <Card>
            <h2 className="mb-4 text-lg font-semibold">👥 Suspects <span className="text-xs text-slate-500">({players.filter((p: Player) => p.isAlive).length} alive)</span></h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{players.map((p: Player) => {
              const vf = state.votes.filter(v => v.targetId === p.id).length;
              return (<div key={p.id} className={`relative rounded-xl border p-3 transition ${p.isAlive ? "border-white/5 bg-white/5" : "border-red-900/30 bg-red-950/10 opacity-60 grayscale"} ${p.id === myUid ? "ring-2 ring-red-500/40" : ""}`}>
                {!p.isAlive && <div className="absolute right-2 top-2">💀</div>}
                <div className="flex items-center gap-2"><Avatar name={p.username} size={36} /><div className="min-w-0"><div className="truncate text-sm font-medium">{p.username} {p.id === myUid && <span className="text-xs text-red-400">(you)</span>}</div><div className="text-xs text-slate-500">{!p.isAlive && p.role ? `was ${ROLE_INFO[p.role as Role]?.icon}` : p.isBot ? "🤖" : ""}</div></div></div>
                {phase === "day-voting" && vf > 0 && p.isAlive && (<div className="mt-2 rounded-md bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-300"><Vote size={11} /> {vf} vote{vf > 1 ? "s" : ""}</div>)}
              </div>);
            })}</div>
          </Card>
        </div>
        <Card className="flex h-[600px] flex-col">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{isNight && myRole === "mafia" ? "🤫 Mafia Chat" : isNight ? "🔇 Night" : "💬 Chat"}</h2>{!amAlive && <Badge color="red">💀</Badge>}</div>
          {canChat && (<div className="flex flex-wrap gap-1 mb-2">{["👀","🤔","😱","🤥","😡","🙏","👆","💀","🤝","🃏"].map(e => (<button key={e} onClick={() => setChatInput(c => c + e)} className="rounded px-1.5 py-1 text-lg hover:bg-white/10 hover:scale-125">{e}</button>))}</div>)}
          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">{messages.filter((m: ChatMessage) => m.type === "system" || m.type === "public" || (m.type === "mafia-chat" && (myRole === "mafia" || !amAlive))).map((m: ChatMessage) => (<ChatLine key={m.id} msg={m} isMine={m.userId === myUid} />))}</div>
          <div className="mt-2 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder={canChat ? "Type..." : "Can't chat"} disabled={!canChat} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none disabled:opacity-50" /><Button size="sm" onClick={sendMessage} disabled={!chatInput.trim() || !canChat}><Send size={14} /></Button></div>
        </Card>
      </div>
    </div>
  );
}

function RoleRevealScreen({ role, onContinue }: { role: Role; onContinue: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const info = ROLE_INFO[role];
  const hype: Record<Role, string> = { mafia: "Time to cause chaos 😈", police: "Town's last hope 🕵️", doctor: "Save lives! 💉", citizen: "Trust no one 🫣" };
  useEffect(() => { const t = setTimeout(() => { setFlipped(true); sfx.reveal(); }, 1000); return () => clearTimeout(t); }, []);
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden">
      <FloatingParticles variant="night" />
      <div className="relative mb-6 text-center"><h2 className="text-3xl font-bold gradient-text">🎭 Role Reveal 🎭</h2></div>
      <div className={`relative h-80 w-56 rounded-2xl border-2 transition-all duration-700 ${flipped ? "border-red-500/60 animate-pulse-glow" : "border-white/10 bg-white/5 hover:scale-105"}`}>
        {!flipped ? (<div className="flex h-full flex-col items-center justify-center"><div className="text-7xl animate-float">🎴</div><div className="text-xs text-slate-500 mt-2">Revealing...</div></div>) : (
          <div className={`flex h-full flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br ${role === "mafia" ? "from-red-900/60" : role === "police" ? "from-purple-900/60" : role === "doctor" ? "from-emerald-900/60" : "from-blue-900/60"} to-slate-900 animate-bounce-in p-6 text-center`}>
            <div className="text-8xl animate-wiggle">{info.icon}</div><div className={`text-3xl font-bold ${info.color}`}>{info.name}</div><div className="text-xs text-slate-300">{info.description}</div><div className="mt-1 rounded-full bg-black/30 px-3 py-1 text-xs">{hype[role]}</div>
          </div>
        )}
      </div>
      {flipped && <Button className="mt-8" size="lg" onClick={onContinue}>Let's play! →</Button>}
    </div>
  );
}

function GameOverScreen({ state, me, winner, onExit, confetti }: { state: GameState; me: Player; winner: "mafia" | "town"; onExit: () => void; confetti: boolean }) {
  const iWon = (winner === "mafia" && me.role === "mafia") || (winner === "town" && me.role !== "mafia");
  const role = me.role as Role;
  return (
    <div className="flex min-h-[70vh] items-center justify-center animate-fade-in">
      <Confetti fire={confetti} />
      <Card className="w-full max-w-2xl overflow-hidden p-0">
        <div className={`relative overflow-hidden p-8 text-center ${iWon ? "bg-gradient-to-br from-amber-900/40 to-orange-900/20" : "bg-gradient-to-br from-slate-900 to-red-950/30"}`}>
          {iWon && <FloatingParticles variant="celebrate" />}
          <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-6xl animate-bounce-in">{iWon ? "🏆" : "💀"}</div>
          <h1 className={`relative text-5xl font-bold ${iWon ? "gradient-text animate-heartbeat" : ""}`}>{iWon ? "VICTORY!" : "DEFEAT"}</h1>
          <div className="relative mt-2 text-2xl">{iWon ? "🎉🥳🎊" : "😵💔"}</div>
        </div>
        <div className="p-8">
          <div className="grid grid-cols-3 gap-4 text-center mb-6">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] uppercase text-slate-500">Role</div><div className="text-lg font-bold">{ROLE_INFO[role]?.icon} {ROLE_INFO[role]?.name}</div></div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] uppercase text-slate-500">Points</div><div className="text-lg font-bold text-amber-400">+{iWon ? (role === "mafia" ? 100 : role === "police" || role === "doctor" ? 80 : 50) : 0}</div></div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3"><div className="text-[10px] uppercase text-slate-500">Status</div><div className="text-lg font-bold">{me.isAlive ? "Survived ✓" : "Eliminated"}</div></div>
          </div>
          <h3 className="mb-3 text-sm font-semibold uppercase text-slate-400">Final Roles</h3>
          <div className="space-y-2 mb-6">{state.players.map((p: Player) => (
            <div key={p.id} className={`flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-3 ${!p.isAlive ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-3"><Avatar name={p.username} size={32} /><div className="font-medium">{p.username}</div></div>
              <div className="flex items-center gap-2"><span>{ROLE_INFO[p.role as Role]?.icon}</span><span className={`text-sm font-semibold ${ROLE_INFO[p.role as Role]?.color}`}>{ROLE_INFO[p.role as Role]?.name}</span></div>
            </div>
          ))}</div>
          <Button className="w-full" size="lg" onClick={onExit}>Back to Home</Button>
        </div>
      </Card>
    </div>
  );
}

function ChatLine({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  if (msg.type === "system") return <div className="flex justify-center"><div className="rounded-full bg-white/5 px-3 py-1.5 text-xs italic text-slate-300">{msg.message}</div></div>;
  const isMafia = msg.type === "mafia-chat";
  return (<div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}><Avatar name={msg.username} src={msg.avatar} size={28} /><div className={`max-w-[80%] ${isMine ? "items-end" : ""}`}><div className={`text-[11px] font-medium ${isMine ? "text-right" : ""} ${isMafia ? "text-red-400" : "text-slate-400"}`}>{msg.username}</div><div className={`rounded-xl px-3 py-2 text-sm ${isMafia ? "bg-red-950/60 border border-red-900/60 text-red-100" : isMine ? "bg-gradient-to-br from-red-600 to-orange-600 text-white" : "bg-white/5 text-slate-100"}`}>{msg.message}</div></div></div>);
}
