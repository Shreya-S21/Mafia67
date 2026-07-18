// Real-time game engine — Firebase synced
// FIX: Non-host players now LISTEN to Firebase for all state changes.
//      Night actions + votes use per-player writes to avoid overwrites.
//      Police result stored locally only (not visible to other players).
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  saveGameState, getGameState, getRoom, onPlayersChanged, onGameStateChanged,
  sendChatMessage, onNewMessage,
  updateRoomStatus, updatePlayer,
  db, ref, dbUpdate, dbGet,
} from "../lib/db";
import {
  botNightAction, botVote, resolveNight, resolveVotes,
  checkWinCondition, cryptoId, assignRoles,
} from "../lib/gameEngine";
import { sfx } from "../lib/sound";
import type { Player, ChatMessage, GameState, GamePhase, NightActions } from "../lib/types";

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
  const [roomHostId, setRoomHostId] = useState<string>("");
  // Police result stored LOCALLY only — never sent to Firebase
  const [policeResult, setPoliceResult] = useState<{ targetId: string; isMafia: boolean } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<GamePhase>("lobby");
  const advancingRef = useRef(false);
  const msgIdsRef = useRef(new Set<string>());

  const humanPlayers = players.filter(p => !p.isBot);
  const isHost = myUid !== "" && (
    roomHostId === myUid ||
    players.some(p => p.id === myUid && p.isHost) ||
    (humanPlayers.length === 1 && humanPlayers[0]?.id === myUid)
  );
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const me = players.find(p => p.id === myUid);
  const myRole = gameState?.players.find(p => p.id === myUid)?.role ?? me?.role;
  const amAlive = gameState?.players.find(p => p.id === myUid)?.isAlive ?? true;
  const phase = gameState?.phase ?? "lobby";
  const timer = gameState?.timer ?? 0;
  const round = gameState?.round ?? 1;
  const winner = gameState?.winner;

  // ── Load room host ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code || !myUid) return;
    getRoom(code).then(room => { if (room) setRoomHostId(room.hostId); });
  }, [code, myUid]);

  // ── Real-time player listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onPlayersChanged(code, setPlayers);
  }, [code]);

  // ── Real-time game state listener (ALL players sync from Firebase) ──────────
  useEffect(() => {
    if (!code) return;
    return onGameStateChanged(code, (gs) => {
      if (!gs) return;
      setGameState(prev => {
        // Merge: keep local players list (which has roles from assignRoles)
        // but update phase/timer/votes/nightActions from Firebase
        const basePlayers = prev?.players.length ? prev.players : players;
        return {
          roomId: code,
          phase: gs.phase,
          round: gs.round,
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
      phaseRef.current = gs.phase;
    });
  }, [code, players]);

  // ── Real-time messages (deduplicated) ───────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onNewMessage(code, msg => {
      if (msgIdsRef.current.has(msg.id)) return; // deduplicate
      msgIdsRef.current.add(msg.id);
      setMessages(prev => [...prev, msg]);
      if (msg.userId !== myUid && msg.type !== "system") sfx.message();
    });
  }, [code, myUid]);

  // ── Sync live players into gameState ────────────────────────────────────────
  useEffect(() => {
    if (!players.length) return;
    setGameState(prev => {
      if (!prev) return prev;
      if (!prev.players.length) return { ...prev, players };
      // Host migration: if current host left, promote me
      const currentHost = players.find(p => p.isHost);
      let newPlayers = players;
      if (!currentHost && myUid) {
        const mePlayer = players.find(p => p.id === myUid && p.isAlive);
        if (mePlayer) {
          newPlayers = players.map(p => p.id === myUid ? { ...p, isHost: true } : p);
          updatePlayer(code, myUid, { isHost: true }).catch(console.error);
        }
      }
      const merged = prev.players.map(gp => {
        const live = newPlayers.find(p => p.id === gp.id);
        return live ? { ...gp, username: live.username, avatar: live.avatar, isHost: live.isHost } : gp;
      });
      return { ...prev, players: merged };
    });
  }, [players, myUid, code]);

  // ── Reset police result on new night ────────────────────────────────────────
  useEffect(() => {
    if (phase === "night") setPoliceResult(null);
  }, [phase, round]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    botTimerRef.current.forEach(clearTimeout);
    botTimerRef.current = [];
  }, []);

  const persist = useCallback(async (gs: GameState) => {
    await saveGameState(code, {
      phase: gs.phase, round: gs.round, timer: gs.timer,
      nightActions: gs.nightActions, votes: gs.votes,
      lastEliminated: gs.lastEliminated, lastSaved: gs.lastSaved,
      winner: gs.winner, startedAt: Date.now(),
    });
  }, [code]);

  // ── Atomic night action write (only writes THIS player's field) ─────────────
  async function writeNightAction(field: string, value: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/nightActions`), { [field]: value });
  }

  // ── Atomic vote write (each player writes under their uid) ──────────────────
  async function writeVote(voterId: string, targetId: string) {
    if (!db) return;
    await dbUpdate(ref(db, `rooms/${code}/gameState/voteMap`), { [voterId]: targetId });
  }

  // ── Read all votes from voteMap ─────────────────────────────────────────────
  async function readVoteMap(): Promise<{ voterId: string; targetId: string }[]> {
    if (!db) return [];
    const snap = await dbGet(ref(db, `rooms/${code}/gameState/voteMap`));
    if (!snap.exists()) return [];
    const map = snap.val() as Record<string, string>;
    return Object.entries(map).map(([voterId, targetId]) => ({ voterId, targetId }));
  }

  function scheduleBotNightActions(gamePlayers: Player[]) {
    const bots = gamePlayers.filter(p => p.isBot && p.isAlive && p.role && p.role !== "citizen");
    bots.forEach((bot, i) => {
      const t = setTimeout(async () => {
        if (!gameState) return;
        const action = botNightAction(bot, gameState);
        if (typeof action === "object") {
          if (bot.role === "mafia" && action.mafiaTarget) await writeNightAction("mafiaTarget", action.mafiaTarget);
          if (bot.role === "doctor" && action.doctorTarget) await writeNightAction("doctorTarget", action.doctorTarget);
          if (bot.role === "police" && action.policeTarget) await writeNightAction("policeTarget", action.policeTarget);
        }
      }, 3000 + i * 2000);
      botTimerRef.current.push(t);
    });
  }

  // ── Phase advancement (host only) ───────────────────────────────────────────
  const advancePhase = useCallback(async (prev: GameState) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      // Read night actions from Firebase (not local state) to get all players' actions
      let nightActions = prev.nightActions;
      if (prev.phase === "night" && db) {
        const snap = await dbGet(ref(db, `rooms/${code}/gameState/nightActions`));
        if (snap.exists()) nightActions = snap.val() as NightActions;
      }
      const prevWithActions = { ...prev, nightActions };

      if (prev.phase === "night") {
        sfx.day();
        const { killed, saved, announcement } = resolveNight(prevWithActions);
        let up = prev.players.map(p => ({ ...p }));
        if (killed && !saved) {
          up = up.map(p => p.id === killed.id ? { ...p, isAlive: false } : p);
          sfx.death();
          await updatePlayer(code, killed.id, { isAlive: false });
        }
        if (saved) sfx.saved();
        const w = checkWinCondition(up);
        if (w) {
          const gs: GameState = {
            ...prev, phase: "game-over", players: up, timer: 0, winner: w,
            nightActions: {}, votes: [],
            messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: w === "mafia" ? "🎭 THE MAFIA WINS!" : "🏛️ THE TOWN WINS!", timestamp: Date.now(), type: "system" }],
          };
          setGameState(gs); await persist(gs); await updateRoomStatus(code, "finished");
          return;
        }
        const gs: GameState = {
          ...prev, phase: "day-discussion", players: up,
          timer: 60, nightActions: {}, votes: [],
          lastEliminated: killed?.id, lastSaved: saved,
          messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: announcement, timestamp: Date.now(), type: "system" }],
        };
        setGameState(gs); await persist(gs);
        // Clear voteMap for next voting phase
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { voteMap: null });

      } else if (prev.phase === "day-discussion") {
        const gs: GameState = {
          ...prev, phase: "day-voting", timer: 45, votes: [],
          messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: "⚖️ VOTING PHASE! Choose who to eliminate.", timestamp: Date.now(), type: "system" }],
        };
        setGameState(gs); await persist(gs);
        // Bot votes
        prev.players.filter(p => p.isBot && p.isAlive).forEach((bot, i) => {
          const t = setTimeout(async () => {
            const target = botVote(bot, gs);
            if (target) await writeVote(bot.id, target);
          }, 2000 + i * 1500);
          botTimerRef.current.push(t);
        });

      } else if (prev.phase === "day-voting") {
        // Read votes from Firebase voteMap (not local state)
        const allVotes = await readVoteMap();
        const eid = resolveVotes(allVotes);
        let up = prev.players.map(p => ({ ...p }));
        let ann = "";
        if (eid) {
          const el = up.find(p => p.id === eid);
          if (el) {
            up = up.map(p => p.id === el.id ? { ...p, isAlive: false } : p);
            ann = `🗳️ The town has spoken. ${el.username} was eliminated — they were a ${el.role}.`;
            sfx.death();
            await updatePlayer(code, el.id, { isAlive: false });
          }
        } else {
          ann = "🗳️ The vote tied. No one was eliminated today.";
        }
        const w = checkWinCondition(up);
        if (w) {
          const gs: GameState = {
            ...prev, phase: "game-over", players: up, timer: 0, winner: w,
            nightActions: {}, votes: [],
            messages: [...prev.messages,
              { id: cryptoId(), userId: "system", username: "System", message: ann, timestamp: Date.now(), type: "system" },
              { id: cryptoId(), userId: "system", username: "System", message: w === "mafia" ? "🎭 THE MAFIA WINS!" : "🏛️ THE TOWN WINS!", timestamp: Date.now() + 50, type: "system" },
            ],
          };
          setGameState(gs); await persist(gs); await updateRoomStatus(code, "finished");
          return;
        }
        sfx.night();
        const gs: GameState = {
          ...prev, phase: "night", round: prev.round + 1, players: up,
          votes: [], timer: 45, nightActions: {}, lastEliminated: eid ?? undefined,
          messages: [...prev.messages,
            { id: cryptoId(), userId: "system", username: "System", message: ann, timestamp: Date.now(), type: "system" },
            { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${prev.round + 1} falls...`, timestamp: Date.now() + 100, type: "system" },
          ],
        };
        setGameState(gs); await persist(gs);
        // Clear nightActions and voteMap for next round
        if (db) await dbUpdate(ref(db, `rooms/${code}/gameState`), { nightActions: {}, voteMap: null });
        scheduleBotNightActions(up);
      }
    } finally {
      advancingRef.current = false;
    }
  }, [code, persist, gameState]);

  // ── Timer (HOST ONLY decrements and persists) ───────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.phase === "game-over" || gameState.phase === "lobby" || gameState.phase === "role-reveal") {
      clearTimers(); return;
    }
    // Only start a NEW timer when phase changes
    if (phaseRef.current === gameState.phase) return;
    phaseRef.current = gameState.phase;
    clearTimers();

    // Non-host players get timer updates via onGameStateChanged listener above
    if (!isHostRef.current) return;

    timerRef.current = setInterval(() => {
      setGameState(prev => {
        if (!prev || prev.phase === "game-over" || prev.phase === "lobby") return prev;
        if (prev.timer > 0) {
          const updated = { ...prev, timer: prev.timer - 1 };
          persist(updated).catch(console.error);
          return updated;
        }
        return prev;
      });
    }, 1000);

    return () => clearTimers();
  }, [gameState?.phase, clearTimers, persist]);

  // Timer expiry → advance phase (host only)
  useEffect(() => {
    if (!gameState || gameState.phase === "game-over" || gameState.phase === "lobby" || gameState.phase === "role-reveal") return;
    if (gameState.timer === 0 && isHostRef.current && !advancingRef.current) {
      advancePhase(gameState);
    }
  }, [gameState?.timer, gameState?.phase, advancePhase]);

  useEffect(() => { if (timer > 0 && timer <= 5) sfx.countdown(); }, [timer]);

  // Bot day chat (HOST ONLY to prevent duplicates)
  useEffect(() => {
    if (!gameState || gameState.phase !== "day-discussion" || !isHostRef.current) return;
    const chatMsgs = [
      "Anyone else have a bad feeling? 👀", "I'm watching everyone very carefully...",
      "The Mafia can't hide forever!", "Think logically. Who's been quiet?",
      "Something feels off today. 🤔", "Let's not rush the vote this time.",
      "I saw someone acting nervous...", "Why is everyone so quiet?",
      "If we vote wrong, Mafia wins.", "I trust the quiet ones the least.",
      "This feels like a trap.", "I'm just a citizen, I swear! 🙏",
      "The Doctor needs to save wisely.", "Did anyone hear anything?",
      "We need to stick together!", "Who voted suspiciously last round?",
      "I have a bad feeling about this round.", "Let's end this tonight!",
      "Stop accusing me, I'm Town!", "The real Mafia is acting too innocent.",
      "My gut tells me it's the quiet one.", "We are running out of time!",
    ];
    const interval = setInterval(async () => {
      if (Math.random() > 0.4) return;
      const aliveBots = gameState.players.filter(p => p.isBot && p.isAlive);
      if (!aliveBots.length) return;
      const bot = aliveBots[Math.floor(Math.random() * aliveBots.length)];
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
      nightActions: {}, votes: [], timer: 0,
      messages: [{ id: cryptoId(), userId: "system", username: "System", message: "🎭 Roles assigned. Look at your card!", timestamp: Date.now(), type: "system" }],
    };
    setGameState(gs); await persist(gs); await updateRoomStatus(code, "in-game");
  }, [code, isHost, players, persist]);

  // Only HOST begins night (other players auto-sync via onGameStateChanged)
  const beginNight = useCallback(async () => {
    if (!gameState || gameState.phase !== "role-reveal") return;
    if (!isHostRef.current) return; // Only host can start night
    sfx.night();
    const updated: GameState = { ...gameState, phase: "night", timer: 45 };
    setGameState(updated); await persist(updated);
    scheduleBotNightActions(gameState.players);
  }, [gameState, persist]);

  // Night action — writes ONLY this player's field atomically
  const submitAction = useCallback(async (type: "kill" | "save" | "investigate", targetId: string) => {
    sfx.select();
    if (!gameState || !myRole) return;
    if (myRole === "mafia" && type === "kill") await writeNightAction("mafiaTarget", targetId);
    else if (myRole === "doctor" && type === "save") await writeNightAction("doctorTarget", targetId);
    else if (myRole === "police" && type === "investigate") {
      await writeNightAction("policeTarget", targetId);
      // Store result LOCALLY only — not in Firebase
      const tgt = gameState.players.find(p => p.id === targetId);
      if (tgt) setPoliceResult({ targetId, isMafia: tgt.role === "mafia" });
    }
    // Update local state for UI
    const na: NightActions = { ...gameState.nightActions };
    if (myRole === "mafia") na.mafiaTarget = targetId;
    else if (myRole === "doctor") na.doctorTarget = targetId;
    else if (myRole === "police") na.policeTarget = targetId;
    setGameState(prev => prev ? { ...prev, nightActions: na } : prev);
  }, [gameState, myRole]);

  // Vote — writes ONLY this player's vote atomically
  const castVote = useCallback(async (targetId: string) => {
    sfx.vote();
    if (!gameState || !amAlive || gameState.phase !== "day-voting") return;
    await writeVote(myUid, targetId);
    // Update local state for UI
    const votes = [...gameState.votes.filter(v => v.voterId !== myUid), { voterId: myUid, targetId }];
    setGameState(prev => prev ? { ...prev, votes } : prev);
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
      myUid, isHost, myRole, amAlive, winner, policeResult,
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
