import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Panel } from "@/components/dashboard/panel";
import { CoinIcon } from "@/components/game/coins";
import { MarketHeader } from "@/components/market/market-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransactions } from "@/lib/data/market";
import { getViewer } from "@/lib/data/viewer";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Coin history" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default function HistoryPage({ searchParams }: PageProps<"/marketplace/history">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <HistoryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HistoryContent({ searchParams }: Pick<PageProps<"/marketplace/history">, "searchParams">) {
  const viewer = await getViewer();
  const raw = Number((await searchParams).page);
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 1000 ? raw : 1;
  const { rows, pageCount } = await getTransactions(viewer.userId, page);

  return (
    <>
      <MarketHeader active="/marketplace/history" balance={viewer.balance} />
      <Panel title="Every Football Coin movement">
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">An append-only ledger: entries can never be edited or removed.</p>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Date (UTC)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Description</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
                <th scope="col" className="py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">{dateFmt.format(new Date(r.created_at))}</td>
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{r.label}</span>
                    {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                  </td>
                  <td className={cn("py-2.5 pr-4 text-right font-semibold tabular-nums", r.amount > 0 ? "text-primary" : "text-foreground")}>
                    {r.amount > 0 ? "+" : "−"}{formatNumber(Math.abs(r.amount))}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1"><CoinIcon className="size-3.5" />{formatNumber(r.balance_after)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3">
            <Link href={`/marketplace/history?page=${page - 1}`} aria-disabled={page <= 1} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-40")}>
              <ChevronLeft className="size-4" /> Newer
            </Link>
            <span className="text-sm tabular-nums text-muted-foreground">Page {page} of {pageCount}</span>
            <Link href={`/marketplace/history?page=${page + 1}`} aria-disabled={page >= pageCount} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pageCount && "pointer-events-none opacity-40")}>
              Older <ChevronRight className="size-4" />
            </Link>
          </nav>
        )}
      </Panel>
    </>
  );
}
