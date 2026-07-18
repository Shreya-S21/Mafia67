// Game engine — clean rewrite with proper multiplayer sync
// Timer approach: host stores phaseEndTime in Firebase, all players compute remaining locally
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  saveGameState, getRoom, onPlayersChanged, onGameStateChanged,
  sendChatMessage, onNewMessage, updateRoomStatus, updatePlayer,
  db, ref, dbUpdate, dbGet,
} from "../lib/db";
import type { GameStateData } from "../lib/db";
import {
  botNightAction, botVote, resolveNight, resolveVotes,
  checkWinCondition, cryptoId, assignRoles,
} from "../lib/gameEngine";
import { sfx } from "../lib/sound";
import type { Player, ChatMessage, GameState, GamePhase, NightActions } from "../lib/types";

// Phase durations in seconds
const PHASE_DURATION: Record<string, number> = { night: 45, "day-discussion": 60, "day-voting": 45 };

interface GameEngineValue {
  gameState: GameState | null;
  players: Player[];
  messages: ChatMessage[];
  phase: GamePhase;
  timer: number;
  round: number;
  myUid: string;
  isHost: boolean;
  myRole: Player["role"];
  amAlive: boolean;
  winner: "mafia" | "town" | undefined;
  policeResult: { targetId: string; isMafia: boolean } | null;
  hasActed: boolean;
  startGame: () => Promise<void>;
  beginNight: () => Promise<void>;
  submitAction: (type: "kill" | "save" | "investigate", targetId: string) => Promise<void>;
  castVote: (targetId: string) => Promise<void>;
  sendMessage: (msg: string) => Promise<void>;
}

const Ctx = createContext<GameEngineValue | null>(null);

