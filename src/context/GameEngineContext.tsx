// Real-time game engine — Firebase synced
// FIX: isHost is derived from BOTH the live players list AND
//      from the room's hostId field so it's never wrong while players load.
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  saveGameState, getGameState, getRoom, onPlayersChanged,
  sendChatMessage, getMessages, onNewMessage,
  updateRoomStatus, updatePlayer,
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
  startGame: () => Promise<void>;
  beginNight: () => Promise<void>;
  submitAction: (type: "kill" | "save" | "investigate", targetId: string) => Promise<void>;
  castVote: (targetId: string) => Promise<void>;
  sendMessage: (msg: string) => Promise<void>;
}

const Ctx = createContext<GameEngineValue | null>(null);

export function GameEngineProvider({
  code,
  myUid,
  children,
}: {
  code: string;
  myUid: string;
  children: ReactNode;
}) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // hostId loaded directly from the room doc — never wrong
  const [roomHostId, setRoomHostId] = useState<string>("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<GamePhase>("lobby");
  const advancingRef = useRef(false);

  // isHost determination — multiple fallbacks so the host is NEVER wrong:
  //  1. room doc's hostId matches me
  //  2. my player entry is flagged isHost
  //  3. I'm the only non-bot human in the room (I must be the host)
  const humanPlayers = players.filter(p => !p.isBot);
  const isHost = myUid !== "" && (
    roomHostId === myUid ||
    players.some(p => p.id === myUid && p.isHost) ||
    (humanPlayers.length === 1 && humanPlayers[0]?.id === myUid)
  );

  // Keep isHost in a ref so the timer effect doesn't restart when it changes
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const me = players.find(p => p.id === myUid);
  const myRole = gameState?.players.find(p => p.id === myUid)?.role ?? me?.role;
  const amAlive = gameState?.players.find(p => p.id === myUid)?.isAlive ?? true;
  const phase = gameState?.phase ?? "lobby";
  const timer = gameState?.timer ?? 0;
  const round = gameState?.round ?? 1;
  const winner = gameState?.winner;

  // ── Load room host from DB immediately ─────────────────────────────────────
  useEffect(() => {
    if (!code || !myUid) return;
    getRoom(code).then(room => {
      if (room) {
        setRoomHostId(room.hostId);
        console.log("[Mafia67] Room host:", room.hostId, "| My uid:", myUid, "| Am I host?", room.hostId === myUid);
      } else {
        console.warn("[Mafia67] No room doc found for code:", code);
      }
    }).catch(e => console.error("[Mafia67] getRoom failed:", e));
  }, [code, myUid]);

  // ── Listeners ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onPlayersChanged(code, setPlayers);
  }, [code]);

  useEffect(() => {
    if (!code) return;
    getMessages(code).then(setMessages);
    return onNewMessage(code, msg => {
      setMessages(prev => [...prev, msg]);
      if (msg.userId !== myUid && msg.type !== "system") sfx.message();
    });
  }, [code, myUid]);

  // Load persisted game state (reconnect support)
  useEffect(() => {
    if (!code) return;
    getGameState(code).then(gs => {
      if (!gs || gs.phase === "lobby") return;
      setGameState({
        roomId: code,
        phase: gs.phase,
        round: gs.round,
        players: [],
        nightActions: gs.nightActions ?? {},
        votes: gs.votes ?? [],
        timer: gs.timer,
        lastEliminated: gs.lastEliminated,
        lastSaved: gs.lastSaved,
        winner: gs.winner,
        messages: [],
      });
      phaseRef.current = gs.phase;
    });
  }, [code]);

  // Sync live players into gameState
  useEffect(() => {
    if (!players.length) return;
    setGameState(prev => {
      if (!prev) return prev;
      if (!prev.players.length) return { ...prev, players };
      const merged = prev.players.map(gp => {
        const live = players.find(p => p.id === gp.id);
        return live ? { ...gp, username: live.username, avatar: live.avatar } : gp;
      });
      return { ...prev, players: merged };
    });
  }, [players]);

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

  function scheduleBotNightActions(gamePlayers: Player[]) {
    const bots = gamePlayers.filter(p => p.isBot && p.isAlive && p.role && p.role !== "citizen");
    bots.forEach((bot, i) => {
      const t = setTimeout(() => {
        setGameState(pg => {
          if (!pg || pg.phase !== "night") return pg;
          const action = botNightAction(bot, pg);
          const na: NightActions = { ...pg.nightActions };
          if (typeof action === "object") {
            if (bot.role === "mafia" && action.mafiaTarget) na.mafiaTarget = action.mafiaTarget;
            if (bot.role === "doctor" && action.doctorTarget) na.doctorTarget = action.doctorTarget;
            if (bot.role === "police" && action.policeTarget) {
              const tgt = pg.players.find(p => p.id === action.policeTarget);
              if (tgt) {
                na.policeTarget = action.policeTarget;
                na.policeResult = { targetId: tgt.id, isMafia: tgt.role === "mafia" };
              }
            }
          }
          const next = { ...pg, nightActions: na };
          persist(next);
          return next;
        });
      }, 3000 + i * 2000);
      botTimerRef.current.push(t);
    });
  }

  // ── Phase advancement (host only) ───────────────────────────────────────────
  const advancePhase = useCallback(async (prev: GameState) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      if (prev.phase === "night") {
        sfx.day();
        const { killed, saved, announcement } = resolveNight(prev);
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
            messages: [...prev.messages, {
              id: cryptoId(), userId: "system", username: "System",
              message: w === "mafia" ? "🎭 THE MAFIA WINS! The town has fallen." : "🏛️ THE TOWN WINS! All Mafia eliminated.",
              timestamp: Date.now(), type: "system",
            }],
          };
          setGameState(gs); await persist(gs); await updateRoomStatus(code, "finished");
          return;
        }
        const gs: GameState = {
          ...prev, phase: "day-discussion", players: up,
          timer: 60, nightActions: {}, votes: [],
          lastEliminated: killed?.id, lastSaved: saved,
          messages: [...prev.messages, {
            id: cryptoId(), userId: "system", username: "System",
            message: announcement, timestamp: Date.now(), type: "system",
          }],
        };
        setGameState(gs); await persist(gs);

      } else if (prev.phase === "day-discussion") {
        const gs: GameState = {
          ...prev, phase: "day-voting", timer: 30, votes: [],
          messages: [...prev.messages, {
            id: cryptoId(), userId: "system", username: "System",
            message: "⚖️ Voting begins! Choose who to eliminate.", timestamp: Date.now(), type: "system",
          }],
        };
        setGameState(gs); await persist(gs);
        prev.players.filter(p => p.isBot && p.isAlive).forEach((bot, i) => {
          const t = setTimeout(() => {
            setGameState(pg => {
              if (!pg || pg.phase !== "day-voting" || pg.votes.find(v => v.voterId === bot.id)) return pg;
              const target = botVote(bot, pg);
              if (!target) return pg;
              const next = { ...pg, votes: [...pg.votes, { voterId: bot.id, targetId: target }] };
              persist(next);
              return next;
            });
          }, 2000 + i * 1500);
          botTimerRef.current.push(t);
        });

      } else if (prev.phase === "day-voting") {
        const eid = resolveVotes(prev.votes);
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
            { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${prev.round + 1} falls. Close your eyes...`, timestamp: Date.now() + 100, type: "system" },
          ],
        };
        setGameState(gs); await persist(gs);
        scheduleBotNightActions(up);
      }
    } finally {
      advancingRef.current = false;
    }
  }, [code, persist]);

  // ── Timer (simple decrement, only host drives phase transitions) ──────────
  useEffect(() => {
    // No timer during lobby, role-reveal, or game-over
    if (!gameState || gameState.phase === "game-over" || gameState.phase === "lobby" || gameState.phase === "role-reveal") {
      clearTimers();
      return;
    }
    if (phaseRef.current === gameState.phase) return;
    phaseRef.current = gameState.phase;
    clearTimers();

    // Simple 1-second interval that decrements timer
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        if (!prev || prev.phase === "game-over" || prev.phase === "lobby") return prev;
        if (prev.timer > 0) {
          return { ...prev, timer: prev.timer - 1 };
        }
        return prev;
      });
    }, 1000);

    // Separate effect to detect when timer hits 0 and advance
    return () => clearTimers();
  }, [gameState?.phase, clearTimers]);

  // Detect timer expiry and advance phase (host only)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === "game-over" || gameState.phase === "lobby" || gameState.phase === "role-reveal") return;
    if (gameState.timer === 0 && isHostRef.current) {
      // Prevent multiple advances
      if (!advancingRef.current) {
        advancePhase(gameState);
      }
    }
  }, [gameState?.timer, gameState?.phase, advancePhase]);

  useEffect(() => { if (timer > 0 && timer <= 5) sfx.countdown(); }, [timer]);

  // Bot day chat
  useEffect(() => {
    if (!gameState || gameState.phase !== "day-discussion") return;
    const chatMsgs = [
      "Anyone else have a bad feeling? 👀",
      "I'm watching everyone very carefully...",
      "The Mafia can't hide forever!",
      "Think logically. Who's been quiet?",
      "Something feels off today. 🤔",
      "Let's not rush the vote this time.",
    ];
    const interval = setInterval(async () => {
      if (Math.random() > 0.4) return;
      const aliveBots = gameState.players.filter(p => p.isBot && p.isAlive);
      if (!aliveBots.length) return;
      const bot = aliveBots[Math.floor(Math.random() * aliveBots.length)];
      await sendChatMessage(code, {
        id: cryptoId(), userId: bot.id, username: bot.username, avatar: bot.avatar,
        message: chatMsgs[Math.floor(Math.random() * chatMsgs.length)],
        type: "public",
      });
    }, 7000);
    return () => clearInterval(interval);
  }, [gameState?.phase, code]);

  // ── Public actions ──────────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!isHost || players.length < 6) return;
    const withRoles = assignRoles(players);
    for (const p of withRoles) {
      await updatePlayer(code, p.id, { role: p.role, isAlive: true });
    }
    // Set phase to "role-reveal" so players see the card flip first
    const gs: GameState = {
      roomId: code, phase: "role-reveal", round: 1, players: withRoles,
      nightActions: {}, votes: [], timer: 0,
      messages: [
        { id: cryptoId(), userId: "system", username: "System", message: "🎭 Roles have been assigned. Look at your card!", timestamp: Date.now(), type: "system" },
      ],
    };
    setGameState(gs);
    await persist(gs);
    await updateRoomStatus(code, "in-game");
  }, [code, isHost, players, persist]);

  // Called when player clicks "I understand my role" → starts Night 1
  const beginNight = useCallback(async () => {
    if (!gameState || gameState.phase !== "role-reveal") return;
    sfx.night();
    const updated = { ...gameState, phase: "night" as GamePhase, timer: 45 };
    setGameState(updated);
    await persist(updated);
    scheduleBotNightActions(gameState.players);
  }, [gameState, persist]);

  const submitAction = useCallback(async (type: "kill" | "save" | "investigate", targetId: string) => {
    sfx.select();
    if (!gameState || !myRole) return;
    const na: NightActions = { ...gameState.nightActions };
    if (myRole === "mafia" && type === "kill") na.mafiaTarget = targetId;
    else if (myRole === "doctor" && type === "save") na.doctorTarget = targetId;
    else if (myRole === "police" && type === "investigate") {
      na.policeTarget = targetId;
      const tgt = gameState.players.find(p => p.id === targetId);
      if (tgt) na.policeResult = { targetId, isMafia: tgt.role === "mafia" };
    }
    const gs = { ...gameState, nightActions: na };
    setGameState(gs); await persist(gs);
  }, [gameState, myRole, persist]);

  const castVote = useCallback(async (targetId: string) => {
    sfx.vote();
    if (!gameState || !amAlive || gameState.phase !== "day-voting") return;
    const votes = [...gameState.votes.filter(v => v.voterId !== myUid), { voterId: myUid, targetId }];
    const gs = { ...gameState, votes };
    setGameState(gs); await persist(gs);
  }, [gameState, amAlive, myUid, persist]);

  const sendMessage = useCallback(async (msg: string) => {
    if (!me || !amAlive) return;
    if (phase === "night" && myRole !== "mafia") return;
    await sendChatMessage(code, {
      id: cryptoId(), userId: me.id, username: me.username, message: msg,
      type: phase === "night" ? "mafia-chat" : "public",
      avatar: me.avatar,
    });
  }, [code, me, amAlive, phase, myRole]);

  return (
    <Ctx.Provider value={{
      gameState, players, messages, phase, timer, round,
      myUid, isHost, myRole, amAlive, winner,
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
