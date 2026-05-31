// Shared UI primitives used across the app
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";
import { sfx } from "../lib/sound";
import { getAvatarStyle } from "../lib/avatars";

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base font-semibold",
  };
  const variants = {
    primary:
      "bg-gradient-to-r from-red-600 via-red-500 to-orange-600 hover:from-red-500 hover:via-orange-500 hover:to-orange-500 text-white shadow-lg shadow-red-900/40 hover:shadow-red-600/50 hover:shadow-xl",
    secondary:
      "bg-white/5 hover:bg-white/10 text-slate-100 border border-white/10 hover:border-white/20",
    ghost:
      "bg-transparent hover:bg-white/5 text-slate-300 hover:text-white",
    danger:
      "bg-red-900/40 hover:bg-red-900/60 text-red-200 border border-red-800/60 hover:border-red-700",
    outline:
      "bg-transparent hover:bg-white/5 text-slate-200 border border-white/10 hover:border-white/20",
  };

  return (
    <button
      onClick={(e) => { sfx.click(); onClick?.(e); }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 btn-ripple hover:-translate-y-0.5 hover:shadow-lg",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass rounded-2xl p-5 shadow-2xl",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function Input({
  className,
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-red-500/50 focus:bg-white/10 focus:ring-2 focus:ring-red-500/20",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Badge({
  children,
  color = "slate",
  className,
}: {
  children: ReactNode;
  color?: "slate" | "red" | "green" | "purple" | "blue" | "yellow" | "orange" | "cyan";
  className?: string;
}) {
  const colors = {
    slate: "bg-white/5 text-slate-300 border-white/10",
    red: "bg-red-500/10 text-red-300 border-red-500/30",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    yellow: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    orange: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    cyan: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  uid,
  size = 40,
  ring,
}: {
  name: string;
  src?: string | null;
  uid?: string;
  size?: number;
  ring?: string;
}) {
  const seed = uid || name;
  const fallback = getAvatarStyle(seed || "player");

  // We intentionally do not render Google/photo URLs in-game. Mafia67 uses the
  // avatar the player chose; if none exists yet, we show a deterministic emoji.
  const displayAvatar = src && !src.startsWith("http") ? src : fallback.emoji;

  // If src is an emoji avatar (single char/emoji), show it on a colored bg
  if (displayAvatar) {
    const hash = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
    const grads = [
      "from-red-600 to-orange-600",
      "from-purple-600 to-pink-600",
      "from-blue-600 to-cyan-600",
      "from-emerald-600 to-teal-600",
      "from-amber-600 to-yellow-600",
      "from-fuchsia-600 to-rose-600",
      "from-indigo-600 to-violet-600",
      "from-sky-600 to-blue-600",
    ];
    const grad = grads[hash % grads.length];
    return (
      <div
        style={{ width: size, height: size, fontSize: size * 0.52 }}
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br select-none",
          grad,
          ring
        )}
      >
        {displayAvatar}
      </div>
    );
  }

  return null;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="animate-spin rounded-full border-2 border-slate-600 border-t-red-500"
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">{title}</h3>
        {children}
      </div>
    </div>
  );
}
