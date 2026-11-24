"use client";

import { Shield, Swords, Target } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { kickOff, type KickoffState } from "@/app/(game)/matches/actions";
import { Coins } from "@/components/game/coins";
import { Crest } from "@/components/game/crest";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SquadOption = {
  id: string;
  name: string;
  logoTemplate: string;
  primaryColor: string;
  secondaryColor: string;
  formation: string;
  tactic: string;
  isActive: boolean;
  ready: boolean;
  missing: number;
  overall: number | null;
  chemistry: number | null;
};

type Props = {
  squads: SquadOption[];
  idempotencyKey: string; // fresh per page render; a double submit reuses it
  rewards: { difficulty: string; result: string; coins: number; xp: number }[];
  goalBonus: number;
  goalBonusCap: number;
  matchdayIncome: number;
  rewardedLeft: number;
  playsLeft: number;
};

const TACTICS = [
  { value: "balanced", label: "Balanced", icon: Target, hint: "Even focus" },
  { value: "attacking", label: "Attacking", icon: Swords, hint: "More chances both ways" },
  { value: "defensive", label: "Defensive", icon: Shield, hint: "Tighter, fewer chances" },
] as const;

const DIFFICULTIES = [
  { value: "easy", label: "Easy", hint: "Opponent ≈ 5 below you" },
  { value: "normal", label: "Normal", hint: "Evenly matched" },
  { value: "hard", label: "Hard", hint: "Opponent ≈ 5 above you" },
] as const;

const optionClass =
  "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

export function KickoffForm({ squads, idempotencyKey, rewards, goalBonus, goalBonusCap, matchdayIncome, rewardedLeft, playsLeft }: Props) {
  const [state, action, pending] = useActionState<KickoffState, FormData>(kickOff, { ok: false });
  const initial = squads.find((s) => s.isActive) ?? squads[0];
  const [teamId, setTeamId] = useState(initial?.id ?? "");
  const [tactic, setTactic] = useState(initial?.tactic ?? "balanced");
  const [difficulty, setDifficulty] = useState("normal");
  const squad = squads.find((s) => s.id === teamId) ?? initial;
  const reward = (result: string) => rewards.find((r) => r.difficulty === difficulty && r.result === result);
  const canPlay = Boolean(squad?.ready) && playsLeft > 0;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="key" value={idempotencyKey} />

      {/* Squad */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Your team</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {squads.map((s) => (
            <label key={s.id} className={optionClass}>
              <input type="radio" name="teamId" value={s.id} checked={teamId === s.id} onChange={() => { setTeamId(s.id); setTactic(s.tactic); }} className="sr-only" />
              <span className="flex items-center gap-3">
                <Crest template={s.logoTemplate} primary={s.primaryColor} secondary={s.secondaryColor} name={s.name} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}{s.isActive && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary">active</span>}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.ready ? `${s.formation} · Rating ${s.overall} · Chemistry ${s.chemistry}` : `${s.missing} starting place(s) empty`}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
        {squad && !squad.ready && (
          <p className="text-sm text-gold">
            Fill every starting place before kick-off. <Link href={`/team?team=${squad.id}`} className="underline">Open the team builder</Link>
          </p>
        )}
      </fieldset>

      {/* Tactic */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Tactic</legend>
        <div className="grid grid-cols-3 gap-2">
          {TACTICS.map(({ value, label, icon: Icon, hint }) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="tactic" value={value} checked={tactic === value} onChange={() => setTactic(value)} className="sr-only" />
              <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4 text-primary" />{label}</span>
              <span className="text-[11px] text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Difficulty */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Opponent</legend>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map(({ value, label, hint }) => (
            <label key={value} className={optionClass}>
              <input type="radio" name="difficulty" value={value} checked={difficulty === value} onChange={() => setDifficulty(value)} className="sr-only" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[11px] text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Rewards preview */}
      <div className="rounded-xl border bg-background/40 p-3 text-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Rewards</p>
        {rewardedLeft > 0 ? (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(["win", "draw", "loss"] as const).map((r) => (
                <div key={r} className="rounded-lg bg-muted/40 py-2">
                  <dt className="text-[11px] capitalize text-muted-foreground">{r}</dt>
                  <dd className="font-semibold"><Coins amount={reward(r)?.coins ?? 0} className="text-gold" /></dd>
                  <dd className="text-[11px] text-muted-foreground">+{reward(r)?.xp ?? 0} XP</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Plus <Coins amount={goalBonus} className="text-xs" /> per goal (max {goalBonusCap}) and <Coins amount={matchdayIncome} className="text-xs" /> matchday income. {rewardedLeft} rewarded match(es) left today.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">You&apos;ve earned today&apos;s rewards — further matches are friendlies until midnight UTC.</p>
        )}
      </div>

      {state.message && !state.ok && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>}

      <Button type="submit" size="lg" disabled={!canPlay || pending} className="h-12 w-full gap-2 text-base">
        <Swords className="size-5" /> {pending ? "Kicking off…" : playsLeft > 0 ? "Kick off" : "No matches left today"}
      </Button>
      {!canPlay && squad?.ready === false && (
        <Link href={`/team?team=${squad.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Complete your line-up</Link>
      )}
    </form>
  );
}
