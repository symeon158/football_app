import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PackReveal } from "@/components/market/pack-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { getOpening } from "@/lib/data/market";
import { getViewer } from "@/lib/data/viewer";
import { uuidSchema } from "@/lib/validation/collection";

export const metadata: Metadata = { title: "Pack opening" };

export default function OpeningPage({ params }: PageProps<"/marketplace/packs/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/marketplace/packs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Packs
      </Link>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl rounded-2xl" />}>
        <OpeningContent params={params} />
      </Suspense>
    </div>
  );
}

async function OpeningContent({ params }: Pick<PageProps<"/marketplace/packs/[id]">, "params">) {
  await getViewer();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const opening = await getOpening(id); // RLS: only the owner can read it
  if (!opening) notFound();

  return (
    <>
      <header className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Pack opened</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{opening.pack.name}</h1>
      </header>
      <PackReveal
        packName={opening.pack.name}
        cards={opening.cards.map((c) => ({
          ownershipId: c.id,
          cardId: c.card.id,
          data: { ...c.card, player: c.card.player },
        }))}
      />
    </>
  );
}
