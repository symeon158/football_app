import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MatchViewer } from "@/components/match/match-viewer";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMatch } from "@/lib/data/matches";
import { getViewer } from "@/lib/data/viewer";
import { levelForXp } from "@/lib/game/progression";
import { cn } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation/collection";

export const metadata: Metadata = { title: "Match" };

export default function MatchPage({ params, searchParams }: PageProps<"/matches/[id]">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Match Centre
      </Link>
      <Suspense fallback={<Skeleton className="h-[36rem] rounded-3xl" />}>
        <MatchContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MatchContent({ params, searchParams }: Pick<PageProps<"/matches/[id]">, "params" | "searchParams">) {
  const viewer = await getViewer();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const match = await getMatch(id); // RLS: own matches only
  if (!match) notFound();
  const live = (await searchParams).live === "1";

  // Level-up banner only for the match that caused it (the latest XP gain).
  const levelBefore = levelForXp(viewer.xp - match.xp_gained);
  const levelUp = live && match.xp_gained > 0 && viewer.level > levelBefore ? viewer.level : null;

  return (
    <>
      <MatchViewer
        homeName={match.homeName}
        awayName={match.opponent_name}
        events={match.events.map((e) => ({ seq: e.seq, minute: e.minute, type: e.event_type, side: e.side, player: e.player_name, assist: e.assist_player_name, detail: e.detail }))}
        stats={{ home: match.stats.home, away: match.stats.away }}
        ratings={match.stats.ratings}
        manOfTheMatch={match.stats.manOfTheMatch}
        rewards={{ coins: match.reward_coins, xp: match.xp_gained, rewarded: match.rewarded }}
        levelUp={levelUp}
        live={live}
      />

      <section aria-label="Match details" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="capitalize">{match.difficulty} · {match.tactic}</span>
        <span>{match.stats.homeFormation} vs {match.stats.awayFormation}</span>
        <span>Your rating {match.stats.homeOverall} · chemistry {match.stats.homeChemistry} · opponent {match.opponent_rating}</span>
        <span>Home advantage +{match.stats.homeBonusPct}%</span>
        {match.verification === "verified" ? (
          <span className="flex items-center gap-1 text-primary" title={`Re-simulated from seed ${match.seed} with engine ${match.engine_version}: identical result`}>
            <ShieldCheck className="size-3.5" /> Verified replay (seed {match.seed})
          </span>
        ) : match.verification === "other-version" ? (
          <span>Played on engine {match.engine_version}</span>
        ) : (
          <span className="flex items-center gap-1 text-destructive"><ShieldAlert className="size-3.5" /> Replay mismatch</span>
        )}
        <Link href="/matches" className={cn(buttonVariants({ size: "sm" }), "ml-auto")}>Play again</Link>
      </section>
    </>
  );
}
