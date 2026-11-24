import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CollectionFilters } from "@/components/collection/collection-filters";
import { EmptyState } from "@/components/dashboard/panel";
import { PlayerCard } from "@/components/game/player-card";
import { MarketHeader } from "@/components/market/market-tabs";
import { BuyButton } from "@/components/market/purchase-buttons";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarket } from "@/lib/data/market";
import { getViewer } from "@/lib/data/viewer";
import { toCardData } from "@/lib/game/player";
import { cn } from "@/lib/utils";
import { marketFiltersToQuery, parseMarketFilters } from "@/lib/validation/market";

export const metadata: Metadata = { title: "Marketplace" };

export default function MarketplacePage({ searchParams }: PageProps<"/marketplace">) {
  return (
    <div className="group/collection space-y-4 sm:space-y-6">
      <Suspense fallback={<MarketSkeleton />}>
        <MarketContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MarketContent({ searchParams }: Pick<PageProps<"/marketplace">, "searchParams">) {
  const viewer = await getViewer();
  const filters = parseMarketFilters(await searchParams);
  const data = await getMarket(viewer.userId, filters);
  const pageHref = (page: number) => `/marketplace${marketFiltersToQuery({ ...filters, page })}`;

  return (
    <>
      <MarketHeader active="/marketplace" balance={viewer.balance} />
      <CollectionFilters kind="market" filters={filters} nations={data.nations} />

      <div className="transition-opacity group-has-[form[aria-busy=true]]/collection:opacity-50">
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">{`${data.total} players for sale`}</p>
        {data.cards.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="No players match"
            body="Try a lower rating or a different position."
            action={<Link href="/marketplace" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-2")}>Clear filters</Link>}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6">
            {data.cards.map((c) => (
              <li key={c.card_id} className="relative flex flex-col gap-2">
                <Link href={`/players/${c.card_id}`} className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring" aria-label={`View ${c.display_name}`}>
                  <PlayerCard card={toCardData(c)} />
                </Link>
                {c.owned > 0 && (
                  <span className="pointer-events-none absolute -right-1 -top-1 rounded-md bg-sky-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow" title="Copies you own">
                    Owned ×{c.owned}
                  </span>
                )}
                <BuyButton cardId={c.card_id} name={c.display_name ?? "this player"} price={c.market_price} balance={viewer.balance} compact />
              </li>
            ))}
          </ul>
        )}

        {data.pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3">
            <Link href={pageHref(filters.page - 1)} aria-disabled={filters.page <= 1} className={cn(buttonVariants({ variant: "outline", size: "sm" }), filters.page <= 1 && "pointer-events-none opacity-40")}>
              <ChevronLeft className="size-4" /> Previous
            </Link>
            <span className="text-sm tabular-nums text-muted-foreground">Page {filters.page} of {data.pageCount}</span>
            <Link href={pageHref(filters.page + 1)} aria-disabled={filters.page >= data.pageCount} className={cn(buttonVariants({ variant: "outline", size: "sm" }), filters.page >= data.pageCount && "pointer-events-none opacity-40")}>
              Next <ChevronRight className="size-4" />
            </Link>
          </nav>
        )}
      </div>
    </>
  );
}

function MarketSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading marketplace">
      <Skeleton className="h-16 w-72 rounded-xl" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[5/8] rounded-2xl" />)}
      </div>
    </div>
  );
}