export function GameEngineProvider({ code, myUid, children }: { code: string; myUid: string; children: ReactNode }) {
  // ── State ────────────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomHostId, setRoomHostId] = useState("");
  const [policeResult, setPoliceResult] = useState<{ targetId: string; isMafia: boolean } | null>(null);
  const [timer, setTimer] = useState(0);
  const [phaseEndTime, setPhaseEndTime] = useState(0); // unix ms when current phase ends
  const [hasActed, setHasActed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const advancingRef = useRef(false);
  const msgIdsRef = useRef(new Set<string>());

  // ── Derived ──────────────────────────────────────────────────────────────
  const humanPlayers = players.filter(p => !p.isBot);
  const isHost = myUid !== "" && (
    roomHostId === myUid ||
    players.some(p => p.id === myUid && p.isHost) ||
    (humanPlayers.length === 1 && humanPlayers[0]?.id === myUid)
  );
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const me = players.find(p => p.id === myUid);
  const gsPlayers = gameState?.players ?? [];
  const myGsPlayer = gsPlayers.find(p => p.id === myUid);
  const myRole = myGsPlayer?.role ?? me?.role;
  const amAlive = myGsPlayer?.isAlive ?? true;
  const phase = gameState?.phase ?? "lobby";
  const round = gameState?.round ?? 1;
  const winner = gameState?.winner;

  // ── Room host ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code || !myUid) return;
    getRoom(code).then(room => { if (room) setRoomHostId(room.hostId); });
  }, [code, myUid]);

  // ── Real-time player listener ────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onPlayersChanged(code, setPlayers);
  }, [code]);

  // ── Real-time game state listener (ALL players sync from Firebase) ──────
  useEffect(() => {
    if (!code) return;
    return onGameStateChanged(code, (gs: GameStateData | null) => {
      if (!gs) return;
      // Store phaseEndTime for local countdown
      if (gs.startedAt && gs.timer) {
        setPhaseEndTime(gs.startedAt + gs.timer * 1000);
      }
      setGameState(prev => {
        const basePlayers = prev?.players.length ? prev.players : players;
        return {
          roomId: code, phase: gs.phase, round: gs.round,
          players: basePlayers,
          nightActions: gs.nightActions ?? {},
          votes: gs.votes ?? [],
          timer: gs.timer ?? 0,
          lastEliminated: gs.lastEliminated,
          lastSaved: gs.lastSaved,
          winner: gs.winner,
          messages: prev?.messages ?? [],
        };
      });
    });
  }, [code, players]);

  // ── Real-time messages (deduplicated) ────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onNewMessage(code, msg => {
      if (msgIdsRef.current.has(msg.id)) return;
      msgIdsRef.current.add(msg.id);
      setMessages(prev => [...prev, msg]);
      if (msg.userId !== myUid && msg.type !== "system") sfx.message();
    });
  }, [code, myUid]);

  // ── Sync players into gameState + host migration ─────────────────────────
  useEffect(() => {
    if (!players.length) return;
    setGameState(prev => {
      if (!prev) return prev;
      if (!prev.players.length) return { ...prev, players };
      const currentHost = players.find(p => p.isHost);
      if (!currentHost && myUid) {
        const meAlive = players.find(p => p.id === myUid && p.isAlive);
        if (meAlive) updatePlayer(code, myUid, { isHost: true }).catch(() => {});
      }
      const merged = prev.players.map(gp => {
        const live = players.find(p => p.id === gp.id);
        return live ? { ...gp, username: live.username, avatar: live.avatar, isHost: live.isHost } : gp;
      });
      return { ...prev, players: merged };
    });
  }, [players, myUid, code]);

  // ── Reset state on new phase ─────────────────────────────────────────────
  useEffect(() => {
    if (phase === "night") { setPoliceResult(null); setHasActed(false); }
    if (phase === "day-voting") setHasActed(false);
  }, [phase, round]);

  // ── LOCAL countdown timer (everyone computes from phaseEndTime) ──────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!phaseEndTime || phase === "lobby" || phase === "role-reveal" || phase === "game-over") {
      setTimer(0);
      return;
    }
    // Tick every 500ms for responsiveness
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((phaseEndTime - Date.now()) / 1000));
      setTimer(remaining);
      // Host advances phase when timer hits 0
      if (remaining === 0 && isHostRef.current && !advancingRef.current) {
        setGameState(prev => { if (prev) advancePhase(prev); return prev; });
      }
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phaseEndTime, phase]);

  useEffect(() => { if (timer > 0 && timer <= 5) sfx.countdown(); }, [timer]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function clearBotTimers() { botTimerRef.current.forEach(clearTimeout); botTimerRef.current = []; }

  // Persist game state — stores phaseEndTime as startedAt+timer so all clients can compute countdown
  async function persistState(gs: Partial<GameState> & { phase: GamePhase; timer: number }) {
    const now = Date.now();
    await saveGameState(code, {
      phase: gs.phase, round: gs.round ?? round, timer: gs.timer,
      nightActions: gs.nightActions ?? {},
      votes: gs.votes ?? [],
      lastEliminated: gs.lastEliminated,
      lastSaved: gs.lastSaved,
      winner: gs.winner,
      startedAt: now, // clients use: phaseEndTime = startedAt + timer*1000
    });
  }

  // Atomic write to a single night action field
  async function writeNightAction(field: string, value: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/nightActions`), { [field]: value });
  }

  // Atomic write to per-player vote
  async function writeVote(voterId: string, targetId: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/voteMap`), { [voterId]: targetId });
  }

  // Read all votes
  async function readVotes(): Promise<{ voterId: string; targetId: string }[]> {
    if (!db) return [];
    const snap = await dbGet(ref(db, `rooms/${code}/gameState/voteMap`));
    if (!snap.exists()) return [];
    const map = snap.val() as Record<string, string>;
    return Object.entries(map).map(([voterId, targetId]) => ({ voterId, targetId }));
  }

  // Read night actions from Firebase (not local — gets ALL players' actions)
  async function readNightActions(): Promise<NightActions> {
    if (!db) return {};
    const snap = await dbGet(ref(db, `rooms/${code}/gameState/nightActions`));
    return snap.exists() ? snap.val() : {};
  }

  function scheduleBotNightActions(gamePlayers: Player[]) {
    clearBotTimers();
    gamePlayers.filter(p => p.isBot && p.isAlive && p.role && p.role !== "citizen").forEach((bot, i) => {
      const t = setTimeout(async () => {
        const gs = gameState;
        if (!gs || gs.phase !== "night") return;
        const action = botNightAction(bot, gs);
        if (typeof action === "object") {
          if (bot.role === "mafia" && action.mafiaTarget) await writeNightAction("mafiaTarget", action.mafiaTarget);
          if (bot.role === "doctor" && action.doctorTarget) await writeNightAction("doctorTarget", action.doctorTarget);
          if (bot.role === "police" && action.policeTarget) await writeNightAction("policeTarget", action.policeTarget);
        }
      }, 3000 + i * 2000);
      botTimerRef.current.push(t);
    });
  }

  // ── Phase advancement (HOST ONLY) ────────────────────────────────────────
  const advancePhase = useCallback(async (prev: GameState) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      if (prev.phase === "night") {
        sfx.day();
        const na = await readNightActions();
        const withActions = { ...prev, nightActions: na };
        const { killed, saved, announcement } = resolveNight(withActions);
        let up = prev.players.map(p => ({ ...p }));
        if (killed && !saved) {
          up = up.map(p => p.id === killed.id ? { ...p, isAlive: false } : p);
          sfx.death();
          await updatePlayer(code, killed.id, { isAlive: false });
        }
        if (saved) sfx.saved();
        const w = checkWinCondition(up);
        if (w) {
          await persistState({ phase: "game-over", round: prev.round, timer: 0, players: up, winner: w, nightActions: {}, votes: [] });
          await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: w === "mafia" ? "🎭 THE MAFIA WINS!" : "🏛️ THE TOWN WINS!", type: "system" });
          await updateRoomStatus(code, "finished");
          return;
        }
        await persistState({ phase: "day-discussion", round: prev.round, timer: PHASE_DURATION["day-discussion"], players: up, nightActions: {}, votes: [], lastEliminated: killed?.id, lastSaved: saved });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: announcement, type: "system" });
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { voteMap: null, nightActions: {} });

      } else if (prev.phase === "day-discussion") {
        await persistState({ phase: "day-voting", round: prev.round, timer: PHASE_DURATION["day-voting"], votes: [] });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "⚖️ VOTING PHASE! Choose who to eliminate.", type: "system" });
        // Bot votes
        prev.players.filter(p => p.isBot && p.isAlive).forEach((bot, i) => {
          const t = setTimeout(async () => {
            const target = botVote(bot, prev);
            if (target) await writeVote(bot.id, target);
          }, 2000 + i * 1500);
          botTimerRef.current.push(t);
        });

      } else if (prev.phase === "day-voting") {
        const allVotes = await readVotes();
        const eid = resolveVotes(allVotes);
        let up = prev.players.map(p => ({ ...p }));
        let ann = "";
        if (eid) {
          const el = up.find(p => p.id === eid);
          if (el) {
            up = up.map(p => p.id === el.id ? { ...p, isAlive: false } : p);
            ann = `🗳️ ${el.username} was eliminated — they were a ${el.role}.`;
            sfx.death();
            await updatePlayer(code, el.id, { isAlive: false });
          }
        } else {
          ann = "🗳️ Vote tied. No one eliminated.";
        }
        const w = checkWinCondition(up);
        if (w) {
          await persistState({ phase: "game-over", round: prev.round, timer: 0, players: up, winner: w, nightActions: {}, votes: [] });
          await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: ann + (w === "mafia" ? " 🎭 MAFIA WINS!" : " 🏛️ TOWN WINS!"), type: "system" });
          await updateRoomStatus(code, "finished");
          return;
        }
        sfx.night();
        await persistState({ phase: "night", round: prev.round + 1, timer: PHASE_DURATION["night"], players: up, nightActions: {}, votes: [], lastEliminated: eid ?? undefined });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: ann, type: "system" });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${prev.round + 1} falls...`, type: "system" });
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { nightActions: {}, voteMap: null });
        scheduleBotNightActions(up);
      }
    } finally {
      advancingRef.current = false;
    }
  }, [code, gameState]);

  // Bot day chat (HOST ONLY)
  useEffect(() => {
    if (!gameState || gameState.phase !== "day-discussion" || !isHostRef.current) return;
    const msgs = [
      "Anyone have a bad feeling? 👀", "I'm watching everyone...",
      "Mafia can't hide forever!", "Who's been quiet? 🤔",
      "Something feels off.", "Let's not rush the vote.",
      "I saw someone acting nervous.", "Why is everyone quiet?",
      "If we vote wrong, Mafia wins.", "The quiet ones worry me.",
      "This feels like a trap.", "I'm just a citizen! 🙏",
      "Doctor needs to save wisely.", "Did anyone hear anything?",
      "Stick together, Town!", "Who voted suspiciously last round?",
      "Bad feeling about this round.", "Let's end this tonight!",
      "Stop accusing me!", "The real Mafia is acting too innocent.",
      "My gut says it's the quiet one.", "Running out of time!",
    ];
    const interval = setInterval(async () => {
      if (Math.random() > 0.4) return;
      const bots = gameState.players.filter(p => p.isBot && p.isAlive);
      if (!bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      await sendChatMessage(code, { id: cryptoId(), userId: bot.id, username: bot.username, avatar: bot.avatar, message: msgs[Math.floor(Math.random() * msgs.length)], type: "public" });
    }, 5000);
    return () => clearInterval(interval);
  }, [gameState?.phase, code]);

  // ── Public actions ───────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!isHost || players.length < 6) return;
    const withRoles = assignRoles(players);
    for (const p of withRoles) await updatePlayer(code, p.id, { role: p.role, isAlive: true });
    await persistState({ phase: "role-reveal", round: 1, timer: 0, players: withRoles, nightActions: {}, votes: [] });
    await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "🎭 Roles assigned! Look at your card!", type: "system" });
    await updateRoomStatus(code, "in-game");
  }, [code, isHost, players]);

  const beginNight = useCallback(async () => {
    if (!isHostRef.current || !gameState || gameState.phase !== "role-reveal") return;
    sfx.night();
    await persistState({ phase: "night", round: 1, timer: PHASE_DURATION["night"], nightActions: {}, votes: [] });
    await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "🌙 Night 1 falls. Close your eyes...", type: "system" });
    if (gameState) scheduleBotNightActions(gameState.players);
  }, [gameState, code]);

  const submitAction = useCallback(async (type: "kill" | "save" | "investigate", targetId: string) => {
    sfx.select();
    if (!gameState || !myRole) return;
    if (myRole === "mafia" && type === "kill") await writeNightAction("mafiaTarget", targetId);
    else if (myRole === "doctor" && type === "save") await writeNightAction("doctorTarget", targetId);
    else if (myRole === "police" && type === "investigate") {
      await writeNightAction("policeTarget", targetId);
      const tgt = gameState.players.find(p => p.id === targetId);
      if (tgt) setPoliceResult({ targetId, isMafia: tgt.role === "mafia" });
    }
    setHasActed(true);
  }, [gameState, myRole]);

  const castVote = useCallback(async (targetId: string) => {
    sfx.vote();
    if (!gameState || !amAlive || gameState.phase !== "day-voting") return;
    await writeVote(myUid, targetId);
    setHasActed(true);
    // Update local for immediate UI feedback
    setGameState(prev => {
      if (!prev) return prev;
      const votes = [...prev.votes.filter(v => v.voterId !== myUid), { voterId: myUid, targetId }];
      return { ...prev, votes };
    });
  }, [gameState, amAlive, myUid]);

  const sendMessage = useCallback(async (msg: string) => {
    if (!me || !amAlive) return;
    if (phase === "night" && myRole !== "mafia") return;
    await sendChatMessage(code, {
      id: cryptoId(), userId: me.id, username: me.username, message: msg,
      type: phase === "night" ? "mafia-chat" : "public", avatar: me.avatar,
    });
  }, [code, me, amAlive, phase, myRole]);

  return (
    <Ctx.Provider value={{
      gameState, players, messages, phase, timer, round,
      myUid, isHost, myRole, amAlive, winner, policeResult, hasActed,
      startGame, beginNight, submitAction, castVote, sendMessage,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGameEngine() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGameEngine needs GameEngineProvider");
  return c;
}
