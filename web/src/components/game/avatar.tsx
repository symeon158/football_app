import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 12 original avatar styles (avatar-01 … avatar-12): gradient + emblem. */
const STYLES: { from: string; to: string; emblem: "none" | "ring" | "stripe" | "star" }[] = [
  { from: "#16a34a", to: "#065f46", emblem: "none" },
  { from: "#2563eb", to: "#1e3a8a", emblem: "ring" },
  { from: "#dc2626", to: "#7f1d1d", emblem: "stripe" },
  { from: "#d97706", to: "#78350f", emblem: "star" },
  { from: "#7c3aed", to: "#3b0764", emblem: "none" },
  { from: "#0891b2", to: "#164e63", emblem: "stripe" },
  { from: "#db2777", to: "#831843", emblem: "ring" },
  { from: "#4b5563", to: "#111827", emblem: "star" },
  { from: "#65a30d", to: "#365314", emblem: "ring" },
  { from: "#ea580c", to: "#7c2d12", emblem: "none" },
  { from: "#0d9488", to: "#134e4a", emblem: "star" },
  { from: "#a16207", to: "#422006", emblem: "stripe" },
];

export const AVATAR_KEYS = STYLES.map((_, i) => `avatar-${String(i + 1).padStart(2, "0")}`);

export function Avatar({ avatarKey, name, className }: { avatarKey: string; name: string; className?: string }) {
  const i = Math.max(0, Math.min(STYLES.length - 1, Number(avatarKey.slice(-2)) - 1 || 0));
  const s = STYLES[i];
  const id = `av-${i}`;
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label={`${name}'s avatar`} className={cn("size-10 shrink-0 rounded-full", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={s.from} />
          <stop offset="1" stopColor={s.to} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${id})`} />
      {s.emblem === "ring" && <circle cx="20" cy="20" r="16" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="2" />}
      {s.emblem === "stripe" && <path d="M0 26 L40 14 L40 20 L0 32Z" fill="#fff" opacity="0.15" />}
      {s.emblem === "star" && <path d="m32 5 1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4Z" fill="#fde68a" opacity="0.9" />}
      <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" style={{ fontFamily: "var(--font-geist-sans)" }}>
        {initials(name)}
      </text>
    </svg>
  );
}
