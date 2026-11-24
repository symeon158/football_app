import { Armchair, Dumbbell, Lightbulb, Sprout } from "lucide-react";

import type { StadiumCategory } from "@/lib/game/stadium";

/**
 * Shared by Server and Client Components. Keep it out of "use client"
 * modules: a Server Component importing a plain value from one receives a
 * client reference, not the object (which crashed the history list).
 */
export const CATEGORY_META: Record<StadiumCategory, { label: string; icon: typeof Armchair; effect: string }> = {
  seating: { label: "Seating", icon: Armchair, effect: "More seats → bigger crowds and matchday income" },
  lighting: { label: "Lighting", icon: Lightbulb, effect: "Better floodlights → stronger home advantage" },
  pitch: { label: "Pitch", icon: Sprout, effect: "Better turf → stronger home advantage" },
  facilities: { label: "Facilities", icon: Dumbbell, effect: "Training and recovery → home advantage, roof" },
};
