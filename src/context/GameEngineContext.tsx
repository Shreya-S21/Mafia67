// Game engine — complete working version
// Flow: lobby → role-reveal → night → day-discussion → day-voting → (repeat) → game-over
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  getRoom, onPlayersChanged, onGameStateChanged,
  sendChatMessage, onNewMessage, updateRoomStatus, updatePlayer,
  saveGameState, db, ref, dbGet, dbUpdate,
} from "../lib/db";
import type { GameStateData } from "../lib/db";
import {
  botNightAction, botVote, resolveNight, resolveVotes,
  checkWinCondition, cryptoId, assignRoles,
} from "../lib/gameEngine";
import { sfx } from "../lib/sound";
import type { Player, ChatMessage, GameState, GamePhase, NightActions } from "../lib/types";

// Phase durations (seconds)
const PT: Record<string, number> = { night: 45, "day-discussion": 60, "day-voting": 45 };

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
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomHostId, setRoomHostId] = useState("");
  const [policeResult, setPoliceResult] = useState<{ targetId: string; isMafia: boolean } | null>(null);
  const [hasActed, setHasActed] = useState(false);
  const [timer, setTimer] = useState(0);

  const advancingRef = useRef(false);
  const msgIdsRef = useRef(new Set<string>());
  const phaseEndRef = useRef(0);   // timestamp when current phase should end (host computes, client reads)
  const lastPhaseRef = useRef(""); // tracks phase+round so countdown doesn't restart on every update
  const botTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isHostByPlayers = players.some(p => p.id === myUid && p.isHost);
  const isHost = myUid !== "" && (roomHostId === myUid || isHostByPlayers);
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

  // ── Room host ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code || !myUid) return;
    getRoom(code).then(room => { if (room) setRoomHostId(room.hostId); });
  }, [code, myUid]);

  // ── Real-time player listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onPlayersChanged(code, setPlayers);
  }, [code]);

  // ── Real-time game state listener ──────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onGameStateChanged(code, (gs: GameStateData | null) => {
      if (!gs) return;

      // Compute phase end time from the timer value — only when phase actually changes
      const key = `${gs.phase}|${gs.round}`;
      if (lastPhaseRef.current !== key) {
        lastPhaseRef.current = key;
        phaseEndRef.current = Date.now() + (gs.timer ?? 0) * 1000;
      }

      setGameState(prev => ({
        roomId: code,
        phase: gs.phase,
        round: gs.round,
        players: prev?.players.length ? prev.players : players,
        nightActions: gs.nightActions ?? {},
        votes: gs.votes ?? [],
        timer: gs.timer ?? 0,
        lastEliminated: gs.lastEliminated,
        lastSaved: gs.lastSaved,
        winner: gs.winner,
        messages: prev?.messages ?? [],
      }));

      // Reset police result + hasActed when phase changes
      if (lastPhaseRef.current !== "") {
        setPoliceResult(null);
        setHasActed(false);
      }
    });
  }, [code, players]);

  // ── Real-time messages (deduplicated) ──────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onNewMessage(code, msg => {
      if (msgIdsRef.current.has(msg.id)) return;
      msgIdsRef.current.add(msg.id);
      setMessages(prev => [...prev, msg]);
      if (msg.userId !== myUid && msg.type !== "system") sfx.message();
    });
  }, [code, myUid]);

  // ── Sync players into gameState + host migration ────────────────────────────
  useEffect(() => {
    if (!players.length) return;
    setGameState(prev => {
      if (!prev) return prev;
      if (!prev.players.length) return { ...prev, players };
      const currentHost = players.find(p => p.isHost);
      let updatedPlayers = players;
      if (!currentHost && myUid) {
        const meAlive = players.find(p => p.id === myUid && p.isAlive);
        if (meAlive) updatePlayer(code, myUid, { isHost: true }).catch(() => {});
        updatedPlayers = players.map(p => p.id === myUid ? { ...p, isHost: true } : p);
      }
      const merged = prev.players.map(gp => {
        const live = updatedPlayers.find(p => p.id === gp.id);
        return live ? { ...gp, username: live.username, avatar: live.avatar, isHost: live.isHost } : gp;
      });
      return { ...prev, players: merged };
    });
  }, [players, myUid, code]);

  // ── LOCAL countdown — everyone computes from phaseEndRef ───────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    interval = setInterval(() => {
      if (!phaseEndRef.current) { setTimer(0); return; }
      const remaining = Math.max(0, Math.round((phaseEndRef.current - Date.now()) / 1000));
      setTimer(remaining);
      // Host advances phase when timer hits 0
      if (remaining === 0 && isHostRef.current && !advancingRef.current && phaseEndRef.current > 0) {
        advancePhase();
      }
    }, 500);
    return () => clearInterval(interval);
  }, []); // Only runs once — phaseEndRef is the source of truth

  useEffect(() => { if (timer > 0 && timer <= 5) sfx.countdown(); }, [timer]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function clearBotTimers() { botTimersRef.current.forEach(clearTimeout); botTimersRef.current = []; }

  async function writeNightAction(field: string, value: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/nightActions`), { [field]: value });
  }

  async function writeVote(voterId: string, targetId: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/voteMap`), { [voterId]: targetId });
  }

  async function readVotes(): Promise<{ voterId: string; targetId: string }[]> {
    if (!db) return [];
    const snap = await dbGet(ref(db, `rooms/${code}/gameState/voteMap`));
    if (!snap.exists()) return [];
    const map = snap.val() as Record<string, string>;
    return Object.entries(map).map(([voterId, targetId]) => ({ voterId, targetId }));
  }

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
      botTimersRef.current.push(t);
    });
  }

  // ── Phase advancement (HOST ONLY) ───────────────────────────────────────────
  const advancePhase = useCallback(async () => {
    if (!isHostRef.current || !gameState || advancingRef.current) return;
    advancingRef.current = true;
    try {
      const gs = gameState;

      if (gs.phase === "night") {
        sfx.day();
        const na = await readNightActions();
        const { killed, saved, announcement } = resolveNight({ ...gs, nightActions: na });
        let up = gs.players.map(p => ({ ...p }));
        if (killed && !saved) {
          up = up.map(p => p.id === killed.id ? { ...p, isAlive: false } : p);
          sfx.death();
          await updatePlayer(code, killed.id, { isAlive: false });
        }
        if (saved) sfx.saved();
        const w = checkWinCondition(up);
        const nextPhase: GamePhase = w ? "game-over" : "day-discussion";
        const nextTimer = w ? 0 : PT["day-discussion"];
        await saveGameState(code, { phase: nextPhase, round: gs.round, timer: nextTimer, nightActions: {}, votes: [], lastEliminated: killed?.id, lastSaved: saved });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: w ? (w === "mafia" ? "🎭 THE MAFIA WINS!" : "🏛️ THE TOWN WINS!") : announcement, type: "system" });
        if (w) await updateRoomStatus(code, "finished");
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { voteMap: null, nightActions: {} });

      } else if (gs.phase === "day-discussion") {
        await saveGameState(code, { phase: "day-voting", round: gs.round, timer: PT["day-voting"], votes: [] });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "⚖️ VOTING PHASE! Choose who to eliminate.", type: "system" });
        gs.players.filter(p => p.isBot && p.isAlive).forEach((bot, i) => {
          const t = setTimeout(async () => {
            const target = botVote(bot, gs);
            if (target) await writeVote(bot.id, target);
          }, 2000 + i * 1500);
          botTimersRef.current.push(t);
        });

      } else if (gs.phase === "day-voting") {
        const allVotes = await readVotes();
        const eid = resolveVotes(allVotes);
        let up = gs.players.map(p => ({ ...p }));
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
        const nextPhase: GamePhase = w ? "game-over" : "night";
        const nextTimer = w ? 0 : PT["night"];
        const nextRound = w ? gs.round : gs.round + 1;
        await saveGameState(code, { phase: nextPhase, round: nextRound, timer: nextTimer, nightActions: {}, votes: [], lastEliminated: eid ?? undefined });
        await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: w ? ann + (w === "mafia" ? " 🎭 MAFIA WINS!" : " 🏛️ TOWN WINS!") : ann, type: "system" });
        if (w) await updateRoomStatus(code, "finished");
        if (!w) await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${nextRound} falls...`, type: "system" });
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { nightActions: {}, voteMap: null });
        if (!w) scheduleBotNightActions(up);
      }
    } finally {
      advancingRef.current = false;
    }
  }, [code, gameState]);

  // Bot day chat (HOST ONLY)
  useEffect(() => {
    if (!gameState || gameState.phase !== "day-discussion" || !isHostRef.current) return;
    const chatMsgs = [
      "Anyone else have a bad feeling? 👀", "I'm watching everyone very carefully...",
      "Mafia can't hide forever!", "Think logically. Who's been quiet?",
      "Something feels off today. 🤔", "Let's not rush the vote this time.",
      "I saw someone acting nervous...", "Why is everyone so quiet?",
      "If we vote wrong, Mafia wins.", "I trust the quiet ones the least.",
      "This feels like a trap.", "I'm just a citizen, I swear! 🙏",
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
      await sendChatMessage(code, {
        id: cryptoId(), userId: bot.id, username: bot.username, avatar: bot.avatar,
        message: chatMsgs[Math.floor(Math.random() * chatMsgs.length)], type: "public",
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [gameState?.phase, code]);

  // ── Public actions ──────────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!isHost || players.length < 6) return;
    const withRoles = assignRoles(players);
    for (const p of withRoles) await updatePlayer(code, p.id, { role: p.role, isAlive: true });
    const gs: GameState = {
      roomId: code, phase: "role-reveal", round: 1, players: withRoles,
      nightActions: {}, votes: [], timer: 0, messages: [],
    };
    await saveGameState(code, { phase: "role-reveal", round: 1, timer: 0, nightActions: {}, votes: [] });
    await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "🎭 Roles assigned! Look at your card!", type: "system" });
    await updateRoomStatus(code, "in-game");
    setGameState(gs);
  }, [code, isHost, players]);

  const beginNight = useCallback(async () => {
    if (!isHostRef.current || !gameState || gameState.phase !== "role-reveal") return;
    sfx.night();
    await saveGameState(code, { phase: "night", round: 1, timer: PT["night"], nightActions: {}, votes: [] });
    await sendChatMessage(code, { id: cryptoId(), userId: "system", username: "System", message: "🌙 Night 1 falls. Close your eyes...", type: "system" });
    scheduleBotNightActions(gameState.players);
  }, [code, gameState]);

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
    // Immediate local UI update
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
