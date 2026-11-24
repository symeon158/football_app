import type { Metadata } from "next";
import { Suspense } from "react";

import { ClubManager } from "@/components/team/club-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { getFormations, getSquadCards, getSquads, squadSummaries } from "@/lib/data/team";
import { getViewer } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "My Club" };

export default function ClubPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">My club</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Squads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save up to five squads with their own name, crest and colours. The active squad plays your matches.
        </p>
      </header>
      <Suspense fallback={<ClubSkeleton />}>
        <ClubContent />
      </Suspense>
    </div>
  );
}

async function ClubContent() {
  const viewer = await getViewer();
  const [squads, formations, cards] = await Promise.all([getSquads(viewer.userId), getFormations(), getSquadCards(viewer.userId)]);
  const stats = squadSummaries(squads, formations, cards);
  return (
    <ClubManager
      squads={squads.map((s) => ({
        id: s.id,
        name: s.name,
        logoTemplate: s.logoTemplate,
        primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor,
        formation: s.formation,
        tactic: s.tactic,
        isActive: s.isActive,
        ...stats.get(s.id)!,
      }))}
    />
  );
}

function ClubSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading squads">
      {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
    </div>
  );
}
