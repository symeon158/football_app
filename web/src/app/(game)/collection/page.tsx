import { ChevronLeft, ChevronRight, Layers, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CollectionFilters } from "@/components/collection/collection-filters";
import { EmptyState } from "@/components/dashboard/panel";
import { PlayerCard } from "@/components/game/player-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCollection } from "@/lib/data/collection";
import { getViewer } from "@/lib/data/viewer";
import { toCardData } from "@/lib/game/player";
import { RARITIES, RARITY_STYLE } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";
import { filtersToQuery, parseCollectionFilters } from "@/lib/validation/collection";

export const metadata: Metadata = { title: "My Collection" };

export default function CollectionPage({ searchParams }: PageProps<"/collection">) {
  return (
    <div className="group/collection space-y-4 sm:space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">My player collection</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Collection</h1>
        </div>
        <Link href="/players/compare" className={cn(buttonVariants({ variant: "outline" }))}>
          Compare players
        </Link>
      </header>
      <Suspense fallback={<CollectionSkeleton />}>
        <CollectionContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CollectionContent({ searchParams }: Pick<PageProps<"/collection">, "searchParams">) {
  const viewer = await getViewer();
  const filters = parseCollectionFilters(await searchParams);
  const data = await getCollection(viewer.userId, filters);
  const pageHref = (page: number) => `/collection${filtersToQuery({ ...filters, page })}`;

  return (
    <>
      {/* Summary: totals + one chip per rarity (each is a filter shortcut) */}
      <section aria-label="Collection summary" className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{data.stats.owned}</span> cards ·{" "}
          <span className="font-semibold text-foreground">{data.stats.uniquePlayers}</span> unique players
        </p>
        {RARITIES.map((r) => {
          const selected = filters.rarity === r;
          return (
            <Link
              key={r}
              href={`/collection${filtersToQuery({ ...filters, rarity: selected ? undefined : r, page: 1 })}`}
              aria-pressed={selected}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
                RARITY_STYLE[r].chip,
                selected ? "ring-2" : "opacity-80 hover:opacity-100",
                data.stats.rarityCounts[r] === 0 && "opacity-40",
              )}
            >
              {RARITY_STYLE[r].label} <span className="tabular-nums">{data.stats.rarityCounts[r]}</span>
            </Link>
          );
        })}
      </section>

      <CollectionFilters filters={filters} nations={data.nations} />

      <div className="transition-opacity group-has-[form[aria-busy=true]]/collection:opacity-50">
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {data.total === data.stats.owned ? `Showing all ${data.total} cards` : `${data.total} of ${data.stats.owned} cards match`}
        </p>

        {data.stats.owned === 0 ? (
          <EmptyState icon={<Layers className="size-5" />} title="Your collection is empty" body="Cards you earn and buy will appear here." />
        ) : data.cards.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="No cards match these filters"
            body="Try a different name, position or rarity."
            action={<Link href="/collection" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-2")}>Clear filters</Link>}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6">
            {data.cards.map((c) => (
              <li key={c.ownership_id} className="relative">
                <Link
                  href={`/players/${c.card_id}`}
                  className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  aria-label={`View ${c.display_name}`}
                >
                  <PlayerCard card={toCardData(c)} />
                </Link>
                {c.is_starter && (
                  <span className="pointer-events-none absolute -right-1 -top-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-black text-primary-foreground shadow" title="In your starting XI">
                    XI
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {data.pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3">
            <Link
              href={pageHref(filters.page - 1)}
              aria-disabled={filters.page <= 1}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), filters.page <= 1 && "pointer-events-none opacity-40")}
            >
              <ChevronLeft className="size-4" /> Previous
            </Link>
            <span className="text-sm tabular-nums text-muted-foreground">
              Page {filters.page} of {data.pageCount}
            </span>
            <Link
              href={pageHref(filters.page + 1)}
              aria-disabled={filters.page >= data.pageCount}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), filters.page >= data.pageCount && "pointer-events-none opacity-40")}
            >
              Next <ChevronRight className="size-4" />
            </Link>
          </nav>
        )}
      </div>
    </>
  );
}

function CollectionSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading your collection">
      <Skeleton className="h-7 w-96 max-w-full rounded-full" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[5/7] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
