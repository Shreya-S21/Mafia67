// Top navigation bar + app shell
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Users, Trophy, User as UserIcon, LogOut, Home, Crown, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Avatar, Button } from "./ui";
import { cn } from "../utils/cn";
import { AmbientBlobs } from "./Effects";
import { sfx, isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { useState } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const [soundOn, setSoundState] = useState(isSoundEnabled());

  function toggleSound() {
    const next = !soundOn;
    setSoundState(next);
    setSoundEnabled(next);
    if (next) sfx.click();
  }
  const { user, signOutUser, profile } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen text-slate-100">
      <AmbientBlobs variant="default" />
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#05050a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-orange-600 shadow-lg shadow-red-900/40">
              <span className="text-lg">🎭</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-lg font-bold leading-tight">
                <span className="gradient-text">MAFIA67</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Social Deduction
              </div>
            </div>
          </Link>

          {user && (
            <nav className="flex items-center gap-1">
              <NavLink to="/" icon={<Home size={16} />} label="Home" active={location.pathname === "/"} />
              <NavLink
                to="/leaderboard"
                icon={<Trophy size={16} />}
                label="Leaderboard"
                active={location.pathname === "/leaderboard"}
              />
              <NavLink
                to="/profile"
                icon={<UserIcon size={16} />}
                label="Profile"
                active={location.pathname === "/profile"}
              />
            </nav>
          )}

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden items-center gap-2 sm:flex">
                  <Avatar
                    name={profile?.username || user.username}
                    src={profile?.avatar}
                    uid={user.uid}
                    size={32}
                  />
                  <div className="text-right">
                    <div className="text-sm font-medium">{profile?.username || user.username}</div>
                    <div className="text-xs text-amber-400 flex items-center gap-1 justify-end">
                      <Crown size={10} />
                      {profile?.totalPoints ?? 0} pts
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={signOutUser} title="Sign out">
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button size="sm">
                  <Users size={14} /> Sign In
                </Button>
              </Link>
            )}
            <button
              onClick={toggleSound}
              className="rounded-lg border border-white/5 bg-white/5 p-2 transition hover:bg-white/10"
              title="Toggle sound"
            >
              {soundOn ? <Volume2 size={14} className="text-emerald-400" /> : <VolumeX size={14} className="text-slate-500" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-slate-800 text-red-400"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
