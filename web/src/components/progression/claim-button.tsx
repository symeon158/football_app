"use client";

import { Check, Gift } from "lucide-react";
import { useState, useTransition } from "react";

import { claimAchievement, claimChallenge, type ClaimResult } from "@/app/(game)/challenges/actions";
import { Coins } from "@/components/game/coins";
import { Button } from "@/components/ui/button";

export function ClaimButton({ kind, id, coins, xp, title }: { kind: "challenge" | "achievement"; id: string; coins: number; xp: number; title: string }) {
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <Check className="size-4" /> +<Coins amount={result.coins ?? coins} className="text-gold" /> · +{result.xp ?? xp} XP
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => setResult(await (kind === "challenge" ? claimChallenge(id) : claimAchievement(id))))}
        className="gap-1.5"
        aria-label={`Claim reward for ${title}`}
      >
        <Gift className="size-3.5" /> {pending ? "Claiming…" : "Claim"}
      </Button>
      {result && !result.ok && <p role="alert" className="text-xs text-destructive">{result.message}</p>}
    </div>
  );
}
