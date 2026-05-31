// Lobby — real-time, Firebase synced, with avatar picker + room expiry timer
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Crown, Play, LogOut, Send, Users, Lock, Globe,
  Copy, Check, Bot, Sparkles, ArrowLeft, Clock, ChevronRight,
} from "lucide-react";
import { Button, Card, Avatar, Badge } from "./ui";
import { useAuth } from "../context/AuthContext";
import { AmbientBlobs, FloatingParticles } from "./Effects";
import {
  createRoom, joinPlayer, leaveRoom, kickPlayer,
  getRoom, getPlayers, onPlayersChanged,
  sendChatMessage, getMessages, onNewMessage, updatePlayer, updateRoomHost,
  deleteRoom, onGameStateChanged,
} from "../lib/db";
import type { GameStateData } from "../lib/db";
import { createBot, generateBotNames, cryptoId } from "../lib/gameEngine";
import { SELECTABLE_AVATARS } from "../lib/avatars";
import { saveProfile, loadProfile } from "../lib/storage";
import type { Player, ChatMessage } from "../lib/types";

const ROOM_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function Lobby() {
  const { code } = useParams<{ code: string }>();
  const { user, profile, setProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [initError, setInitError] = useState<string>("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [roomName, setRoomName] = useState("Loading...");
  const [isPrivate, setIsPrivate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roomCreatedAt, setRoomCreatedAt] = useState<number>(Date.now());
  const [timeLeft, setTimeLeft] = useState(ROOM_EXPIRY_MS);
  const [ready, setReady] = useState(false); // joined + avatar set

  // Avatar picker state
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<string>("");
  const [displayName, setDisplayName] = useState("");

  const chatRef = useRef<HTMLDivElement>(null);

  // Derive uid AFTER auth loads — key fix for "waiting for host"
  const uid = user?.uid ?? "";
  const me = players.find(p => p.id === uid);
  const isHost = me?.isHost ?? false;
  const canStart = players.length >= 6 && isHost;
  // Chosen emoji avatar only (profile is source of truth)
  const currentAvatar = profile?.avatar || pendingAvatar || "";
  const myName = profile?.username || user?.username || "Player";

  useEffect(() => {
    setDisplayName(myName);
  }, [myName]);

  // ── Room expiry countdown ─────────────────────────────────────────────────
  const roomDeletedRef = useRef(false);
  useEffect(() => {
    const tick = setInterval(() => {
      const elapsed = Date.now() - roomCreatedAt;
      const left = Math.max(0, ROOM_EXPIRY_MS - elapsed);
      setTimeLeft(left);
      if (left === 0 && !roomDeletedRef.current) {
        // Room expired — delete it from Firebase and go home
        roomDeletedRef.current = true;
        deleteRoom(code!).catch(console.error);
        navigate("/");
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [roomCreatedAt, navigate, code]);

  // ── Init: join room ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !code) return;

    const uname = profile?.username || user?.username || "Player";
    const avatarToUse = profile?.avatar || undefined; // chosen emoji only

    const init = async () => {
      try {
        const createdByMe = localStorage.getItem(`mafia.createdBy.${code}`) === uid;
        let room = await getRoom(code);
        if (!room) {
          room = await createRoom(code, "Mafia67 Room", uid, false);
        } else if (createdByMe && room.hostId !== uid) {
          // If this browser just created the room, force the creator to be host.
          await updateRoomHost(code, uid);
          room = { ...room, hostId: uid };
        }
        setRoomName(room.name);
        setIsPrivate(room.isPrivate);
        setRoomCreatedAt(room.createdAt);

        const existing = await getPlayers(code);
        const alreadyIn = existing.find(p => p.id === uid);

        // If this browser created the room, remove stale host flags from others.
        if (createdByMe) {
          await Promise.all(existing
            .filter(p => !p.isBot && p.id !== uid && p.isHost)
            .map(p => updatePlayer(code, p.id, { isHost: false }))
          );
        }

        if (!alreadyIn) {
          // First player in OR creator marker = host
          const isHostFlag = createdByMe || existing.filter(p => !p.isBot).length === 0 || room.hostId === uid;
          // Build player object WITHOUT undefined fields (Firebase rejects undefined)
          const newPlayer: Player = {
            id: uid,
            username: uname,
            isHost: isHostFlag,
            isReady: true,
            isAlive: true,
            isBot: false,
            connected: true,
          };
          if (avatarToUse) newPlayer.avatar = avatarToUse;
          await joinPlayer(code, newPlayer);
        } else {
          const updates: Partial<Player> = {};
          if (avatarToUse && alreadyIn.avatar !== avatarToUse) updates.avatar = avatarToUse;
          if (createdByMe && !alreadyIn.isHost) updates.isHost = true;
          if (Object.keys(updates).length) await updatePlayer(code, uid, updates);
        }

        const msgs = await getMessages(code);
        setMessages(msgs);
        setReady(true);
      } catch (err) {
        console.error("Lobby init failed:", err);
        setInitError(err instanceof Error ? err.message : "Failed to join room. Check your Firebase database rules.");
      }
    };

    init();
  }, [uid, code]); // only uid and code — not profile (handled separately)

  // Update avatar in DB when profile changes
  useEffect(() => {
    if (!uid || !code || !profile?.avatar) return;
    updatePlayer(code, uid, { avatar: profile.avatar });
  }, [profile?.avatar, uid, code]);

  // ── Real-time listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    return onPlayersChanged(code, setPlayers);
  }, [code]);

  // Listen for game state changes — auto-navigate when game starts
  const gameStartedRef = useRef(false);
  useEffect(() => {
    if (!code) return;
    return onGameStateChanged(code, (gs: GameStateData | null) => {
      // If game phase is no longer "lobby", the game has started
      if (gs && gs.phase !== "lobby" && !gameStartedRef.current) {
        gameStartedRef.current = true;
        navigate(`/game/${code}`);
      }
    });
  }, [code, navigate]);

  useEffect(() => {
    if (!code) return;
    return onNewMessage(code, msg => setMessages(prev => [...prev, msg]));
  }, [code]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // ── Avatar save ────────────────────────────────────────────────────────────
  async function saveAvatar(emoji: string) {
    setPendingAvatar(emoji);
    setShowAvatarPicker(false);
    // Save to local profile
    if (profile) {
      const updated = { ...profile, avatar: emoji };
      saveProfile(updated);
      setProfile(updated);
    } else if (uid) {
      const prof = loadProfile(uid);
      if (prof) {
        const updated = { ...prof, avatar: emoji };
        saveProfile(updated);
        setProfile(updated);
      }
    }
    // Update in Firebase immediately
    if (uid && code) {
      await updatePlayer(code, uid, { avatar: emoji });
    }
  }

  async function saveDisplayName() {
    const cleanName = displayName.trim();
    if (!cleanName || !uid || !code) return;
    if (profile) {
      const updated = { ...profile, username: cleanName };
      saveProfile(updated);
      setProfile(updated);
    } else {
      const prof = loadProfile(uid);
      if (prof) {
        const updated = { ...prof, username: cleanName };
        saveProfile(updated);
        setProfile(updated);
      }
    }
    await updatePlayer(code, uid, { username: cleanName });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!chatInput.trim() || !uid || !code) return;
    await sendChatMessage(code, {
      id: cryptoId(),
      userId: uid,
      username: myName,
      message: chatInput.trim(),
      type: "public",
      avatar: currentAvatar || undefined,
    });
    setChatInput("");
  }

  // ── Bots ──────────────────────────────────────────────────────────────────
  async function addBot() {
    if (players.length >= 12 || !code) return;
    const [name] = generateBotNames(1);
    const existingNames = new Set(players.map(p => p.username));
    let finalName = name;
    let n = 2;
    while (existingNames.has(finalName)) finalName = `${name}${n++}`;
    const bot = createBot(`bot_${code}_${cryptoId().slice(0, 6)}`, finalName);
    await joinPlayer(code, { ...bot, isAlive: true, connected: true });
  }

  async function fillWithBots() {
    if (!code) return;
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
    await sendChatMessage(code, {
      id: cryptoId(), userId: "system", username: "System",
      message: "🤖 Bots have joined the room!", type: "system",
    });
  }

  async function kickPlayerById(id: string) {
    if (!code) return;
    await kickPlayer(code, id);
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  function startGame() {
    if (!canStart || !code) return;
    navigate(`/game/${code}`);
  }

  async function fillAndStart() {
    await fillWithBots();
    setTimeout(() => { if (code) navigate(`/game/${code}`); }, 800);
  }

  async function leaveRoomFn() {
    if (code && uid) await leaveRoom(code, uid);
    navigate("/");
  }

  function copyCode() {
    navigator.clipboard?.writeText(code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Wait for auth to load before doing anything
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

  // Show error if room init failed (e.g. Firebase rules blocking)
  if (initError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center p-8">
          <div className="text-5xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Couldn't join the room</h2>
          <p className="text-slate-400 text-sm mb-2">{initError}</p>
          <p className="text-xs text-slate-500 mb-5">
            Most likely your Firebase Realtime Database rules are blocking writes.
            Go to Firebase Console → Realtime Database → Rules and set them to test mode.
          </p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  // Format time left
  const hrs = Math.floor(timeLeft / 3600000);
  const mins = Math.floor((timeLeft % 3600000) / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const timeStr = hrs > 0
    ? `${hrs}h ${mins}m`
    : mins > 0
    ? `${mins}m ${secs}s`
    : `${secs}s`;
  const isExpiringSoon = timeLeft < 5 * 60 * 1000; // < 5 min

  return (
    <div className="animate-fade-in">
      <AmbientBlobs variant="default" />
      <FloatingParticles variant="default" count={8} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/")} className="mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Back to home">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl font-bold gradient-text">{roomName}</h1>
            <Badge color={isPrivate ? "red" : "green"}>
              {isPrivate ? <Lock size={10} /> : <Globe size={10} />}
              {isPrivate ? "Private" : "Public"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Code:</span>
              <button onClick={copyCode} className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1 font-mono text-xs text-slate-100 hover:bg-white/10 transition">
                {code}
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
            <span className="flex items-center gap-1"><Users size={13} /> {players.length}/12</span>
            {/* Room expiry */}
            <span className={`flex items-center gap-1 ${isExpiringSoon ? "text-red-400 animate-pulse font-semibold" : "text-slate-500"}`}>
              <Clock size={13} />
              Room expires in {timeStr}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={leaveRoomFn}>
            <LogOut size={14} /> Leave
          </Button>
          {isHost ? (
            canStart ? (
              <Button onClick={startGame}>
                <Play size={14} /> Start Game 🚀
              </Button>
            ) : (
              <Button onClick={fillAndStart}>
                <Sparkles size={14} /> Add bots &amp; start
                <span className="ml-1 text-xs opacity-70">({Math.max(0, 6 - players.length)} needed)</span>
              </Button>
            )
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Waiting for host...
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Left: Avatar picker + Players ───────────────────────────────── */}
        <div className="space-y-4">

          {/* ── YOUR AVATAR (always shown) ──────────────────────────────── */}
          <Card className="border-red-900/20">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Your Game Identity
            </h2>
            <div className="flex items-center gap-4">
              {/* Preview */}
              <button
                onClick={() => setShowAvatarPicker(v => !v)}
                className="relative flex-shrink-0 transition hover:scale-105"
                title="Click to change avatar"
              >
                <Avatar
                  name={myName}
                  src={currentAvatar || undefined}
                  uid={uid}
                  size={64}
                  ring="ring-2 ring-red-500/40"
                />
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 border border-white/10 text-xs">
                  ✏️
                </div>
              </button>

              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Display name
                </label>
                <div className="flex gap-2">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={saveDisplayName}
                    onKeyDown={(e) => e.key === "Enter" && saveDisplayName()}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500/50"
                    placeholder="Your name"
                  />
                  <Button size="sm" variant="secondary" onClick={saveDisplayName}>Save</Button>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {currentAvatar
                    ? `Playing as ${currentAvatar} ${displayName || myName}`
                    : "Pick an avatar to represent you in-game"}
                </div>
                <button
                  onClick={() => setShowAvatarPicker(v => !v)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 transition"
                >
                  {showAvatarPicker ? "Close picker" : "Choose avatar"} <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Emoji grid — slides open */}
            {showAvatarPicker && (
              <div className="mt-4 animate-slide-up">
                <div className="text-xs text-slate-500 mb-2">Pick one — it shows in-game and in chat</div>
                <div className="grid grid-cols-8 gap-1.5 rounded-xl border border-white/5 bg-white/5 p-3">
                  {SELECTABLE_AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => saveAvatar(emoji)}
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
              </div>
            )}
          </Card>

          {/* ── Bot controls (host only) ─────────────────────────────────── */}
          {isHost && (
            <Card className="border-sky-900/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-2xl">🤖</div>
                  <div>
                    <div className="text-sm font-semibold">Play alone?</div>
                    <div className="text-xs text-slate-500">
                      {players.filter(p => p.isBot).length} bot{players.filter(p => p.isBot).length !== 1 ? "s" : ""} in room
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={addBot} disabled={players.length >= 12}>
                    <Bot size={13} /> Add bot
                  </Button>
                  {players.length < 6 && (
                    <Button size="sm" onClick={fillWithBots}>
                      <Sparkles size={13} /> Fill ({6 - players.length} needed)
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* ── Players grid ─────────────────────────────────────────────── */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Players</h2>
              <span className="text-xs text-slate-500">{players.length} / 12</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className={`group relative flex flex-col items-center rounded-xl border p-4 text-center transition hover:-translate-y-1 ${
                    p.id === uid
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-white/5 bg-white/5 hover:border-red-500/20 hover:bg-white/10"
                  }`}
                  style={{ animation: `bounceIn 0.4s ${i * 0.05}s cubic-bezier(0.34,1.56,0.64,1) both` }}
                >
                  {p.isHost && (
                    <div className="absolute right-2 top-2 text-amber-400" title="Host">
                      <Crown size={13} />
                    </div>
                  )}
                  <Avatar name={p.username} src={p.avatar} uid={p.id} size={48} />
                  <div className="mt-2 text-sm font-semibold truncate max-w-full">
                    {p.username}
                    {p.id === uid && <span className="ml-1 text-[10px] text-red-400">(you)</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-400">{p.isHost ? "Host" : "Ready"}</span>
                  </div>
                  {p.isBot && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-300">
                      <Bot size={9} /> Bot
                    </div>
                  )}
                  {isHost && !p.isHost && (
                    <button
                      onClick={() => kickPlayerById(p.id)}
                      className="mt-1 text-xs text-red-400 opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 6 - players.length) }).map((_, i) => (
                <button
                  key={`empty-${i}`}
                  onClick={isHost ? addBot : undefined}
                  className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-center transition ${
                    isHost ? "cursor-pointer hover:border-sky-700/40 hover:bg-white/5" : "cursor-default"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/10 text-slate-600">
                    {isHost ? <Bot size={18} className="text-slate-600" /> : "?"}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {isHost ? "Add bot" : "Waiting..."}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Chat ─────────────────────────────────────────────────────────── */}
        <Card className="flex h-[600px] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Lobby Chat</h2>
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          </div>
          <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.map(m => (
              <ChatBubble key={m.id} message={m} isMine={m.userId === uid} />
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
                <div className="text-3xl">💬</div>
                <div>Say hello!</div>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Say something..."
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-red-500/50 transition"
            />
            <Button size="sm" onClick={sendMessage} disabled={!chatInput.trim()}>
              <Send size={14} />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChatBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-white/5 px-3 py-1 text-xs italic text-slate-400">
          {message.message}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.username} src={message.avatar} uid={message.userId} size={28} />
      <div className={`max-w-[80%] ${isMine ? "items-end" : ""}`}>
        <div className={`text-[11px] font-medium mb-0.5 ${isMine ? "text-right text-red-400" : "text-slate-400"}`}>
          {message.username}
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm ${
          isMine
            ? "bg-gradient-to-br from-red-600 to-orange-600 text-white"
            : "bg-white/5 text-slate-100"
        }`}>
          {message.message}
        </div>
      </div>
    </div>
  );
}
