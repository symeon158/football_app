import { Armchair, Dumbbell, Lightbulb, Sprout } from "lucide-react";

import type { StadiumCategory } from "@/lib/game/stadium";

/**
 * Shared by Server and Client Components. Keep it out of "use client"
 * modules: a Server Component importing a plain value from one receives a
 * client reference, not the object (which crashed the history list).
 */
export const CATEGORY_META: Record<StadiumCategory, { label: string; icon: typeof Armchair; effect: string; base: string }> = {
  seating: { label: "Stands & supporters", icon: Armchair, effect: "More supporters → matchday income", base: "Fans along the fence — 5,000 supporters" },
  lighting: { label: "Floodlights", icon: Lightbulb, effect: "Play under the lights → home advantage", base: "One street lamp" },
  pitch: { label: "Surface", icon: Sprout, effect: "From concrete to grass → home advantage", base: "Concrete court" },
  facilities: { label: "Clubhouse", icon: Dumbbell, effect: "Changing rooms to sports centre → home advantage", base: "Changing in the car park" },
};
