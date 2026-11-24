import { ArrowLeft, GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Panel } from "@/components/dashboard/panel";
import { Coins } from "@/components/game/coins";
import { PlayerCard } from "@/components/game/player-card";
import { TiltCard } from "@/components/game/tilt-card";
import { AttributeMeters, Stars } from "@/components/players/attribute-meters";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCardDetail } from "@/lib/data/collection";
import { getViewer } from "@/lib/data/viewer";
import { formatNumber } from "@/lib/format";
import { ageOn, countryName, parseCareer, toCardData } from "@/lib/game/player";
import { RARITY_STYLE } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation/collection";

export const metadata: Metadata = { title: "Player" };

const POSITION_NAMES: Record<string, string> = {
  GK: "Goalkeeper", CB: "Centre-back", LB: "Left-back", RB: "Right-back", CDM: "Defensive midfielder",
  CM: "Central midfielder", CAM: "Attacking midfielder", LM: "Left midfielder", RM: "Right midfielder",
  LW: "Left winger", RW: "Right winger", ST: "Striker",
};

export default function PlayerPage({ params }: PageProps<"/players/[id]">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/collection" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Collection
      </Link>
      <Suspense fallback={<PlayerSkeleton />}>
        <PlayerContent params={params} />
      </Suspense>
    </div>
  );
}

async function PlayerContent({ params }: Pick<PageProps<"/players/[id]">, "params">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const viewer = await getViewer();
  const detail = await getCardDetail(viewer.userId, id);
  if (!detail) notFound();

  const { card, copies } = detail;
  const style = RARITY_STYLE[card.rarity ?? "common"];
  const position = card.position ?? "";
  const career = parseCareer(card.career_summary);
  const totals = career.reduce((t, c) => ({ apps: t.apps + c.appearances, goals: t.goals + c.goals }), { apps: 0, goals: 0 });
  const now = new Date();

  const facts = [
    { label: "Position", value: POSITION_NAMES[position] ?? position },
    { label: "Nationality", value: countryName(card.nationality ?? "") },
    { label: "Club", value: card.club },
    { label: "Age", value: card.birth_date ? `${ageOn(card.birth_date, now)}` : "—" },
    { label: "Height", value: card.height_cm ? `${card.height_cm} cm` : "—" },
    { label: "Preferred foot", value: <span className="capitalize">{card.preferred_foot}</span> },
    { label: "Weak foot", value: <Stars value={card.weak_foot ?? 0} label="Weak foot" /> },
    { label: "Skill moves", value: <Stars value={card.skill_moves ?? 0} label="Skill moves" /> },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
      {/* ---------------------------------------------------------- card column */}
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <TiltCard className="mx-auto w-64 sm:w-72">
          <PlayerCard card={toCardData(card)} className="hover:translate-y-0" />
        </TiltCard>

        <div className="rounded-2xl border bg-card/70 p-4 text-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rarity</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", style.chip)}>{style.label}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-muted-foreground">Market value</span>
            <Coins amount={card.market_price ?? 0} className="text-gold" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-muted-foreground">In your collection</span>
            <span className="font-semibold">
              {copies.length === 0 ? "Not owned" : `${copies.length} ${copies.length === 1 ? "copy" : "copies"}`}
              {copies.some((c) => c.is_starter) && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-black text-primary-foreground">XI</span>}
            </span>
          </div>
        </div>

        <Link href={`/players/compare?ids=${card.card_id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2")}>
          <GitCompareArrows className="size-4" /> Compare with…
        </Link>
      </div>

      {/* --------------------------------------------------------- info column */}
      <div className="min-w-0 space-y-4 sm:space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {style.label} · {position} · {card.overall} overall
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{card.display_name}</h1>
          <p className="mt-1 text-muted-foreground">
            {card.known_as ? `${card.first_name} ${card.last_name} · ` : ""}
            {countryName(card.nationality ?? "")} · {card.club}
          </p>
        </header>

        <Panel title="Attributes">
          <AttributeMeters position={position} stats={card} />
        </Panel>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
          <Panel title="Player info">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Biography">
            <p className="text-sm leading-relaxed text-muted-foreground">{card.biography}</p>
            {card.is_fictional && (
              <p className="mt-4 text-[11px] text-muted-foreground/70">Fictional player created for Football Legends.</p>
            )}
          </Panel>
        </div>

        <Panel title="Career">
          {career.length === 0 ? (
            <p className="text-sm text-muted-foreground">No career history recorded.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Years</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Club</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Apps</th>
                    <th scope="col" className="py-2 text-right font-medium">Goals</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {career.map((c) => (
                    <tr key={`${c.from}-${c.club}`}>
                      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">{c.from}–{c.to}</td>
                      <td className="py-2.5 pr-4 font-medium">{c.club}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatNumber(c.appearances)}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatNumber(c.goals)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <th scope="row" colSpan={2} className="py-2.5 text-left">Total</th>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatNumber(totals.apps)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(totals.goals)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:gap-8" aria-busy="true" aria-label="Loading player">
      <Skeleton className="mx-auto aspect-[5/7] w-64 rounded-2xl sm:w-72" />
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
