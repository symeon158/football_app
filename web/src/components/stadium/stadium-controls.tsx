"use client";

import { ArrowUp, Check, Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { updateStadium, upgradeStadium, type StadiumActionResult } from "@/app/(game)/stadium/actions";
import { Coins } from "@/components/game/coins";
import { StadiumIllustration } from "@/components/game/stadium-illustration";
import { usePurchase } from "@/components/market/purchase-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DESIGN_INFO, DESIGNS, MAX_STADIUM_LEVEL, type StadiumCategory, type StadiumDesign, type StadiumLevels, type UpgradeCost } from "@/lib/game/stadium";
import { cn } from "@/lib/utils";

import { CATEGORY_META } from "./category-meta";


/** One upgrade category: level meter, current/next tier and a confirm-to-pay button. */
export function UpgradePanel({
  category,
  level,
  current,
  next,
  balance,
}: {
  category: StadiumCategory;
  level: number;
  current: UpgradeCost | null; // null at level 1 (base)
  next: UpgradeCost | null; // null at max level
  balance: number;
}) {
  const { label, icon: Icon, effect } = CATEGORY_META[category];
  const p = usePurchase((key) => upgradeStadium({ category, expectedLevel: level, key }));
  const affordable = next ? balance >= next.cost : false;

  return (
    <li className="flex flex-col rounded-2xl border bg-card/70 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gold/15 text-gold"><Icon className="size-4.5" /></span>
          <div>
            <h3 className="font-semibold">{label}</h3>
            <p className="text-xs text-muted-foreground">{effect}</p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {level}<span className="text-muted-foreground">/{MAX_STADIUM_LEVEL}</span>
        </span>
      </div>

      {/* Level pips */}
      <div className="mt-3 grid grid-cols-5 gap-1" role="img" aria-label={`${label} level ${level} of ${MAX_STADIUM_LEVEL}`}>
        {Array.from({ length: MAX_STADIUM_LEVEL }, (_, i) => (
          <span key={i} className={cn("h-2 rounded-full", i < level ? "bg-gold" : "bg-muted")} />
        ))}
      </div>

      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">Now: </span>
        {current ? current.description : "Basic"}
      </p>

      <div className="mt-auto pt-4">
        {!next ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-sm font-medium text-gold"><Check className="size-4" /> Fully upgraded</p>
        ) : p.phase === "confirm" ? (
          <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5">
            <p className="text-sm">Upgrade to <span className="font-semibold">{next.description}</span> for <Coins amount={next.cost} className="text-gold" />?</p>
            {p.result && !p.result.ok && <p role="alert" className="text-xs text-destructive">{p.result.message}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={p.confirm} disabled={p.pending} className="flex-1">{p.pending ? "Building…" : "Confirm"}</Button>
              <Button size="sm" variant="ghost" onClick={p.cancel} disabled={p.pending}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {p.phase === "done" && p.result?.ok && <p role="status" className="mb-2 text-sm font-medium text-primary">{p.result.message}</p>}
            <div className="rounded-lg bg-background/40 p-2.5 text-sm">
              <p><span className="text-muted-foreground">Next: </span>{next.description}</p>
              <p className="mt-0.5 text-xs text-primary">+{next.bonus_pct}% home advantage</p>
            </div>
            <Button
              onClick={p.ask}
              disabled={!affordable}
              variant={affordable ? "default" : "outline"}
              className="mt-2 w-full gap-1.5"
              aria-label={`Upgrade ${label} to level ${level + 1} for ${next.cost} Football Coins${affordable ? "" : " (not enough coins)"}`}
            >
              <ArrowUp className="size-4" /> {affordable ? "Upgrade" : "Not enough coins"} · <Coins amount={next.cost} />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Rename the stadium and pick one of four original designs (free). */
export function StadiumIdentity({ name, design, levels }: { name: string; design: StadiumDesign; levels: StadiumLevels }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDesign, setDraftDesign] = useState<StadiumDesign>(design);
  const [result, setResult] = useState<StadiumActionResult | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setDraftName(name); setDraftDesign(design); setResult(null); setEditing(true); }}>
          <Pencil className="size-3.5" /> Rename &amp; style
        </Button>
        {result?.ok && <span role="status" className="text-sm text-primary">{result.message}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateStadium({ name: draftName, design: draftDesign });
          setResult(r);
          if (r.ok) setEditing(false);
        });
      }}
      className="space-y-4 rounded-2xl border bg-card/70 p-4 backdrop-blur"
    >
      <label className="block text-xs font-medium text-muted-foreground">
        Stadium name
        <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} required minLength={3} maxLength={40} className="mt-1 h-10 max-w-md text-base text-foreground" />
      </label>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Design</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DESIGNS.map((d) => (
            <label key={d} className="cursor-pointer rounded-xl border p-2 transition has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name="design" value={d} checked={draftDesign === d} onChange={() => setDraftDesign(d)} className="sr-only" />
              <span className="block overflow-hidden rounded-lg bg-gradient-to-b from-slate-950 to-slate-900">
                <StadiumIllustration levels={levels} design={d} title={`${DESIGN_INFO[d].label} design preview`} />
              </span>
              <span className="mt-1.5 block text-sm font-medium">{DESIGN_INFO[d].label}</span>
              <span className="block text-[11px] text-muted-foreground">{DESIGN_INFO[d].description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {result && !result.ok && <p role="alert" className="text-sm text-destructive">{result.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  );
}
