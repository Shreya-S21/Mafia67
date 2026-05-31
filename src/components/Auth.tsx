// Authentication page — clean 2-step signup with avatar picker built in
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User as UserIcon, Loader2, Info, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button, Card, Input, Avatar } from "./ui";
import { useAuth } from "../context/AuthContext";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, isFirebaseConfigured } from "../lib/firebase";
import { SELECTABLE_AVATARS } from "../lib/avatars";
import { saveProfile, loadProfile, createProfile } from "../lib/storage";

type Mode = "signin" | "signup-step1" | "signup-step2";

export function AuthPage() {
  const { signInDemo, setProfile } = useAuth();
  const navigate = useNavigate();
  const demoMode = !isFirebaseConfigured;

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Step 1: fill username + pick avatar ── then proceed to Step 2
  function goToStep2() {
    setError("");
    const name = username.trim();
    if (name.length < 2) { setError("Username must be at least 2 characters"); return; }
    if (!selectedAvatar) { setError("Please pick an avatar to continue"); return; }
    setError("");
    setMode("signup-step2");
  }

  // ── Final submit (sign up) ──
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (demoMode) {
        signInDemo(username.trim(), selectedAvatar);
        navigate("/"); return;
      }
      if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
      const cred = await signUpWithEmail(email, password, username.trim());
      if (cred.user) {
        const prof = loadProfile(cred.user.uid)
          ?? createProfile(cred.user.uid, username.trim(), email, undefined);
        const updated = { ...prof, avatar: selectedAvatar };
        saveProfile(updated);
        setProfile(updated);
      }
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "").trim());
    } finally { setLoading(false); }
  }

  // ── Sign in ──
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (demoMode) {
        const name = email.trim() || "Player";
        signInDemo(name, selectedAvatar);
        navigate("/"); return;
      }
      await signInWithEmail(email, password);
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "").trim());
    } finally { setLoading(false); }
  }

  // ── Google ──
  async function handleGoogle() {
    setError(""); setLoading(true);
    try {
      if (demoMode) {
        const name = username.trim() || `Player${Math.floor(Math.random() * 9999)}`;
        signInDemo(name, selectedAvatar);
        navigate("/"); return;
      }
      const cred = await signInWithGoogle();
      // If the user came through signup step 1, keep the chosen username/avatar
      // instead of Google's display name/photo.
      if (cred.user && username.trim() && selectedAvatar) {
        const prof = loadProfile(cred.user.uid)
          ?? createProfile(cred.user.uid, username.trim(), cred.user.email ?? undefined, undefined);
        const updated = { ...prof, username: username.trim(), avatar: selectedAvatar };
        saveProfile(updated);
        setProfile(updated);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally { setLoading(false); }
  }

  const previewName = username || "You";

  return (
    <div className="flex min-h-[80vh] items-center justify-center animate-fade-in px-4 py-8">
      <Card className="w-full max-w-md overflow-hidden p-0">

        {/* ── Top brand bar ── */}
        <div className="bg-gradient-to-r from-red-600/20 via-orange-600/10 to-transparent px-8 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-orange-600 shadow-lg shadow-red-900/40 text-xl">
              🎭
            </div>
            <div>
              <div className="text-sm font-bold gradient-text">MAFIA67</div>
              <div className="text-xs text-slate-500">Social Deduction Game</div>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Demo banner */}
          {demoMode && (
            <div className="mb-5 flex gap-2 rounded-xl border border-sky-800/40 bg-sky-950/30 p-3 text-xs text-sky-200">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span><strong>Demo mode</strong> — Firebase keys not set. Playing locally with AI bots.</span>
            </div>
          )}

          {/* ════════════════════════════════════
              SIGN IN
          ════════════════════════════════════ */}
          {mode === "signin" && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold mb-1">Welcome back 👋</h1>
              <p className="text-sm text-slate-400 mb-6">Sign in to rejoin the game</p>

              {/* Google */}
              <GoogleBtn onClick={handleGoogle} loading={loading} demoMode={demoMode} />
              <Divider />

              <form onSubmit={handleSignIn} className="space-y-3">
                <Input label="Email" type={demoMode ? "text" : "email"} value={email} onChange={e => setEmail(e.target.value)} placeholder={demoMode ? "Your username" : "you@example.com"} required autoFocus />
                {!demoMode && (
                  <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                )}
                {error && <ErrorBox msg={error} />}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={15} /> : <ArrowRight size={15} />}
                  {demoMode ? "Enter as Guest" : "Sign In"}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-slate-400">
                No account?{" "}
                <button onClick={() => { setMode("signup-step1"); setError(""); }} className="font-semibold text-red-400 hover:text-red-300">
                  Create one →
                </button>
              </p>
            </div>
          )}

          {/* ════════════════════════════════════
              SIGN UP — STEP 1: Username + Avatar
          ════════════════════════════════════ */}
          {mode === "signup-step1" && (
            <div className="animate-fade-in">
              <button onClick={() => { setMode("signin"); setError(""); }} className="mb-4 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition">
                <ArrowLeft size={13} /> Back to sign in
              </button>

              <h1 className="text-2xl font-bold mb-1">Create your identity</h1>
              <p className="text-sm text-slate-400 mb-6">Step 1 of 2 — choose a name and avatar</p>

              {/* Username */}
              <div className="mb-5">
                <Input
                  label="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. ShadowFox"
                  autoFocus
                />
              </div>

              {/* Avatar picker — ALWAYS VISIBLE on signup step 1 */}
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Pick your avatar <span className="text-red-400">*</span>
                </div>

                {/* Preview row */}
                <div className="flex items-center gap-4 mb-3 p-3 rounded-xl border border-white/5 bg-white/5">
                  <Avatar
                    name={previewName}
                    src={selectedAvatar || undefined}
                    uid={previewName}
                    size={56}
                    ring={selectedAvatar ? "ring-2 ring-red-500/50" : "ring-2 ring-white/10"}
                  />
                  <div>
                    <div className="font-semibold text-sm">
                      {selectedAvatar ? `${selectedAvatar} ${username || "You"}` : username || "Your name here"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {selectedAvatar ? "Looking good! 🔥" : "Select an avatar below"}
                    </div>
                  </div>
                  {selectedAvatar && (
                    <div className="ml-auto">
                      <Check size={18} className="text-emerald-400" />
                    </div>
                  )}
                </div>

                {/* Emoji grid — always open */}
                <div className="grid grid-cols-8 gap-1.5 p-3 rounded-xl border border-white/5 bg-white/5">
                  {SELECTABLE_AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emoji)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:scale-110 ${
                        selectedAvatar === emoji
                          ? "bg-red-500/30 ring-2 ring-red-500/60 scale-110"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {error && <ErrorBox msg={error} />}

              <Button className="w-full" onClick={goToStep2} disabled={!username.trim() || !selectedAvatar}>
                <ArrowRight size={15} />
                {selectedAvatar ? `Continue as ${selectedAvatar} ${username || ""}` : "Choose an avatar to continue"}
              </Button>

              <p className="mt-5 text-center text-sm text-slate-400">
                Already have an account?{" "}
                <button onClick={() => { setMode("signin"); setError(""); }} className="font-semibold text-red-400 hover:text-red-300">
                  Sign in →
                </button>
              </p>
            </div>
          )}

          {/* ════════════════════════════════════
              SIGN UP — STEP 2: Email + Password
          ════════════════════════════════════ */}
          {mode === "signup-step2" && (
            <div className="animate-fade-in">
              <button onClick={() => { setMode("signup-step1"); setError(""); }} className="mb-4 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition">
                <ArrowLeft size={13} /> Back
              </button>

              <h1 className="text-2xl font-bold mb-1">Almost there!</h1>
              <p className="text-sm text-slate-400 mb-6">Step 2 of 2 — set your login details</p>

              {/* Selected identity recap */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <Avatar name={username} src={selectedAvatar} uid={username} size={44} ring="ring-2 ring-emerald-500/40" />
                <div>
                  <div className="font-semibold">{selectedAvatar} {username}</div>
                  <div className="text-xs text-slate-500">Your identity is set</div>
                </div>
                <button onClick={() => setMode("signup-step1")} className="ml-auto text-xs text-slate-500 hover:text-slate-300">
                  Change
                </button>
              </div>

              {/* Google sign up option */}
              <GoogleBtn onClick={handleGoogle} loading={loading} demoMode={demoMode} label="Sign up with Google" />
              <Divider />

              {demoMode ? (
                // Demo: no email needed
                <>
                  <Button className="w-full" onClick={() => { signInDemo(username.trim(), selectedAvatar); navigate("/"); }}>
                    <Check size={15} /> Create Demo Account
                  </Button>
                </>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
                  <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required />
                  {error && <ErrorBox msg={error} />}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" size={15} /> : "🎭"}
                    Create Account
                  </Button>
                </form>
              )}

              <p className="mt-5 text-center text-sm text-slate-400">
                Already have an account?{" "}
                <button onClick={() => { setMode("signin"); setError(""); }} className="font-semibold text-red-400 hover:text-red-300">
                  Sign in →
                </button>
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 border-t border-white/5 pt-4 text-center text-[11px] text-slate-600">
            <div className="flex justify-center gap-3 mb-1">
              <span className="flex items-center gap-1"><Lock size={9} /> Secure</span>
              <span className="flex items-center gap-1"><Mail size={9} /> Private</span>
              <span className="flex items-center gap-1"><UserIcon size={9} /> No spam</span>
            </div>
            By playing, you agree to bluff, deceive, and be deceived.
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────
function GoogleBtn({ onClick, loading, demoMode, label }: { onClick: () => void; loading: boolean; demoMode: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
    >
      <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {label ?? (demoMode ? "Continue with Google (Demo)" : "Continue with Google")}
    </button>
  );
}

function Divider() {
  return (
    <div className="relative mb-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-slate-900 px-2 text-slate-500">Or</span>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
      <span className="flex-shrink-0 mt-0.5">⚠️</span>
      <span>{msg}</span>
    </div>
  );
}
