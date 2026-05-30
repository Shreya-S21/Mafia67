// Real-time game engine — manages game state, phases, bot AI, syncs via Firebase DB
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { saveGameState, getGameState, onPlayersChanged, sendChatMessage, getMessages, onNewMessage, updateRoomStatus, updatePlayer } from "../lib/db";
import { botNightAction, botVote, resolveNight, resolveVotes, checkWinCondition, cryptoId, assignRoles } from "../lib/gameEngine";
import { sfx } from "../lib/sound";
import type { Player, ChatMessage, GameState, GamePhase, NightActions } from "../lib/types";

interface GameEngineValue {
  gameState: GameState | null;
  players: Player[];
  messages: ChatMessage[];
  phase: GamePhase;
  timer: number;
  round: number;
  isHost: boolean;
  myRole: Player["role"];
  amAlive: boolean;
  winner: "mafia" | "town" | undefined;
  startGame: () => void;
  submitAction: (type: "kill" | "save" | "investigate", targetId: string) => void;
  castVote: (targetId: string) => void;
  sendMessage: (msg: string) => void;
}

const Ctx = createContext<GameEngineValue | null>(null);

export function GameEngineProvider({ code, children }: { code: string; children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<GamePhase>("lobby");

  const myUid = (() => {
    const demo = localStorage.getItem("mafia.demoUser");
    if (demo) try { return JSON.parse(demo).uid; } catch {}
    // Try Firebase
    try {
      const { auth } = require("../lib/firebase");
      return auth?.currentUser?.uid ?? "";
    } catch {}
    return "";
  })();

  const isHost = players.some((p) => p.id === myUid && p.isHost);
  const me = players.find((p) => p.id === myUid);
  const myRole = me?.role;
  const amAlive = !!me?.isAlive;
  const phase = gameState?.phase ?? "lobby";
  const timer = gameState?.timer ?? 0;
  const round = gameState?.round ?? 1;
  const winner = gameState?.winner;

  useEffect(() => { onPlayersChanged(code, setPlayers); }, [code]);

  useEffect(() => {
    const load = async () => { const m = await getMessages(code); setMessages(m); };
    load();
    return onNewMessage(code, (msg) => { setMessages(p => [...p, msg]); if (msg.userId !== myUid && msg.type !== "system") sfx.message(); });
  }, [code, myUid]);

  useEffect(() => {
    const load = async () => {
      const gs = await getGameState(code);
      if (gs) {
        setGameState({ roomId: code, phase: gs.phase, round: gs.round, players: [], nightActions: gs.nightActions, votes: gs.votes, timer: gs.timer, lastEliminated: gs.lastEliminated, lastSaved: gs.lastSaved, winner: gs.winner, messages: [] });
        phaseRef.current = gs.phase;
      }
    };
    load();
  }, [code]);

  const clearTimers = useCallback(() => { if (timerRef.current) clearInterval(timerRef.current); botTimerRef.current.forEach(clearTimeout); botTimerRef.current = []; }, []);

  const persist = useCallback(async (gs: GameState) => {
    await saveGameState(code, { phase: gs.phase, round: gs.round, timer: gs.timer, nightActions: gs.nightActions, votes: gs.votes, lastEliminated: gs.lastEliminated, lastSaved: gs.lastSaved, winner: gs.winner, startedAt: Date.now() });
  }, [code]);

  const advancePhase = useCallback(async (prev: GameState) => {
    if (prev.phase === "night") {
      sfx.day();
      const { killed, saved, announcement } = resolveNight(prev);
      let up = prev.players.map(p => ({ ...p }));
      if (killed && !saved) { up = up.map(p => p.id === killed.id ? { ...p, isAlive: false } : p); sfx.death(); await updatePlayer(code, killed.id, { isAlive: false }); }
      if (saved) sfx.saved();
      const w = checkWinCondition(up);
      if (w) {
        const gs: GameState = { ...prev, phase: "game-over", players: up, timer: 0, winner: w, nightActions: {}, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: w === "mafia" ? "🎭 THE MAFIA WINS!" : "🏛️ THE TOWN WINS!", timestamp: Date.now(), type: "system" }] };
        setGameState(gs); await persist(gs); await updateRoomStatus(code, "finished");
        return;
      }
      const gs: GameState = { ...prev, phase: "day-discussion", players: up, timer: 60, nightActions: {}, votes: [], lastEliminated: killed?.id, lastSaved: saved, messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: announcement, timestamp: Date.now(), type: "system" }] };
      setGameState(gs); await persist(gs);
    } else if (prev.phase === "day-discussion") {
      const gs: GameState = { ...prev, phase: "day-voting", timer: 30, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: "⚖️ Voting phase begins.", timestamp: Date.now(), type: "system" }] };
      setGameState(gs); await persist(gs);
      prev.players.filter(p => p.isBot && p.isAlive).forEach((bot, i) => {
        const t = setTimeout(() => {
          const target = botVote(bot, gs);
          if (target) setGameState(pg => {
            if (!pg || pg.phase !== "day-voting" || pg.votes.find(v => v.voterId === bot.id)) return pg;
            const next = { ...pg, votes: [...pg.votes, { voterId: bot.id, targetId: target }] };
            persist(next); return next;
          });
        }, 1500 + i * 1200);
        botTimerRef.current.push(t);
      });
    } else if (prev.phase === "day-voting") {
      const eid = resolveVotes(prev.votes);
      let up = prev.players.map(p => ({ ...p }));
      let ann = "";
      if (eid) { const el = up.find(p => p.id === eid); if (el) { up = up.map(p => p.id === el.id ? { ...p, isAlive: false } : p); ann = `🗳️ ${el.username} was eliminated. They were a ${el.role}.`; sfx.death(); await updatePlayer(code, el.id, { isAlive: false }); } }
      else ann = "🗳️ Vote tied. No one eliminated.";
      const w = checkWinCondition(up);
      if (w) {
        const gs: GameState = { ...prev, phase: "game-over", players: up, timer: 0, winner: w, nightActions: {}, votes: [], messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: ann + (w === "mafia" ? " 🎭 MAFIA WINS!" : " 🏛️ TOWN WINS!"), timestamp: Date.now(), type: "system" }] };
        setGameState(gs); await persist(gs); await updateRoomStatus(code, "finished");
        return;
      }
      const gs: GameState = { ...prev, phase: "night", round: prev.round + 1, players: up, votes: [], timer: 45, nightActions: {}, lastEliminated: eid ?? undefined, messages: [...prev.messages, { id: cryptoId(), userId: "system", username: "System", message: ann, timestamp: Date.now(), type: "system" }, { id: cryptoId(), userId: "system", username: "System", message: `🌙 Night ${prev.round + 1} begins...`, timestamp: Date.now() + 100, type: "system" }] };
      setGameState(gs); await persist(gs); sfx.night();
      up.filter(p => p.isBot && p.isAlive && p.role && p.role !== "citizen").forEach((bot, i) => {
        const t = setTimeout(() => {
          setGameState(pg => {
            if (!pg || pg.phase !== "night") return pg;
            const action = botNightAction(bot, pg);
            const na: NightActions = { ...pg.nightActions };
            if (typeof action === "object") {
              if (bot.role === "mafia" && action.mafiaTarget) na.mafiaTarget = action.mafiaTarget;
              if (bot.role === "doctor" && action.doctorTarget) na.doctorTarget = action.doctorTarget;
              if (bot.role === "police" && action.policeTarget) { const tgt = pg.players.find(p => p.id === action.policeTarget); if (tgt) { na.policeTarget = action.policeTarget; na.policeResult = { targetId: tgt.id, isMafia: tgt.role === "mafia" }; } }
            }
            const next = { ...pg, nightActions: na }; persist(next); return next;
          });
        }, 2000 + i * 1800);
        botTimerRef.current.push(t);
      });
    }
  }, [code, persist]);

  useEffect(() => {
    if (!gameState || gameState.phase === "game-over" || gameState.phase === "lobby") { clearTimers(); return; }
    if (phaseRef.current === gameState.phase) return;
    phaseRef.current = gameState.phase;
    clearTimers();
    timerRef.current = setInterval(async () => {
      setGameState(prev => {
        if (!prev || prev.phase === "game-over" || prev.phase === "lobby") return prev;
        if (prev.timer > 0) return { ...prev, timer: prev.timer - 1 };
        advancePhase(prev); return prev;
      });
    }, 1000);
    return () => clearTimers();
  }, [gameState?.phase, advancePhase, clearTimers]);

  useEffect(() => { if (timer > 0 && timer <= 5) sfx.countdown(); }, [timer]);

  const startGame = useCallback(async () => {
    if (!isHost || players.length < 6) return;
    sfx.night();
    const updated = assignRoles(players);
    for (const p of updated) await updatePlayer(code, p.id, { role: p.role, isAlive: true });
    const gs: GameState = { roomId: code, phase: "night", round: 1, players: updated, nightActions: {}, votes: [], timer: 45, messages: [{ id: cryptoId(), userId: "system", username: "System", message: "🌙 Night 1 begins!", timestamp: Date.now(), type: "system" }] };
    setGameState(gs); await persist(gs); await updateRoomStatus(code, "in-game");
    updated.filter(p => p.isBot && p.isAlive && p.role && p.role !== "citizen").forEach((bot, i) => {
      const t = setTimeout(() => {
        setGameState(pg => {
          if (!pg || pg.phase !== "night") return pg;
          const action = botNightAction(bot, pg);
          const na: NightActions = { ...pg.nightActions };
          if (typeof action === "object") {
            if (bot.role === "mafia" && action.mafiaTarget) na.mafiaTarget = action.mafiaTarget;
            if (bot.role === "doctor" && action.doctorTarget) na.doctorTarget = action.doctorTarget;
            if (bot.role === "police" && action.policeTarget) { const tgt = pg.players.find(p => p.id === action.policeTarget); if (tgt) { na.policeTarget = action.policeTarget; na.policeResult = { targetId: tgt.id, isMafia: tgt.role === "mafia" }; } }
          }
          const next = { ...pg, nightActions: na }; persist(next); return next;
        });
      }, 2000 + i * 1800);
      botTimerRef.current.push(t);
    });
  }, [code, isHost, players, persist]);

  const submitAction = useCallback(async (type: "kill" | "save" | "investigate", targetId: string) => {
    sfx.select(); if (!gameState || !myRole || !me) return;
    const na: NightActions = { ...gameState.nightActions };
    if (myRole === "mafia" && type === "kill") na.mafiaTarget = targetId;
    else if (myRole === "doctor" && type === "save") na.doctorTarget = targetId;
    else if (myRole === "police" && type === "investigate") { na.policeTarget = targetId; const t = gameState.players.find(p => p.id === targetId); if (t) na.policeResult = { targetId, isMafia: t.role === "mafia" }; }
    const gs = { ...gameState, nightActions: na }; setGameState(gs); await persist(gs);
  }, [gameState, myRole, me, persist]);

  const castVote = useCallback(async (targetId: string) => {
    sfx.vote(); if (!gameState || !amAlive || gameState.phase !== "day-voting") return;
    const votes = [...gameState.votes.filter(v => v.voterId !== myUid), { voterId: myUid, targetId }];
    const gs = { ...gameState, votes }; setGameState(gs); await persist(gs);
  }, [gameState, amAlive, myUid, persist]);

  const sendMessage = useCallback(async (msg: string) => {
    if (!me || !amAlive || (phase === "night" && myRole !== "mafia")) return;
    await sendChatMessage(code, { id: cryptoId(), userId: me.id, username: me.username, message: msg, type: phase === "night" ? "mafia-chat" as const : "public" as const, avatar: me.avatar });
  }, [code, me, amAlive, phase, myRole]);

  return <Ctx.Provider value={{ gameState, players, messages, phase, timer, round, isHost, myRole, amAlive, winner, startGame, submitAction, castVote, sendMessage }}>{children}</Ctx.Provider>;
}

export function useGameEngine() { const c = useContext(Ctx); if (!c) throw new Error("useGameEngine needs GameEngineProvider"); return c; }
