// Lobby: real-time room management via Firebase
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Crown, Play, LogOut, Send, Users, Lock, Globe, Copy, Check, Bot, Sparkles, ArrowLeft } from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { AmbientBlobs, FloatingParticles } from "./Effects";
import { createRoom, joinPlayer, leaveRoom, kickPlayer, getRoom, getPlayers, onPlayersChanged, sendChatMessage, getMessages, onNewMessage } from "../lib/db";
import { createBot, generateBotNames, cryptoId } from "../lib/gameEngine";
import type { Player, ChatMessage } from "../lib/types";

export function Lobby() {
  const { code } = useParams<{ code: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [roomName, setRoomName] = useState("Loading...");
  const [isPrivate, setIsPrivate] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const currentUserId = user?.uid || "";
  const me = players.find(p => p.id === currentUserId);
  const isHost = me?.isHost ?? false;
  const canStart = players.length >= 6 && isHost;

  // Initialize: load room + join if needed
  useEffect(() => {
    const u = user;
    const c = code;
    if (!u || !c) return;
    const uname = profile?.username || u.username || "Player";
    const uavatar = u.avatar || undefined;
    const init = async () => {
      let room = await getRoom(code);
      if (!room) {
        room = await createRoom(code, "Mafia67 Room", currentUserId, false);
        setRoomName(room.name);
        setIsPrivate(room.isPrivate);
      } else {
        setRoomName(room.name);
        setIsPrivate(room.isPrivate);
      }
      const existing = await getPlayers(code);
      if (!existing.find(p => p.id === currentUserId)) {
        const isHostFlag = existing.length === 0;
        await joinPlayer(code, {
          id: currentUserId, username: uname,
          avatar: uavatar, isHost: isHostFlag, isReady: true,
          isAlive: true, isBot: false, connected: true,
        });
      }
      const msgs = await getMessages(code);
      setMessages(msgs);
    };
    init();
  }, [code, user, profile]);

  // Real-time player updates
  useEffect(() => {
    return onPlayersChanged(code!, (p) => setPlayers(p));
  }, [code]);

  // Real-time messages
  useEffect(() => {
    return onNewMessage(code!, (msg) => setMessages(prev => [...prev, msg]));
  }, [code]);

  // Auto-scroll chat
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  async function sendMessage() {
    if (!chatInput.trim() || !user) return;
    await sendChatMessage(code!, {
      id: cryptoId(), userId: currentUserId, username: profile?.username || user.username,
      message: chatInput.trim(), type: "public", avatar: user.avatar || undefined,
    });
    setChatInput("");
  }

  async function kickPlayerById(id: string) {
    await kickPlayer(code!, id);
    await sendChatMessage(code!, { id: cryptoId(), userId: "system", username: "System", message: "A player was removed from the room.", type: "system" });
  }

  async function addBot() {
    if (players.length >= 12) return;
    const [name] = generateBotNames(1);
    const bot = createBot(`bot_${code}_${cryptoId().slice(0, 6)}`, name);
    await joinPlayer(code!, { ...bot, isAlive: true, connected: true });
  }

  async function fillWithBots() {
    const needed = Math.max(0, 6 - players.length);
    const names = generateBotNames(needed);
    for (const name of names) {
      const bot = createBot(`bot_${code}_${cryptoId().slice(0, 6)}`, name);
      await joinPlayer(code!, { ...bot, isAlive: true, connected: true });
    }
    await sendChatMessage(code!, { id: cryptoId(), userId: "system", username: "System", message: "🤖 Bots joined!", type: "system" });
  }

  function startGame() {
    if (!canStart) return;
    navigate(`/game/${code}`);
  }

  async function leaveRoomFn() {
    await leaveRoom(code!, currentUserId);
    navigate("/");
  }

  function copyCode() {
    navigator.clipboard?.writeText(code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!user) { navigate("/auth"); return null; }

  return (
    <div className="animate-fade-in">
      <AmbientBlobs variant="default" />
      <FloatingParticles variant="default" count={8} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/")} className="mr-2 text-slate-400 hover:text-white"><ArrowLeft size={18} /></button>
            <h1 className="text-2xl font-bold gradient-text">{roomName}</h1>
            <Badge color={isPrivate ? "red" : "green"}>{isPrivate ? <Lock size={10} /> : <Globe size={10} />}{isPrivate ? "Private" : "Public"}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <span>Code:</span>
            <button onClick={copyCode} className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1 font-mono text-xs text-slate-100 hover:bg-white/10">
              {code} {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            <span>•</span>
            <span className="flex items-center gap-1"><Users size={14} /> {players.length}/12</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={leaveRoomFn}><LogOut size={14} /> Leave</Button>
          {isHost ? (canStart ? (
            <Button onClick={startGame}><Play size={14} /> Start Game 🚀</Button>
          ) : (
            <Button onClick={fillWithBots}><Sparkles size={14} /> Add bots & start ({6 - players.length} more)</Button>
          )) : (
            <div className="text-sm text-slate-400">Waiting for host...</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          {isHost && (
            <div className="mb-4 rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="text-xl">🤖</span><div><div className="text-sm font-medium">Play alone?</div><div className="text-xs text-slate-500">{players.filter(p => p.isBot).length} bots in room</div></div></div>
                <Button size="sm" variant="secondary" onClick={addBot} disabled={players.length >= 12}><Bot size={14} /> Add bot</Button>
              </div>
            </div>
          )}
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Players</h2><span className="text-xs text-slate-500">{players.length} / 12</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {players.map((p, i) => (
              <div key={p.id} className="group relative flex flex-col items-center rounded-xl border border-white/5 bg-white/5 p-4 text-center transition hover:border-red-500/30 hover:bg-white/10 hover:-translate-y-1" style={{ animation: `bounceIn 0.4s ${i * 0.06}s cubic-bezier(0.34,1.56,0.64,1) both` }}>
                {p.isHost && <div className="absolute right-2 top-2 text-amber-400"><Crown size={14} /></div>}
                <Avatar name={p.username} src={p.avatar} size={48} />
                <div className="mt-2 text-sm font-medium truncate max-w-full">{p.username}</div>
                <div className="mt-1 flex items-center gap-1 text-xs"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-slate-400">Ready</span></div>
                {p.isBot && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-300"><Bot size={9} /> Bot</div>}
                {isHost && !p.isHost && <button onClick={() => kickPlayerById(p.id)} className="mt-2 text-xs text-red-400 opacity-0 transition group-hover:opacity-100">Remove</button>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 6 - players.length) }).map((_, i) => (
              <button key={`empty-${i}`} onClick={isHost ? addBot : undefined} className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-center transition ${isHost ? "cursor-pointer hover:border-sky-700/60 hover:bg-white/5" : ""}`}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/10 text-slate-600">{isHost ? <Bot size={18} /> : "?"}</div>
                <div className="mt-2 text-xs text-slate-600">{isHost ? "Click to add bot" : "Empty slot"}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex h-[500px] flex-col">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Lobby Chat</h2><span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" /></div>
          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.map(m => (
              <ChatBubble key={m.id} message={m} isMine={m.userId === currentUserId} />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Say something..." className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-red-500/50" />
            <Button size="sm" onClick={sendMessage} disabled={!chatInput.trim()}><Send size={14} /></Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChatBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  if (message.type === "system") return <div className="flex justify-center"><div className="rounded-full bg-white/5 px-3 py-1 text-xs italic text-slate-400">{message.message}</div></div>;
  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.username} src={message.avatar} size={28} />
      <div className={`max-w-[80%] ${isMine ? "items-end" : ""}`}>
        <div className={`text-[11px] font-medium ${isMine ? "text-right" : ""} ${isMine ? "text-red-400" : "text-slate-400"}`}>{message.username}</div>
        <div className={`rounded-xl px-3 py-2 text-sm ${isMine ? "bg-gradient-to-br from-red-600 to-orange-600 text-white" : "bg-white/5 text-slate-100"}`}>{message.message}</div>
      </div>
    </div>
  );
}
