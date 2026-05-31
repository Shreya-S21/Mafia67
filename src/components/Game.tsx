// Game page — Firebase connected when keys set, local demo otherwise
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Send, Vote, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { FloatingParticles, Confetti } from "./Effects";
import { sfx, isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { ROLE_INFO } from "../lib/types";
import type { Role, ChatMessage, Player, GameState } from "../lib/types";
import { isFirebaseConfigured } from "../lib/firebase";
import { GameEngineProvider, useGameEngine } from "../context/GameEngineContext";
import { DemoGame } from "./DemoGame";
import { SELECTABLE_AVATARS } from "../lib/avatars";
import { saveProfile, loadProfile } from "../lib/storage";
import { updatePlayer, joinPlayer } from "../lib/db";
import { createBot, generateBotNames, cryptoId } from "../lib/gameEngine";

// ── Entry point ──────────────────────────────────────────────────────────────
export function Game() {
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (!code) return null;

  // WAIT for Firebase auth to fully resolve before rendering the engine.
  // This is the root fix for "waiting for host" — if we render with uid=""
  // then isHost is always false even for the creator.
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
    // uid is guaranteed non-empty here because auth has fully loaded
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

  // Phase transitions
  useEffect(() => {
    if (phase === "night" && screen === "role-reveal") {
      setScreen("game");
    }
    if (phase === "game-over" && screen !== "game-over") {
      setScreen("game-over");
      const iWon = (winner === "mafia" && myRole === "mafia") || (winner === "town" && myRole !== "mafia");
      if (iWon) { sfx.win(); setConfetti(true); setTimeout(() => setConfetti(false), 4000); }
      else sfx.lose();
      if (me?.role) {
        const pts = me.role === "mafia" ? 100 : me.role === "police" || me.role === "doctor" ? 80 : 50;
        updateUserStats(me.role, iWon, iWon ? pts : 0, players.length, round);
      }
    }
  }, [phase, winner]);

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (!user) { navigate("/auth"); return null; }

  // Game not started yet — waiting room with avatar picker
  if (phase === "lobby" || !gameState) {
    return (
      <WaitingRoom
        players={players}
        isHost={isHost}
        myUid={myUid}
        user={user}
        profile={profile}
        onStart={startGame}
        onSetProfile={setProfile}
        code={code}
      />
    );
  }

  // Role reveal screen
  if (screen === "role-reveal" && myRole) {
    return <RoleRevealScreen role={myRole} onContinue={() => setScreen("game")} />;
  }

  // Game over screen
  if (screen === "game-over" && me) {
    return (
      <GameOverScreen
        state={gameState}
        me={me}
        winner={winner!}
        round={round}
        confetti={confetti}
        onExit={() => navigate("/")}
      />
    );
  }

  const isNight = phase === "night";
  const canChat = amAlive && (phase !== "night" || myRole === "mafia");
  const phaseLabel: Record<string, string> = {
    night: "Night",
    "day-discussion": "Day — Discussion",
    "day-voting": "Day — Voting",
    "game-over": "Game Over",
  };
  const phaseTag: Record<string, string> = {
    night: "🤫 Shhh... evil is afoot",
    "day-discussion": "🗣️ Point fingers! Accuse!",
    "day-voting": "⚖️ Time to vote!",
  };
  const hasActed = myRole === "mafia" ? !!gameState.nightActions.mafiaTarget
    : myRole === "doctor" ? !!gameState.nightActions.doctorTarget
    : myRole === "police" ? !!gameState.nightActions.policeTarget
    : true;

  return (
    <div className={`animate-fade-in ${isNight ? "bg-gradient-to-b from-indigo-950/20 to-transparent" : ""}`}>
      <Confetti fire={confetti} />

      {/* Phase Banner */}
      <div className={`relative mb-6 overflow-hidden rounded-2xl border p-5 ${
        isNight
          ? "border-indigo-700/50 bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-950"
          : "border-amber-700/40 bg-gradient-to-r from-amber-900/40 via-orange-900/30 to-yellow-900/20"
      }`}>
        <FloatingParticles variant={isNight ? "night" : "day"} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-5xl ${isNight ? "animate-moon-glow" : "animate-float"}`}>
              {isNight ? "🌙" : "☀️"}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Round {round}</div>
              <h1 className="text-2xl font-bold">{phaseLabel[phase] ?? phase}</h1>
              <div className="text-xs text-slate-400">{phaseTag[phase]}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Time Left</div>
              <div className={`font-mono text-3xl font-bold ${timer <= 5 ? "text-red-400 animate-heartbeat" : timer < 10 ? "text-amber-400" : ""}`}>
                {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </div>
            </div>
            <button
              onClick={() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); }}
              className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10 transition"
            >
              {soundOn ? <Volume2 size={18} className="text-emerald-400" /> : <VolumeX size={18} className="text-slate-500" />}
            </button>
            <button
              onClick={() => { setShowRole(v => !v); sfx.click(); }}
              className="rounded-lg border border-white/5 bg-white/5 p-2 hover:bg-white/10 transition"
            >
              {showRole ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {showRole && myRole && (
          <div className="relative mt-4 animate-slide-up rounded-xl border border-white/5 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{ROLE_INFO[myRole as Role].icon}</div>
              <div>
                <div className={`text-sm font-bold ${ROLE_INFO[myRole as Role].color}`}>
                  You are the {ROLE_INFO[myRole as Role].name}
                </div>
                <div className="text-xs text-slate-400">{ROLE_INFO[myRole as Role].description}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">

          {/* Night Action Panel */}
          {isNight && amAlive && myRole && myRole !== "citizen" && !hasActed && (
            <Card className={`border-2 ${
              myRole === "mafia" ? "border-red-800/60"
              : myRole === "doctor" ? "border-emerald-800/60"
              : "border-purple-800/60"
            }`}>
              <h3 className={`mb-4 text-lg font-bold ${ROLE_INFO[myRole as Role].color}`}>
                {myRole === "mafia" ? "🎭 Choose your victim"
                  : myRole === "doctor" ? "⚕️ Choose who to save"
                  : "🔍 Choose who to investigate"}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {players
                  .filter(p => p.isAlive && (myRole === "mafia" ? p.id !== myUid : true))
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedAction(p.id); sfx.hover(); }}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition hover-pop ${
                        selectedAction === p.id
                          ? "border-red-500 bg-red-950/40 ring-2 ring-red-500/30"
                          : "border-white/5 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <Avatar name={p.username} src={p.avatar} uid={p.id} size={28} />
                      <span className="truncate">{p.username}</span>
                      {selectedAction === p.id && <span className="ml-auto">🎯</span>}
                    </button>
                  ))}
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() => {
                  if (!selectedAction) return;
                  submitAction(
                    myRole === "mafia" ? "kill" : myRole === "doctor" ? "save" : "investigate",
                    selectedAction
                  );
                  setSelectedAction(null);
                }}
                disabled={!selectedAction}
              >
                Confirm action
              </Button>

              {/* Police result */}
              {gameState.nightActions.policeResult && myRole === "police" && (
                <div className={`mt-3 rounded-lg border p-3 ${
                  gameState.nightActions.policeResult.isMafia
                    ? "border-red-700/60 bg-red-950/40"
                    : "border-emerald-700/60 bg-emerald-950/20"
                }`}>
                  <div className="text-xs text-slate-400 mb-1">🔍 Investigation result</div>
                  <div className={`font-semibold ${gameState.nightActions.policeResult.isMafia ? "text-red-400" : "text-emerald-400"}`}>
                    {players.find(p => p.id === gameState.nightActions.policeResult?.targetId)?.username} is{" "}
                    {gameState.nightActions.policeResult.isMafia ? "⚠️ MAFIA!" : "✅ NOT Mafia"}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Already acted at night */}
          {isNight && amAlive && myRole && myRole !== "citizen" && hasActed && (
            <Card className="border-emerald-800/40 text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-semibold text-emerald-400">Action submitted!</div>
              <div className="text-sm text-slate-500">Waiting for others...</div>
            </Card>
          )}

          {/* Citizen night */}
          {isNight && amAlive && myRole === "citizen" && (
            <Card className="border-slate-700/50 text-center py-6">
              <div className="text-3xl mb-2 animate-moon-glow">😴</div>
              <div className="font-semibold">You're a Citizen</div>
              <div className="text-sm text-slate-500">No night action. Sleep tight...</div>
            </Card>
          )}

          {/* Voting Panel */}
          {phase === "day-voting" && amAlive && (
            <Card className="border-2 border-amber-800/50">
              <h3 className="mb-4 text-lg font-bold text-amber-300">🗳️ Cast your vote</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {players.filter(p => p.isAlive && p.id !== myUid).map(p => {
                  const count = gameState.votes.filter(v => v.targetId === p.id).length;
                  const myVote = gameState.votes.find(v => v.voterId === myUid)?.targetId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => castVote(p.id)}
                      className={`flex items-center justify-between rounded-lg border p-2 text-left text-sm transition hover-pop ${
                        myVote === p.id
                          ? "border-amber-500 bg-amber-950/40 ring-2 ring-amber-500/30"
                          : "border-white/5 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={p.username} src={p.avatar} uid={p.id} size={28} />
                        <span className="truncate">{p.username}</span>
                      </div>
                      {count > 0 && (
                        <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-bold text-amber-200 animate-bounce-in">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Ghost */}
          {!amAlive && (
            <Card className="text-center py-6">
              <div className="mb-2 text-5xl animate-float">👻</div>
              <div className="text-lg font-semibold">You're a ghost!</div>
              <div className="text-sm text-slate-500">Grab some popcorn 🍿 and watch the chaos.</div>
            </Card>
          )}

          {/* Players grid */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              👥 The Suspects
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                {players.filter(p => p.isAlive).length} alive
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {players.map(p => {
                const votedFor = gameState.votes.filter(v => v.targetId === p.id).length;
                const isMe = p.id === myUid;
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-xl border p-3 transition ${
                      p.isAlive
                        ? "border-white/5 bg-white/5 hover:border-red-500/20"
                        : "border-red-900/30 bg-red-950/10 opacity-60 grayscale"
                    } ${isMe ? "ring-2 ring-red-500/40" : ""}`}
                  >
                    {!p.isAlive && <div className="absolute right-2 top-2 text-lg">💀</div>}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Avatar name={p.username} src={p.avatar} uid={p.id} size={36} />
                        {p.isAlive && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#05050a]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {p.username}
                          {isMe && <span className="ml-1 text-xs text-red-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {!p.isAlive && p.role
                            ? `was ${ROLE_INFO[p.role as Role]?.icon} ${p.role}`
                            : p.isBot ? "🤖 Bot" : "🎮 Player"}
                        </div>
                      </div>
                    </div>
                    {phase === "day-voting" && votedFor > 0 && p.isAlive && (
                      <div className="mt-2 flex items-center gap-1 rounded-md bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-300">
                        <Vote size={11} /> {votedFor} vote{votedFor > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Chat Panel */}
        <Card className="flex h-[600px] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isNight && myRole === "mafia" ? "🤫 Mafia Chat"
                : isNight ? "🔇 Chat (Night)"
                : "💬 Chat"}
            </h2>
            {!amAlive && <Badge color="red">👻 Spectating</Badge>}
          </div>

          {/* Quick emoji reactions */}
          {canChat && (
            <div className="flex flex-wrap gap-1 mb-2">
              {["👀","🤔","😱","🤥","😡","🙏","👆","💀","🤝","🎭"].map(e => (
                <button
                  key={e}
                  onClick={() => { setChatInput(c => c + e); sfx.hover(); }}
                  className="rounded-md px-1.5 py-1 text-lg transition hover:bg-white/10 hover:scale-125"
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages
              .filter(m =>
                m.type === "system" ||
                m.type === "public" ||
                (m.type === "mafia-chat" && (myRole === "mafia" || !amAlive))
              )
              .map(m => <ChatLine key={m.id} msg={m} isMine={m.userId === myUid} />)}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && canChat && (sendMsg(chatInput.trim()), setChatInput(""))}
              placeholder={
                !amAlive ? "👻 Ghosts can't talk..."
                : phase === "night" && myRole !== "mafia" ? "🤫 Shhh it's night..."
                : "Say something..."
              }
              disabled={!canChat}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-red-500/50 disabled:opacity-50"
            />
            <Button
              size="sm"
              onClick={() => { sendMsg(chatInput.trim()); setChatInput(""); }}
              disabled={!canChat || !chatInput.trim()}
            >
              <Send size={14} />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Role Reveal ───────────────────────────────────────────────────────────────
function RoleRevealScreen({ role, onContinue }: { role: string; onContinue: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const info = ROLE_INFO[role as Role];
  const hype: Record<string, string> = {
    mafia: "Time to cause some chaos 😈",
    police: "The town's last hope 🕵️",
    doctor: "Save lives, be a legend 💉",
    citizen: "Trust no one. Survive. 🫣",
  };
  useEffect(() => {
    const t = setTimeout(() => { setFlipped(true); sfx.reveal(); }, 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden">
      <FloatingParticles variant="night" />
      <div className="relative mb-6 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Your secret identity</div>
        <h2 className="mt-2 text-3xl font-bold gradient-text">🎭 Role Reveal 🎭</h2>
        <p className="mt-1 text-sm text-slate-400">Don't let anyone see your screen...</p>
      </div>

      <div className={`relative h-80 w-56 cursor-pointer rounded-2xl border-2 transition-all duration-700 ${
        flipped ? "border-red-500/60 animate-pulse-glow" : "border-white/10 bg-white/5 hover:scale-105"
      }`}>
        {!flipped ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-7xl animate-float">🎴</div>
            <div className="text-xs uppercase tracking-widest text-slate-500">Revealing...</div>
          </div>
        ) : (
          <div className={`flex h-full flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br ${
            role === "mafia" ? "from-red-900/80"
            : role === "police" ? "from-purple-900/80"
            : role === "doctor" ? "from-emerald-900/80"
            : "from-blue-900/80"
          } to-slate-900 animate-bounce-in p-6 text-center`}>
            <div className="text-8xl animate-wiggle">{info?.icon}</div>
            <div className={`text-3xl font-bold ${info?.color}`}>{info?.name}</div>
            <div className="text-xs text-slate-300">{info?.description}</div>
            <div className="mt-1 rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-white/90">
              {hype[role]}
            </div>
          </div>
        )}
      </div>

      {flipped && (
        <Button className="mt-8 animate-fade-in" size="lg" onClick={onContinue}>
          Let's play! →
        </Button>
      )}
    </div>
  );
}

// ── Game Over ────────────────────────────────────────────────────────────────
function GameOverScreen({
  state, me, winner, round, confetti, onExit,
}: {
  state: GameState; me: Player; winner: "mafia" | "town";
  round: number; confetti: boolean; onExit: () => void;
}) {
  const iWon = (winner === "mafia" && me.role === "mafia") || (winner === "town" && me.role !== "mafia");
  const role = me.role as Role;
  const pts = iWon ? (role === "mafia" ? 100 : role === "police" || role === "doctor" ? 80 : 50) : 0;

  return (
    <div className="flex min-h-[70vh] items-center justify-center animate-fade-in">
      <Confetti fire={confetti} />
      <Card className="w-full max-w-2xl overflow-hidden p-0">
        <div className={`relative overflow-hidden p-8 text-center ${
          iWon
            ? "bg-gradient-to-br from-amber-900/40 via-yellow-900/20 to-orange-900/20"
            : "bg-gradient-to-br from-slate-900 to-red-950/30"
        }`}>
          {iWon && <FloatingParticles variant="celebrate" />}
          <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-6xl shadow-xl animate-bounce-in">
            {iWon ? "🏆" : "💀"}
          </div>
          <h1 className={`relative text-5xl font-bold ${iWon ? "gradient-text animate-heartbeat" : "text-slate-200"}`}>
            {iWon ? "VICTORY!" : "DEFEAT"}
          </h1>
          <div className="relative mt-2 text-2xl">{iWon ? "🎉 🥳 🎊" : "😵 💔"}</div>
          <p className="relative mt-2 text-slate-400">
            The {winner === "mafia" ? "Mafia" : "Town"} won after {round} round{round > 1 ? "s" : ""}.
          </p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="text-[10px] uppercase text-slate-500">Your Role</div>
              <div className="mt-1 text-lg font-bold">{ROLE_INFO[role]?.icon} {ROLE_INFO[role]?.name}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="text-[10px] uppercase text-slate-500">Points</div>
              <div className="mt-1 text-lg font-bold text-amber-400">+{pts}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="text-[10px] uppercase text-slate-500">Status</div>
              <div className="mt-1 text-lg font-bold">{me.isAlive ? "Survived ✓" : "Eliminated"}</div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Final Roles</h3>
            <div className="space-y-2">
              {state.players.map(p => (
                <div key={p.id} className={`flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-3 ${!p.isAlive ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.username} src={p.avatar} uid={p.id} size={32} />
                    <div>
                      <div className="text-sm font-medium">{p.username}</div>
                      {!p.isAlive && <div className="text-xs text-slate-500">Eliminated</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{ROLE_INFO[p.role as Role]?.icon}</span>
                    <span className={`text-sm font-semibold ${ROLE_INFO[p.role as Role]?.color}`}>
                      {ROLE_INFO[p.role as Role]?.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button className="mt-6 w-full" size="lg" onClick={onExit}>Back to Home</Button>
        </div>
      </Card>
    </div>
  );
}

// ── Chat line ────────────────────────────────────────────────────────────────
// ── Waiting Room (before game starts) ────────────────────────────────────────
function WaitingRoom({
  players, isHost, myUid, user, profile, onStart, onSetProfile, code,
}: {
  players: Player[]; isHost: boolean; myUid: string;
  user: any; profile: any; onStart: () => void; onSetProfile: (p: any) => void; code: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const currentAvatar = profile?.avatar || "";
  const myName = profile?.username || user?.username || "You";

  // Add bots to fill the room to 6 (host only, when short on players)
  async function onAddBots() {
    const needed = Math.max(0, 6 - players.length);
    const names = generateBotNames(needed);
    const existingNames = new Set(players.map(p => p.username));
    for (const name of names) {
      let finalName = name;
      let n = 2;
      while (existingNames.has(finalName)) finalName = `${name}${n++}`;
      existingNames.add(finalName);
      const bot = createBot(`bot_${code}_${cryptoId().slice(0, 6)}`, finalName);
      await joinPlayer(code, { ...bot, isAlive: true, connected: true });
    }
  }

  async function pickAvatar(emoji: string) {
    setShowPicker(false);
    // Save locally
    const prof = profile || loadProfile(myUid);
    if (prof) {
      const updated = { ...prof, avatar: emoji };
      saveProfile(updated);
      onSetProfile(updated);
    }
    // Update in Firebase so other players see it
    if (myUid && code) await updatePlayer(code, myUid, { avatar: emoji });
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center animate-fade-in">
      <div className="w-full max-w-xl space-y-4">

        {/* Status card */}
        <Card className={`text-center p-8 ${isHost ? "border-red-500/20" : ""}`}>
          <div className="text-6xl mb-3 animate-float">🎭</div>
          <h2 className="text-2xl font-bold mb-1">
            {isHost ? "You're the Host!" : "Get ready..."}
          </h2>
          <p className="text-slate-400 text-sm mb-5">
            {isHost
              ? players.length < 6
                ? `${players.length} player${players.length !== 1 ? "s" : ""} joined. Need ${6 - players.length} more (or add bots).`
                : `${players.length} players ready. Hit Start when everyone's in!`
              : "The host will start the game shortly. Pick your avatar below!"}
          </p>

          {/* Players row */}
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {players.map(p => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <div className={`rounded-xl p-0.5 ${p.id === myUid ? "ring-2 ring-red-500/60" : ""}`}>
                  <Avatar name={p.username} src={p.avatar} uid={p.id} size={44} />
                </div>
                <div className="text-[11px] text-slate-400 max-w-[52px] truncate text-center">
                  {p.id === myUid ? "you" : p.username}
                </div>
              </div>
            ))}
          </div>

          {isHost ? (
            <div className="space-y-2">
              {players.length >= 6 ? (
                <Button size="lg" className="w-full" onClick={onStart}>
                  🚀 Start Game!
                </Button>
              ) : (
                <Button size="lg" className="w-full" onClick={onAddBots}>
                  🤖 Add {6 - players.length} bot{6 - players.length !== 1 ? "s" : ""} &amp; get ready
                </Button>
              )}
              <p className="text-xs text-slate-500">
                You're the host. {players.length < 6 ? "Add bots or invite friends to reach 6 players." : "Start whenever you're ready!"}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Waiting for host to start...
            </div>
          )}
        </Card>

        {/* Avatar picker card — always visible so player can set before game */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm">Your Avatar</h3>
              <p className="text-xs text-slate-500">This is what others will see in-game</p>
            </div>
            <div
              className="cursor-pointer hover:scale-110 transition"
              onClick={() => setShowPicker(v => !v)}
            >
              <Avatar name={myName} src={currentAvatar || undefined} uid={myUid} size={52} ring="ring-2 ring-red-500/40" />
            </div>
          </div>

          {/* Always-open emoji grid */}
          <div className="grid grid-cols-8 gap-1.5 rounded-xl border border-white/5 bg-white/5 p-3">
            {SELECTABLE_AVATARS.map(emoji => (
              <button
                key={emoji}
                onClick={() => pickAvatar(emoji)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-2xl transition hover:scale-125 ${
                  currentAvatar === emoji
                    ? "bg-red-500/30 ring-2 ring-red-500/60 scale-110"
                    : "hover:bg-white/10"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {currentAvatar && (
            <div className="mt-2 text-center text-xs text-emerald-400">
              ✓ Playing as {currentAvatar} {myName}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}

function ChatLine({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  if (msg.type === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-white/5 px-3 py-1.5 text-xs italic text-slate-300">{msg.message}</div>
      </div>
    );
  }
  const isMafia = msg.type === "mafia-chat";
  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <Avatar name={msg.username} src={msg.avatar} uid={msg.userId} size={28} />
      <div className={`max-w-[80%] ${isMine ? "items-end" : ""}`}>
        <div className={`text-[11px] font-medium mb-0.5 ${isMine ? "text-right" : ""} ${isMafia ? "text-red-400" : "text-slate-400"}`}>
          {msg.username} {isMafia && <span className="text-[9px]">(mafia)</span>}
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm ${
          isMafia
            ? "bg-red-950/60 border border-red-900/60 text-red-100"
            : isMine
              ? "bg-gradient-to-br from-red-600 to-orange-600 text-white"
              : "bg-white/5 text-slate-100"
        }`}>
          {msg.message}
        </div>
      </div>
    </div>
  );
}
