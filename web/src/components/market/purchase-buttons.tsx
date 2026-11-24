"use client";

import { Check, PackageOpen, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { buyCard, openPack } from "@/app/(game)/marketplace/actions";
import { Coins } from "@/components/game/coins";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/validation/market";

type Phase = "idle" | "confirm" | "done";

/**
 * Shared two-step purchase flow: click → confirm → server action.
 * One idempotency key per purchase *intent*: it is created when the user
 * opens the confirmation and reused if they retry after an error, so a
 * double-click or flaky network never charges twice. A new purchase gets a
 * new key.
 */
export function usePurchase<R extends { ok: boolean; message?: string }>(action: (key: string) => Promise<R>) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<R | null>(null);
  const [pending, start] = useTransition();
  const key = useRef<string | null>(null);

  return {
    phase,
    result,
    pending,
    ask: () => {
      key.current = newIdempotencyKey();
      setResult(null);
      setPhase("confirm");
    },
    cancel: () => setPhase("idle"),
    confirm: () =>
      start(async () => {
        const r = await action(key.current ?? newIdempotencyKey());
        setResult(r);
        setPhase(r.ok ? "done" : "confirm");
      }),
    again: () => setPhase("idle"),
  };
}

export function BuyButton({
  cardId,
  name,
  price,
  balance,
  className,
  compact,
}: {
  cardId: string;
  name: string;
  price: number;
  balance: number;
  className?: string;
  compact?: boolean;
}) {
  const p = usePurchase((key) => buyCard({ cardId, key }));
  const affordable = balance >= price;

  if (p.phase === "done") {
    return (
      <div role="status" className={cn("flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary", className)}>
        <span className="flex items-center gap-1.5"><Check className="size-4" /> Bought!</span>
        <span className="flex gap-3 text-xs">
          {p.result?.ownershipId && <Link href="/team" className="underline">Add to team</Link>}
          <button type="button" onClick={p.again} className="underline">Buy another</button>
        </span>
      </div>
    );
  }

  if (p.phase === "confirm") {
    return (
      <div className={cn("space-y-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5", className)}>
        <p className="text-sm">
          Buy <span className="font-semibold">{name}</span> for <Coins amount={price} className="text-gold" />?
        </p>
        {p.result && !p.result.ok && <p role="alert" className="text-xs text-destructive">{p.result.message}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={p.confirm} disabled={p.pending} className="flex-1">
            {p.pending ? "Buying…" : "Confirm"}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.cancel} disabled={p.pending}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={p.ask}
      disabled={!affordable}
      variant={affordable ? "default" : "outline"}
      size={compact ? "sm" : "default"}
      className={cn("w-full gap-1.5", className)}
      title={affordable ? undefined : "Not enough Football Coins"}
      aria-label={`Buy ${name} for ${price} Football Coins${affordable ? "" : " (not enough coins)"}`}
    >
      <ShoppingCart className="size-3.5" />
      <Coins amount={price} />
    </Button>
  );
}

export function OpenPackButton({
  packId,
  name,
  price,
  balance,
  remainingToday,
}: {
  packId: string;
  name: string;
  price: number;
  balance: number;
  remainingToday: number;
}) {
  // On success the action redirects to the reveal page.
  const p = usePurchase((key) => openPack({ packId, key }));
  const blocked = remainingToday <= 0 ? "Daily limit reached" : balance < price ? "Not enough coins" : null;

  if (p.phase === "confirm") {
    return (
      <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/10 p-3">
        <p className="text-sm">
          Open a <span className="font-semibold">{name}</span> for <Coins amount={price} className="text-gold" />?
        </p>
        {p.result && !p.result.ok && <p role="alert" className="text-xs text-destructive">{p.result.message}</p>}
        <div className="flex gap-2">
          <Button onClick={p.confirm} disabled={p.pending} className="flex-1 gap-1.5">
            <PackageOpen className="size-4" /> {p.pending ? "Opening…" : "Open pack"}
          </Button>
          <Button variant="ghost" onClick={p.cancel} disabled={p.pending}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <Button onClick={p.ask} disabled={Boolean(blocked)} className="w-full gap-1.5" variant={blocked ? "outline" : "default"}>
      {blocked ?? (
        <>
          <PackageOpen className="size-4" /> Open for <Coins amount={price} />
        </>
      )}
    </Button>
  );
}
