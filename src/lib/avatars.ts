// Avatar system — emoji + color combos, deterministic per user
export const AVATAR_EMOJIS = [
  "🦊", "🐺", "🦁", "🐯", "🦝", "🐻", "🦈", "🦅",
  "🐸", "🦜", "🦋", "🐙", "🦄", "🐲", "🦉", "🐹",
  "🥷", "👻", "🤡", "👾", "🎭", "🕵️", "🧙", "🦸",
  "🤠", "😈", "👿", "🧛", "🧟", "🧜", "🧝", "🎃",
];

export const AVATAR_COLORS = [
  { from: "from-red-500", to: "to-orange-600", text: "text-white" },
  { from: "from-purple-500", to: "to-pink-600", text: "text-white" },
  { from: "from-blue-500", to: "to-cyan-600", text: "text-white" },
  { from: "from-emerald-500", to: "to-teal-600", text: "text-white" },
  { from: "from-amber-500", to: "to-yellow-600", text: "text-white" },
  { from: "from-fuchsia-500", to: "to-rose-600", text: "text-white" },
  { from: "from-indigo-500", to: "to-violet-600", text: "text-white" },
  { from: "from-sky-500", to: "to-blue-600", text: "text-white" },
];

// Get deterministic avatar emoji + color for a user
export function getAvatarStyle(uid: string): {
  emoji: string;
  from: string;
  to: string;
  text: string;
} {
  const hash = Array.from(uid).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const emoji = AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return { emoji, ...color };
}

// List of pre-chosen avatars the user can pick from their profile
export const SELECTABLE_AVATARS = AVATAR_EMOJIS;
