// Dynamic animated backgrounds — blobs, floating particles, sparkles
import { useEffect, useState, useRef } from "react";

/* ── Ambient background blobs (pure CSS, no render cost) ── */
export function AmbientBlobs({ variant = "default" }: { variant?: "default" | "night" | "day" | "celebrate" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const gradients: Record<string, string[]> = {
    default: [
      "from-red-600/15 via-transparent to-transparent",
      "from-purple-600/15 via-transparent to-transparent",
      "from-orange-600/10 via-transparent to-transparent",
    ],
    night: [
      "from-indigo-600/20 via-transparent to-transparent",
      "from-purple-700/20 via-transparent to-transparent",
      "from-blue-600/15 via-transparent to-transparent",
    ],
    day: [
      "from-amber-500/15 via-transparent to-transparent",
      "from-yellow-500/10 via-transparent to-transparent",
      "from-orange-500/15 via-transparent to-transparent",
    ],
    celebrate: [
      "from-red-500/20 via-transparent to-transparent",
      "from-yellow-400/15 via-transparent to-transparent",
      "from-green-400/15 via-transparent to-transparent",
      "from-blue-400/15 via-transparent to-transparent",
      "from-purple-500/20 via-transparent to-transparent",
    ],
  };

  const blobs = gradients[variant] ?? gradients.default;

  return (
    <div className="bg-blobs pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
      {blobs.map((g, i) => (
        <div
          key={i}
          className={`absolute rounded-full bg-gradient-to-br ${g} blur-[120px]`}
          style={{
            width: `${300 + i * 100}px`,
            height: `${300 + i * 100}px`,
            top: `${(i * 25) % 100}%`,
            left: `${(i * 30 + 10) % 80}%`,
            opacity: mounted ? 0.15 : 0,
            transition: "opacity 2s ease",
            animation: `blobFloat${(i % 2) + 1} ${20 + i * 5}s ease-in-out ${i * 3}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Floating emoji/character particles ── */
const PARTICLE_SETS = {
  default: ["·", "✦", "✧", "·", "✦", "·", "✧", "·"],
  night: ["✦", "✧", "⭐", "🌟", "✦", "·", "✧", "·", "✨", "🌙"],
  day: ["☁️", "✨", "·", "☀️", "·", "✨", "·", "☁️", "🌤️"],
  celebrate: ["🎉", "🥳", "🎊", "✨", "🌟", "💫", "🎆", "🎇", "⭐", "🔥"],
  heart: ["❤️", "💕", "💖", "💗", "💘", "💝"],
};

export function FloatingParticles({
  variant = "default",
  count = 16,
}: {
  variant?: string;
  count?: number;
}) {
  const set = PARTICLE_SETS[variant as keyof typeof PARTICLE_SETS] ?? PARTICLE_SETS.default;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 6.4 + (i % 5) * 3.7) % 100;
        const delay = (i * 0.9) % 8;
        const duration = 8 + (i % 6) * 2;
        const size = 10 + (i % 5) * 4;
        return (
          <span
            key={i}
            className="absolute opacity-20 select-none"
            style={{
              left: `${left}%`,
              top: "110%",
              fontSize: `${size}px`,
              animation: `floatUp ${duration}s linear ${delay}s infinite`,
            }}
          >
            {set[i % set.length]}
          </span>
        );
      })}
    </div>
  );
}

/* ── Sparkle burst on click (canvas overlay) ── */
export function SparkleBurst({ fire }: { fire: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (fire === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#ef4444", "#f97316", "#facc15", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff"];
    const x = posRef.current.x || canvas.width / 2;
    const y = posRef.current.y || canvas.height / 2;
    const count = 20;
    const sparks = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
      };
    });

    let frame = 0;
    let raf = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      sparks.forEach((s) => {
        if (s.life <= 0) return;
        alive = true;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.1;
        s.vx *= 0.98;
        s.life -= s.decay;
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
        ctx.fill();
        // glow
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      });
      frame++;
      if (alive && frame < 120) raf = requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[99]"
      onClick={(e) => {
        posRef.current = { x: e.clientX, y: e.clientY };
      }}
    />
  );
}

/* ── Confetti burst (canvas) ── */
export function Confetti({ fire }: { fire: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#ef4444", "#f97316", "#facc15", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
    const pieces = Array.from({ length: 200 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 300,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 20,
      vy: Math.random() * -18 - 4,
      size: Math.random() * 10 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 24,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }));

    let frame = 0;
    let raf = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.4;
        p.vx *= 0.99;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 160);
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (frame < 170) raf = requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  if (!fire) return null;
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[100]" />;
}
