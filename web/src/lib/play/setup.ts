import type { TeamSheet } from "@/lib/engine/types";
import type { FormationSlot } from "@/lib/game/lineup";

import type { PlaySetup, PlayTeamSetup } from "./types";

/** Kits for the computer opponent; the one most unlike the player's colour is used. */
const AWAY_KITS = [
  { primary: "#d93a3a", secondary: "#ffffff" },
  { primary: "#f2f2f2", secondary: "#1b1b1b" },
  { primary: "#1f6feb", secondary: "#ffffff" },
  { primary: "#f39c12", secondary: "#1d1d1d" },
  { primary: "#7b3fe4", secondary: "#ffffff" },
  { primary: "#111111", secondary: "#e7c35a" },
];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const distance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
};

/** Three-letter scoreboard code: "Giannis FC" → "GIA". */
export const shortCode = (name: string) => (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "TEA").toUpperCase();

function team(sheet: TeamSheet, slots: FormationSlot[], kit: PlayTeamSetup["kit"]): PlayTeamSetup {
  const bySlot = [...slots].sort((a, b) => a.slot - b.slot);
  return {
    name: sheet.name,
    short: shortCode(sheet.name),
    kit,
    players: sheet.starters.map((s, i) => ({
      name: s.player.name,
      role: s.slotPosition,
      slotX: bySlot[i]?.x ?? 50,
      slotY: bySlot[i]?.y ?? 50,
      stats: {
        overall: s.player.overall,
        pace: s.player.pace,
        shooting: s.player.shooting,
        passing: s.player.passing,
        dribbling: s.player.dribbling,
        defending: s.player.defending,
        physicality: s.player.physicality,
      },
    })),
  };
}

const GRASS = "#137034";
/** Keeps a kit readable on the pitch: a grass-coloured shirt swaps to its second colour (or white). */
function readableKit(kit: { primary: string; secondary: string }) {
  if (distance(kit.primary, GRASS) > 9000) return kit;
  if (distance(kit.secondary, GRASS) > 9000) return { primary: kit.secondary, secondary: kit.primary };
  return { primary: "#f2f2f2", secondary: kit.primary };
}

export function buildPlaySetup(args: {
  seed: number;
  home: TeamSheet;
  homeSlots: FormationSlot[];
  homeKit: { primary: string; secondary: string };
  away: TeamSheet;
  awaySlots: FormationSlot[];
}): PlaySetup {
  const homeKit = readableKit(args.homeKit);
  const awayKit = [...AWAY_KITS].sort((a, b) => distance(b.primary, homeKit.primary) - distance(a.primary, homeKit.primary))[0];
  return {
    seed: args.seed,
    teams: [team(args.home, args.homeSlots, homeKit), team(args.away, args.awaySlots, awayKit)],
  };
}
