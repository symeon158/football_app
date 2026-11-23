import type { Database } from "@/types/database";

export type Rarity = Database["public"]["Enums"]["card_rarity"];

export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary", "icon"];

/**
 * Visual identity per rarity. Class strings are literal so Tailwind can see
 * them. `frame` = metallic border, `face` = card body, `ink` = main text,
 * `accent` = secondary text and stat labels.
 */
export const RARITY_STYLE: Record<
  Rarity,
  { label: string; frame: string; face: string; ink: string; accent: string; chip: string; glow: string }
> = {
  common: {
    label: "Common",
    frame: "from-zinc-200 via-zinc-400 to-zinc-600",
    face: "from-zinc-600 via-zinc-800 to-zinc-950",
    ink: "text-zinc-50",
    accent: "text-zinc-300",
    chip: "bg-zinc-500/20 text-zinc-200 ring-zinc-400/40",
    glow: "group-hover:shadow-zinc-400/20",
  },
  rare: {
    label: "Rare",
    frame: "from-sky-200 via-sky-400 to-blue-700",
    face: "from-blue-600 via-blue-900 to-slate-950",
    ink: "text-sky-50",
    accent: "text-sky-300",
    chip: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
    glow: "group-hover:shadow-sky-400/30",
  },
  epic: {
    label: "Epic",
    frame: "from-fuchsia-200 via-fuchsia-500 to-purple-800",
    face: "from-purple-600 via-purple-950 to-slate-950",
    ink: "text-fuchsia-50",
    accent: "text-fuchsia-300",
    chip: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
    glow: "group-hover:shadow-fuchsia-400/30",
  },
  legendary: {
    label: "Legendary",
    frame: "from-amber-100 via-yellow-500 to-amber-700",
    face: "from-amber-600 via-amber-900 to-stone-950",
    ink: "text-amber-50",
    accent: "text-amber-200",
    chip: "bg-amber-500/15 text-amber-200 ring-amber-400/50",
    glow: "group-hover:shadow-amber-400/40",
  },
  icon: {
    label: "Icon",
    frame: "from-white via-amber-200 to-amber-500",
    face: "from-stone-50 via-amber-100 to-amber-300",
    ink: "text-stone-900",
    accent: "text-amber-800",
    chip: "bg-amber-100/15 text-amber-50 ring-amber-100/50",
    glow: "group-hover:shadow-amber-100/40",
  },
};

export const OUTFIELD_STAT_LABELS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"] as const;
/** Goalkeeper cards reuse the same six columns as diving, handling, kicking, reflexes, speed, positioning. */
export const GK_STAT_LABELS = ["DIV", "HAN", "KIC", "REF", "SPD", "POS"] as const;
