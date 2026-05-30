// Authentication page: always shows email/password + Google options.
// When Firebase keys aren't configured, the same UI gracefully falls back
// to local demo mode (no backend needed).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User as UserIcon, Loader2, Info } from "lucide-react";
import { Button, Card, Input } from "./ui";
import { useAuth } from "../context/AuthContext";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  isFirebaseConfigured,
} from "../lib/firebase";

export function AuthPage() {
  const { signInDemo } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const demoMode = !isFirebaseConfigured;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // ---------- DEMO MODE (no Firebase keys set) ----------
      if (demoMode) {
        const handle =
          (mode === "signup" ? username : email.split("@")[0] || username || "").trim();
        if (handle.length < 3) {
          setError("Username must be at least 3 characters");
          setLoading(false);
          return;
        }
        signInDemo(handle);
        navigate("/");
        return;
      }

      // ---------- REAL FIREBASE MODE ----------
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        if (username.trim().length < 3) {
          setError("Username must be at least 3 characters");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters");
          setLoading(false);
          return;
        }
        await signUpWithEmail(email, password, username.trim());
      }
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)/, ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);

    try {
      // Demo mode: create a demo user with a Google-ish name
      if (demoMode) {
        const name = username.trim() || email.split("@")[0] || `Guest${Math.floor(Math.random() * 1000)}`;
        signInDemo(name.length >= 3 ? name : `Player${Math.floor(Math.random() * 1000)}`);
        navigate("/");
        return;
      }

      await signInWithGoogle();
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center animate-fade-in">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-orange-600">
            <span className="text-2xl">🎭</span>
          </div>
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "signin"
              ? "Sign in to continue your game"
              : "Join the town (or the Mafia)"}
          </p>
        </div>

        {/* Demo mode banner — always visible when keys aren't set */}
        {demoMode && (
          <div className="mb-5 flex gap-2 rounded-lg border border-sky-800/40 bg-sky-950/30 p-3 text-xs text-sky-200">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <strong className="font-semibold">Demo mode</strong> — No Firebase keys detected.
              You'll sign in locally. Add <code className="rounded bg-slate-900 px-1 text-[11px]">VITE_FIREBASE_*</code>{" "}
              env vars on your host to enable real auth.
            </div>
          </div>
        )}

        {/* Google button — always visible */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {demoMode ? "Continue with Google (Demo)" : "Continue with Google"}
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-slate-500">Or with email</span>
          </div>
        </div>

        {/* Email / password form — always visible */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_handle"
              autoFocus
            />
          )}
          <Input
            label={demoMode ? "Email or username" : "Email"}
            type={demoMode ? "text" : "email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={demoMode ? "e.g. ShadowFox" : "you@example.com"}
            required
          />
          <Input
            label={demoMode ? "Password (ignored in demo)" : "Password"}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required={!demoMode}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            {demoMode
              ? mode === "signin" ? "Continue in Demo Mode" : "Create Demo Account"
              : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-400">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            className="font-medium text-red-400 hover:text-red-300"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-500">
          <div className="mb-2 flex justify-center gap-1 text-slate-400">
            <Lock size={12} /> Secure • <Mail size={12} /> JWT • <UserIcon size={12} /> Private
          </div>
          By playing, you agree to bluff, deceive, and be deceived.
        </div>
      </Card>
    </div>
  );
}
