// Lightweight sound engine using the Web Audio API — no audio files needed.
// Generates retro/arcade-style blips, chimes, and stings procedurally.

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem("mafia.sound", on ? "1" : "0"); } catch {}
}

export function isSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem("mafia.sound");
    if (v !== null) enabled = v === "1";
  } catch {}
  return enabled;
}

interface Note {
  freq: number;
  start: number;     // seconds offset
  dur: number;       // seconds
  type?: OscillatorType;
  gain?: number;
}

function play(notes: Note[]) {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  for (const n of notes) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, now + n.start);
    const peak = n.gain ?? 0.15;
    g.gain.setValueAtTime(0.0001, now + n.start);
    g.gain.exponentialRampToValueAtTime(peak, now + n.start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
    osc.connect(g);
    g.connect(audio.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.dur + 0.02);
  }
}

// --- Sound presets ---
export const sfx = {
  click: () => play([{ freq: 420, start: 0, dur: 0.07, type: "triangle", gain: 0.08 }]),
  hover: () => play([{ freq: 600, start: 0, dur: 0.04, type: "sine", gain: 0.04 }]),

  select: () => play([
    { freq: 523, start: 0, dur: 0.08, type: "square", gain: 0.07 },
    { freq: 784, start: 0.06, dur: 0.1, type: "square", gain: 0.07 },
  ]),

  // Night falls — descending eerie tones
  night: () => play([
    { freq: 392, start: 0, dur: 0.4, type: "sine", gain: 0.12 },
    { freq: 294, start: 0.25, dur: 0.5, type: "sine", gain: 0.12 },
    { freq: 196, start: 0.5, dur: 0.7, type: "sine", gain: 0.14 },
  ]),

  // Day breaks — bright ascending chime
  day: () => play([
    { freq: 523, start: 0, dur: 0.25, type: "triangle", gain: 0.12 },
    { freq: 659, start: 0.15, dur: 0.25, type: "triangle", gain: 0.12 },
    { freq: 784, start: 0.3, dur: 0.4, type: "triangle", gain: 0.14 },
  ]),

  // Vote cast
  vote: () => play([
    { freq: 330, start: 0, dur: 0.08, type: "square", gain: 0.08 },
    { freq: 494, start: 0.07, dur: 0.12, type: "square", gain: 0.08 },
  ]),

  // Someone eliminated — dramatic sting
  death: () => play([
    { freq: 220, start: 0, dur: 0.15, type: "sawtooth", gain: 0.12 },
    { freq: 165, start: 0.12, dur: 0.3, type: "sawtooth", gain: 0.12 },
    { freq: 110, start: 0.3, dur: 0.5, type: "sawtooth", gain: 0.14 },
  ]),

  // Saved! happy bell
  saved: () => play([
    { freq: 659, start: 0, dur: 0.12, type: "sine", gain: 0.12 },
    { freq: 880, start: 0.1, dur: 0.12, type: "sine", gain: 0.12 },
    { freq: 1175, start: 0.2, dur: 0.3, type: "sine", gain: 0.14 },
  ]),

  // Victory fanfare
  win: () => play([
    { freq: 523, start: 0, dur: 0.15, type: "square", gain: 0.12 },
    { freq: 659, start: 0.15, dur: 0.15, type: "square", gain: 0.12 },
    { freq: 784, start: 0.3, dur: 0.15, type: "square", gain: 0.12 },
    { freq: 1047, start: 0.45, dur: 0.4, type: "square", gain: 0.15 },
  ]),

  // Defeat
  lose: () => play([
    { freq: 392, start: 0, dur: 0.2, type: "sawtooth", gain: 0.12 },
    { freq: 311, start: 0.2, dur: 0.2, type: "sawtooth", gain: 0.12 },
    { freq: 233, start: 0.4, dur: 0.5, type: "sawtooth", gain: 0.14 },
  ]),

  // Role reveal — magical shimmer
  reveal: () => play([
    { freq: 784, start: 0, dur: 0.1, type: "triangle", gain: 0.1 },
    { freq: 988, start: 0.08, dur: 0.1, type: "triangle", gain: 0.1 },
    { freq: 1319, start: 0.16, dur: 0.2, type: "triangle", gain: 0.12 },
    { freq: 1568, start: 0.28, dur: 0.3, type: "sine", gain: 0.1 },
  ]),

  message: () => play([{ freq: 660, start: 0, dur: 0.05, type: "sine", gain: 0.05 }]),

  countdown: () => play([{ freq: 880, start: 0, dur: 0.08, type: "square", gain: 0.08 }]),
};
