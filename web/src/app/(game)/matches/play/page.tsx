import { ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/dashboard/panel";
import { PlayMatch } from "@/components/play/play-match";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getFormations, getSquadCards, getSquads } from "@/lib/data/team";
import { getViewer } from "@/lib/data/viewer";
import { generateOpponent } from "@/lib/engine/opponent";
import { randomSeed } from "@/lib/engine/rng";
import { buildTeamSheet } from "@/lib/engine/team-sheet";
import { buildPlaySetup } from "@/lib/play/setup";

export const metadata: Metadata = { title: "Play it yourself" };

export default function PlayPage() {
  return (
    <div className="space-y-4">
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Match Centre
      </Link>
      <Suspense fallback={<Skeleton className="aspect-video w-full rounded-2xl" />}>
        <PlayContent />
      </Suspense>
    </div>
  );
}

async function PlayContent() {
  const viewer = await getViewer();
  const [squads, formations, cards] = await Promise.all([getSquads(viewer.userId), getFormations(), getSquadCards(viewer.userId)]);
  const squad = squads.find((s) => s.isActive) ?? squads[0];
  const built = squad ? buildTeamSheet(squad, formations[squad.formation] ?? [], cards, squad.tactic) : null;

  if (!squad || !built?.ok) {
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title="Complete your starting XI first"
        body="You need 11 players in your active squad to play a match."
        action={<Link href="/team" className={buttonVariants()}>Open the team builder</Link>}
      />
    );
  }

  // A fresh opponent around your level for every match.
  const seed = randomSeed();
  const away = generateOpponent(seed, built.overall);
  const setup = buildPlaySetup({
    seed,
    home: built.sheet,
    homeSlots: formations[squad.formation] ?? [],
    homeKit: { primary: squad.primaryColor, secondary: squad.secondaryColor },
    away,
    awaySlots: formations[away.formation] ?? [],
  });

  return <PlayMatch setup={setup} />;
}
