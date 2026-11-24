import { Settings2, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Crest } from "@/components/game/crest";
import { TeamBuilder } from "@/components/team/team-builder";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getFormations, getSquadCards, getSquads } from "@/lib/data/team";
import { getViewer } from "@/lib/data/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team Builder" };

export default function TeamPage({ searchParams }: PageProps<"/team">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Team builder</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pick your XI</h1>
        </div>
        <Link href="/club" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
          <Settings2 className="size-4" /> Manage squads
        </Link>
      </header>
      <Suspense fallback={<BuilderSkeleton />}>
        <TeamContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TeamContent({ searchParams }: Pick<PageProps<"/team">, "searchParams">) {
  const viewer = await getViewer();
  const params = await searchParams;
  const [squads, formations, cards] = await Promise.all([getSquads(viewer.userId), getFormations(), getSquadCards(viewer.userId)]);
  const requested = typeof params.team === "string" ? params.team : undefined;
  const team = squads.find((s) => s.id === requested) ?? squads.find((s) => s.isActive) ?? squads[0];

  if (!team) {
    return <p className="text-muted-foreground">You have no squads yet. <Link href="/club" className="text-primary underline">Create one</Link>.</p>;
  }

  return (
    <>
      {squads.length > 1 && (
        <nav aria-label="Squads" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {squads.map((s) => (
            <Link
              key={s.id}
              href={`/team?team=${s.id}`}
              aria-current={s.id === team.id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                s.id === team.id ? "border-primary/60 bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Crest template={s.logoTemplate} primary={s.primaryColor} secondary={s.secondaryColor} name={s.name} className="size-5" />
              {s.name}
              {s.isActive && <Star className="size-3.5 fill-gold text-gold" aria-label="active squad" />}
            </Link>
          ))}
        </nav>
      )}
      <TeamBuilder
        // Remount only when switching squads. After a save, local state already
        // equals the refreshed `initial`, so the editor simply becomes clean —
        // remounting here would wipe the "Line-up saved." confirmation.
        key={team.id}
        teamId={team.id}
        initial={{ formation: team.formation, tactic: team.tactic, captain: team.captain, lineup: team.lineup }}
        formations={formations}
        cards={cards}
      />
    </>
  );
}

function BuilderSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6" aria-busy="true" aria-label="Loading team builder">
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="mx-auto aspect-[68/100] w-full max-w-xl rounded-3xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
